import "server-only";
/**
 * Server-side theme storage. All functions enforce restaurant scoping: a restaurant may READ its own themes
 * + library themes (restaurant_id IS NULL) and WRITE only its own. Packages are validated on every write.
 * Permission checks (theme.manage) are the caller's job (server actions); plan gating: assertThemeStudio().
 */
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { media, restaurants, themeVersions, themes } from "@/core/db/schema";
import { audit } from "@/core/audit";
import { AppError } from "@/core/http/errors";
import { mediaSrc } from "@/core/storage/media";
import { planHas } from "@/modules/billing/plans";
import { STARTER_THEMES } from "@/themes/starters/index.generated";
import { PRINT_STARTERS } from "@/themes/print-starters/index.generated";
import { parseStudioThemeId, studioThemeId, type ThemeKind, type ThemePackage, type ThemeValidation } from "./types";
import { validatePackage } from "./validate";
import { resolveSettings } from "./settings";
import type { ThemeMediaRef } from "./liquid";

export type ThemeSummary = {
  id: string;
  restaurantId: string | null;
  name: string;
  description: string | null;
  origin: string;
  currentVersionId: string | null;
  publishedVersionId: string | null;
  isActive: boolean; // menu: restaurants.themeId === studio:<id> · print: settings.print.themeId === id
  updatedAt: Date;
  /** additive: "menu" | "print" */
  kind: ThemeKind;
};
export type ThemeVersionSummary = { id: string; number: number; note: string | null; author: string; createdAt: Date };

/** Thrown when a package does not validate (code "validation", detail = first error). */
export class ThemeValidationError extends AppError {
  constructor(public validation: ThemeValidation) {
    const e = validation.errors[0];
    super("validation", e ? `${e.file ? `${e.file}${e.line ? `:${e.line}` : ""}: ` : ""}${e.message}` : "invalid theme package");
    this.name = "ThemeValidationError";
  }
}

type ThemeRow = typeof themes.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rowKind = (k: string | null | undefined): ThemeKind => (k === "print" ? "print" : "menu");
const pkgKind = (pkg: ThemePackage | null | undefined): ThemeKind => (pkg?.manifest?.kind === "print" ? "print" : "menu");

type RestaurantRow = { id: string; plan: string; themeId: string; settings: { print?: { themeId?: string | null; config?: Record<string, unknown> } } | null };

function toSummary(t: ThemeRow, r: Pick<RestaurantRow, "themeId" | "settings"> | string | null | undefined): ThemeSummary {
  const activeThemeId = typeof r === "object" && r ? r.themeId : r;
  const printThemeId = typeof r === "object" && r ? (r.settings?.print?.themeId ?? null) : null;
  const kind = rowKind(t.kind);
  return {
    id: t.id,
    restaurantId: t.restaurantId,
    name: t.name,
    description: t.description,
    origin: t.origin,
    currentVersionId: t.currentVersionId,
    publishedVersionId: t.publishedVersionId,
    isActive: kind === "print" ? printThemeId === t.id : parseStudioThemeId(activeThemeId) === t.id,
    updatedAt: t.updatedAt,
    kind,
  };
}

async function restaurantRow(restaurantId: string): Promise<RestaurantRow> {
  if (!UUID.test(restaurantId)) throw new AppError("notFound");
  const [r] = await db
    .select({ id: restaurants.id, plan: restaurants.plan, themeId: restaurants.themeId, settings: restaurants.settings })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!r) throw new AppError("notFound");
  return r as RestaurantRow;
}

/** Plan gating for Theme Studio (custom code themes + AI theme generation). Throws AppError("featureNotInPlan"). */
export async function assertThemeStudio(restaurantId: string): Promise<void> {
  const r = await restaurantRow(restaurantId);
  if (!planHas(r.plan, "theme_studio")) throw new AppError("featureNotInPlan", "theme_studio");
}

/** Theme row visible to the restaurant (own or library); `write` → own only. */
async function themeRow(restaurantId: string, themeId: string, mode: "read" | "write"): Promise<ThemeRow> {
  if (!UUID.test(themeId)) throw new AppError("notFound");
  const scope = mode === "write" ? eq(themes.restaurantId, restaurantId) : or(eq(themes.restaurantId, restaurantId), isNull(themes.restaurantId));
  const [t] = await db.select().from(themes).where(and(eq(themes.id, themeId), scope)).limit(1);
  if (!t) throw new AppError("notFound");
  return t;
}

// ---- immutable versions → tiny in-process cache (guest frame hot path)
const g = globalThis as unknown as { __vmThemeVersionCache?: Map<string, { themeId: string; pkg: ThemePackage }> };
const versionCache = (g.__vmThemeVersionCache ??= new Map());

async function versionPackage(themeId: string, versionId: string): Promise<ThemePackage> {
  if (!UUID.test(versionId)) throw new AppError("notFound");
  const hit = versionCache.get(versionId);
  if (hit && hit.themeId === themeId) return structuredClone(hit.pkg);
  const [v] = await db
    .select({ themeId: themeVersions.themeId, pkg: themeVersions.package })
    .from(themeVersions)
    .where(and(eq(themeVersions.id, versionId), eq(themeVersions.themeId, themeId)))
    .limit(1);
  if (!v) throw new AppError("notFound");
  const pkg = v.pkg as ThemePackage;
  versionCache.set(versionId, { themeId, pkg });
  if (versionCache.size > 200) versionCache.delete(versionCache.keys().next().value!);
  return structuredClone(pkg);
}

function assertValid(pkg: ThemePackage): ThemeValidation {
  const validation = validatePackage(pkg);
  if (!validation.ok) throw new ThemeValidationError(validation);
  return validation;
}

const cleanPkg = (pkg: ThemePackage): ThemePackage => ({ manifest: pkg.manifest, files: { ...pkg.files } });

// ---------------------------------------------------------------- read

/** Own + library themes of one kind (default "menu" – print designs are listed separately). */
export async function listThemes(restaurantId: string, kind: ThemeKind = "menu"): Promise<{ own: ThemeSummary[]; library: ThemeSummary[] }> {
  const r = await restaurantRow(restaurantId);
  const rows = await db
    .select()
    .from(themes)
    .where(and(or(eq(themes.restaurantId, restaurantId), isNull(themes.restaurantId)), eq(themes.kind, kind)))
    .orderBy(desc(themes.updatedAt));
  return {
    own: rows.filter((t) => t.restaurantId === restaurantId).map((t) => toSummary(t, r)),
    library: rows
      .filter((t) => t.restaurantId === null)
      .sort((a, b) => starterOrder(a.name, kind) - starterOrder(b.name, kind) || a.name.localeCompare(b.name))
      .map((t) => toSummary(t, r)),
  };
}

const starterOrder = (name: string, kind: ThemeKind = "menu") => {
  const i = (kind === "print" ? PRINT_STARTERS : STARTER_THEMES).findIndex((s) => s.name === name);
  return i < 0 ? 99 : i;
};

/** Theme + package of a version (default: latest saved = currentVersionId). Own or library themes. */
export async function getThemeWithPackage(restaurantId: string, themeId: string, versionId?: string): Promise<{ theme: ThemeSummary; versionId: string; pkg: ThemePackage }> {
  const r = await restaurantRow(restaurantId);
  const t = await themeRow(restaurantId, themeId, "read");
  const vid = versionId ?? t.currentVersionId;
  if (!vid) throw new AppError("notFound");
  return { theme: toSummary(t, r), versionId: vid, pkg: await versionPackage(t.id, vid) };
}

/** Published package of the restaurant's ACTIVE studio theme (guest runtime). null → fall back to built-in. */
export async function getActiveStudioTheme(restaurantId: string, activeThemeId: string | null | undefined): Promise<{ themeId: string; versionId: string; pkg: ThemePackage } | null> {
  const themeId = parseStudioThemeId(activeThemeId);
  if (!themeId || !UUID.test(themeId)) return null;
  const [t] = await db
    .select({ id: themes.id, publishedVersionId: themes.publishedVersionId })
    .from(themes)
    .where(and(eq(themes.id, themeId), eq(themes.kind, "menu"), or(eq(themes.restaurantId, restaurantId), isNull(themes.restaurantId))))
    .limit(1);
  if (!t?.publishedVersionId) return null;
  try {
    return { themeId: t.id, versionId: t.publishedVersionId, pkg: await versionPackage(t.id, t.publishedVersionId) };
  } catch {
    return null;
  }
}

export async function listThemeVersions(restaurantId: string, themeId: string): Promise<ThemeVersionSummary[]> {
  const t = await themeRow(restaurantId, themeId, "read");
  return db
    .select({ id: themeVersions.id, number: themeVersions.number, note: themeVersions.note, author: themeVersions.author, createdAt: themeVersions.createdAt })
    .from(themeVersions)
    .where(eq(themeVersions.themeId, t.id))
    .orderBy(desc(themeVersions.number));
}

/**
 * Media referenced by a package (manifest.assets + image settings) → URLs for renderThemeDocument({ media }).
 * Only the restaurant's own media and platform media are resolved.
 */
export async function resolveThemeMedia(restaurantId: string | null, pkg: ThemePackage, settings?: unknown): Promise<Record<string, ThemeMediaRef>> {
  const ids = new Set<string>(Object.values(pkg.manifest?.assets ?? {}).filter((x) => UUID.test(x)));
  const values = resolveSettings(pkg.manifest ?? { settings: [] }, settings ?? {});
  for (const f of pkg.manifest?.settings ?? []) if (f.type === "image" && typeof values[f.id] === "string") ids.add(values[f.id] as string);
  if (!ids.size) return {};
  const rows = await db
    .select({ id: media.id, storageKey: media.storageKey, variants: media.variants, mime: media.mime, restaurantId: media.restaurantId })
    .from(media)
    .where(and(inArray(media.id, [...ids]), restaurantId ? or(eq(media.restaurantId, restaurantId), isNull(media.restaurantId)) : isNull(media.restaurantId)));
  const out: Record<string, ThemeMediaRef> = {};
  for (const m of rows) {
    if (!m.mime.startsWith("image/")) continue;
    out[m.id] = { url: mediaSrc(m, "orig")!, sm: mediaSrc(m, "sm"), md: mediaSrc(m, "md") };
  }
  return out;
}

// ---------------------------------------------------------------- write

/** Validates, then creates theme + version 1. Throws ThemeValidationError for invalid packages. */
export async function createTheme(opts: {
  restaurantId: string;
  name: string;
  description?: string | null;
  pkg: ThemePackage;
  origin: "starter" | "ai_prompt" | "ai_file" | "manual" | "import" | "duplicate" | "library";
  parentThemeId?: string | null;
  userId: string;
  note?: string;
  /** additive: "menu" (default) | "print" – must match pkg.manifest.kind (inferred from it when omitted). */
  kind?: ThemeKind;
}): Promise<{ themeId: string; versionId: string; validation: ThemeValidation }> {
  await assertThemeStudio(opts.restaurantId);
  const kind = pkgKind(opts.pkg);
  if (opts.kind && opts.kind !== kind) throw new AppError("validation", "kind_mismatch");
  const validation = assertValid(opts.pkg);
  const name = opts.name.trim().slice(0, 80) || opts.pkg.manifest.name;
  const res = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(themes)
      .values({
        restaurantId: opts.restaurantId,
        kind,
        name,
        description: opts.description?.slice(0, 500) ?? null,
        origin: opts.origin,
        parentThemeId: opts.parentThemeId && UUID.test(opts.parentThemeId) ? opts.parentThemeId : null,
        createdBy: opts.userId,
      })
      .returning({ id: themes.id });
    const [v] = await tx
      .insert(themeVersions)
      .values({ themeId: t.id, number: 1, package: cleanPkg(opts.pkg), note: opts.note?.slice(0, 300) ?? null, author: opts.origin.startsWith("ai") ? "ai" : opts.origin === "import" ? "import" : "user", createdBy: opts.userId })
      .returning({ id: themeVersions.id });
    await tx.update(themes).set({ currentVersionId: v.id }).where(eq(themes.id, t.id));
    await audit({ restaurantId: opts.restaurantId, userId: opts.userId, action: "theme.create", entityType: "theme", entityId: t.id, data: { name, origin: opts.origin, kind } }, tx);
    return { themeId: t.id, versionId: v.id };
  });
  return { ...res, validation };
}

/** Validates and stores a new immutable version (becomes currentVersionId). Rejects invalid packages. */
export async function saveThemeVersion(opts: {
  restaurantId: string;
  themeId: string;
  pkg: ThemePackage;
  note?: string;
  author: "user" | "ai" | "import" | "system";
  userId: string;
}): Promise<{ versionId: string; number: number; validation: ThemeValidation }> {
  await assertThemeStudio(opts.restaurantId);
  const t = await themeRow(opts.restaurantId, opts.themeId, "write");
  if (pkgKind(opts.pkg) !== rowKind(t.kind)) throw new AppError("validation", "kind_mismatch");
  const validation = assertValid(opts.pkg);
  const res = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from ${themes} where id = ${t.id} for update`);
    const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${themeVersions.number}), 0)::int` }).from(themeVersions).where(eq(themeVersions.themeId, t.id));
    const number = Number(n) + 1;
    const [v] = await tx
      .insert(themeVersions)
      .values({ themeId: t.id, number, package: cleanPkg(opts.pkg), note: opts.note?.slice(0, 300) ?? null, author: opts.author, createdBy: opts.userId })
      .returning({ id: themeVersions.id });
    await tx.update(themes).set({ currentVersionId: v.id, updatedAt: new Date() }).where(eq(themes.id, t.id));
    return { versionId: v.id, number };
  });
  return { ...res, validation };
}

/**
 * Publishes a version and activates the theme for guests (restaurants.themeId = studio:<id>).
 * Only own themes – library themes are duplicated first (duplicateTheme → origin "library").
 * Print designs (kind "print") are selected for printing instead: settings.print = { themeId, config } (merged,
 * restaurants.themeId untouched). `config` (print only) = customizer values; omitted → keeps the stored values.
 */
export async function publishTheme(opts: { restaurantId: string; themeId: string; versionId: string; userId: string; config?: Record<string, unknown> }): Promise<void> {
  await assertThemeStudio(opts.restaurantId);
  const t = await themeRow(opts.restaurantId, opts.themeId, "write");
  const pkg = await versionPackage(t.id, opts.versionId);
  assertValid(pkg); // version belongs to theme + still valid
  if (rowKind(t.kind) === "print") {
    await db.transaction(async (tx) => {
      await tx.update(themes).set({ publishedVersionId: opts.versionId, updatedAt: new Date() }).where(eq(themes.id, t.id));
      await writePrintSelection(tx, opts.restaurantId, t.id, pkg, opts.config);
      await audit({ restaurantId: opts.restaurantId, userId: opts.userId, action: "print.publish", entityType: "theme", entityId: t.id, data: { versionId: opts.versionId, name: t.name } }, tx);
    });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(themes).set({ publishedVersionId: opts.versionId, updatedAt: new Date() }).where(eq(themes.id, t.id));
    await tx.update(restaurants).set({ themeId: studioThemeId(t.id), updatedAt: new Date() }).where(eq(restaurants.id, opts.restaurantId));
    await audit({ restaurantId: opts.restaurantId, userId: opts.userId, action: "theme.publish", entityType: "theme", entityId: t.id, data: { versionId: opts.versionId, name: t.name } }, tx);
  });
}

/** Copies the latest version of an own or library theme into a new own theme. */
export async function duplicateTheme(opts: { restaurantId: string; themeId: string; name?: string; userId: string }): Promise<{ themeId: string }> {
  const src = await themeRow(opts.restaurantId, opts.themeId, "read");
  if (!src.currentVersionId) throw new AppError("notFound");
  const pkg = await versionPackage(src.id, src.currentVersionId);
  const { themeId } = await createTheme({
    restaurantId: opts.restaurantId,
    name: opts.name?.trim() || (src.restaurantId ? `${src.name} (Kopie)` : src.name),
    description: src.description,
    pkg,
    origin: src.restaurantId ? "duplicate" : "library",
    parentThemeId: src.id,
    userId: opts.userId,
    note: src.restaurantId ? `Kopie von „${src.name}“` : `Aus der Bibliothek: ${src.name}`,
  });
  return { themeId };
}

/** Deletes an own theme (with versions). Refuses the active theme (AppError "validation", detail "theme_active"). */
export async function deleteTheme(restaurantId: string, themeId: string): Promise<void> {
  const r = await restaurantRow(restaurantId);
  const t = await themeRow(restaurantId, themeId, "write");
  if (parseStudioThemeId(r.themeId) === t.id || r.settings?.print?.themeId === t.id) throw new AppError("validation", "theme_active");
  await db.transaction(async (tx) => {
    await tx.delete(themes).where(and(eq(themes.id, t.id), eq(themes.restaurantId, restaurantId)));
    await audit({ restaurantId, action: "theme.delete", entityType: "theme", entityId: t.id, data: { name: t.name } }, tx);
  });
  if (t.publishedVersionId) versionCache.delete(t.publishedVersionId);
}

// ---------------------------------------------------------------- starters / library

/** Starter packages shipped with the app (seeded into the library). */
export async function getStarterPackages(): Promise<{ key: string; name: string; description: Record<string, string>; pkg: ThemePackage }[]> {
  return structuredClone(STARTER_THEMES);
}

/**
 * Idempotent: inserts the starter themes into the library (restaurant_id NULL, origin "starter"); when a
 * starter changed since the last seed, a new library version is stored (and published).
 */
export async function seedStarterThemes(): Promise<{ created: number; updated: number }> {
  return seedLibrary(STARTER_THEMES, "menu");
}

/** Idempotent: seeds the print starters (QR table cards, tents, posters) into the library (kind "print"). */
export async function seedPrintStarters(): Promise<{ created: number; updated: number }> {
  return seedLibrary(PRINT_STARTERS, "print");
}

/** Key-order independent JSON (Postgres jsonb does not keep key order). */
const canonicalJson = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : x,
  );

async function seedLibrary(starters: { key: string; name: string; description: Record<string, string>; pkg: ThemePackage }[], kind: ThemeKind): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const s of starters) {
    assertValid(s.pkg);
    const description = s.description.de ?? s.description.en ?? null;
    const [existing] = await db
      .select()
      .from(themes)
      .where(and(isNull(themes.restaurantId), eq(themes.origin, "starter"), eq(themes.kind, kind), eq(themes.name, s.name)))
      .limit(1);
    if (!existing) {
      await db.transaction(async (tx) => {
        const [t] = await tx.insert(themes).values({ restaurantId: null, kind, name: s.name, description, origin: "starter" }).returning({ id: themes.id });
        const [v] = await tx.insert(themeVersions).values({ themeId: t.id, number: 1, package: s.pkg, note: `Starter ${s.key}`, author: "system" }).returning({ id: themeVersions.id });
        await tx.update(themes).set({ currentVersionId: v.id, publishedVersionId: v.id }).where(eq(themes.id, t.id));
      });
      created++;
      continue;
    }
    const current = existing.currentVersionId ? await versionPackage(existing.id, existing.currentVersionId).catch(() => null) : null;
    if (current && canonicalJson(current) === canonicalJson(s.pkg)) continue; // jsonb reorders keys
    await db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`coalesce(max(${themeVersions.number}), 0)::int` }).from(themeVersions).where(eq(themeVersions.themeId, existing.id));
      const [v] = await tx
        .insert(themeVersions)
        .values({ themeId: existing.id, number: Number(n) + 1, package: s.pkg, note: `Starter ${s.key} (update)`, author: "system" })
        .returning({ id: themeVersions.id });
      await tx.update(themes).set({ currentVersionId: v.id, publishedVersionId: v.id, description, updatedAt: new Date() }).where(eq(themes.id, existing.id));
    });
    updated++;
  }
  return { created, updated };
}

// ---------------------------------------------------------------- print designs (kind "print") (docs/THEMES.md "Print designs")

export type PrintSelection = { themeId: string; config: Record<string, unknown> };
export type PrintDesign = { theme: ThemeSummary; versionId: string; pkg: ThemePackage };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** settings.print = { themeId, config } – merged into restaurants.settings (other keys untouched). */
async function writePrintSelection(tx: Tx | typeof db, restaurantId: string, themeId: string, pkg: ThemePackage, config: Record<string, unknown> | undefined) {
  let raw = config;
  if (raw === undefined) {
    const [r] = await tx.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
    const prev = (r?.settings as RestaurantRow["settings"])?.print;
    raw = prev?.themeId === themeId ? (prev.config ?? {}) : {};
  }
  const value = { themeId, config: resolveSettings(pkg.manifest, raw) };
  await tx
    .update(restaurants)
    .set({ settings: sql`coalesce(${restaurants.settings}, '{}'::jsonb) || jsonb_build_object('print', ${JSON.stringify(value)}::jsonb)`, updatedAt: new Date() })
    .where(eq(restaurants.id, restaurantId));
}

/** Version used for printing: explicit (must belong to the theme) → published → latest saved. */
function printVersionId(t: ThemeRow, versionId?: string | null): string | null {
  if (versionId) return versionId;
  return t.publishedVersionId ?? t.currentVersionId;
}

/** A print design (own or library) with the package that gets printed. Throws notFound for menu themes. */
export async function getPrintDesign(restaurantId: string, themeId: string, versionId?: string | null): Promise<PrintDesign> {
  const r = await restaurantRow(restaurantId);
  const t = await themeRow(restaurantId, themeId, "read");
  if (rowKind(t.kind) !== "print") throw new AppError("notFound");
  const vid = printVersionId(t, versionId);
  if (!vid) throw new AppError("notFound");
  return { theme: toSummary(t, r), versionId: vid, pkg: await versionPackage(t.id, vid) };
}

/** All print designs visible to the restaurant (library first in starter order, then own) with their print packages. */
export async function listPrintDesigns(restaurantId: string): Promise<{ own: PrintDesign[]; library: PrintDesign[] }> {
  const list = await listThemes(restaurantId, "print");
  const load = async (s: ThemeSummary): Promise<PrintDesign | null> => {
    const vid = s.publishedVersionId ?? s.currentVersionId;
    if (!vid) return null;
    try {
      return { theme: s, versionId: vid, pkg: await versionPackage(s.id, vid) };
    } catch {
      return null;
    }
  };
  const [own, library] = await Promise.all([Promise.all(list.own.map(load)), Promise.all(list.library.map(load))]);
  return { own: own.filter((x): x is PrintDesign => !!x), library: library.filter((x): x is PrintDesign => !!x) };
}

/** Stored print selection (settings.print) – null when none or the design is gone. */
export async function getPrintSelection(restaurantId: string): Promise<PrintSelection | null> {
  const r = await restaurantRow(restaurantId);
  const sel = r.settings?.print;
  if (!sel?.themeId || !UUID.test(sel.themeId)) return null;
  return { themeId: sel.themeId, config: sel.config && typeof sel.config === "object" ? sel.config : {} };
}

/**
 * Selects a print design (own or library – no Theme Studio plan needed, the owner only customises) and stores its
 * customizer values: settings.print = { themeId, config } (merged JSON, values validated against the manifest).
 */
export async function selectPrintDesign(opts: { restaurantId: string; themeId: string; config?: Record<string, unknown>; userId: string }): Promise<PrintSelection> {
  const design = await getPrintDesign(opts.restaurantId, opts.themeId);
  assertValid(design.pkg);
  await db.transaction(async (tx) => {
    await writePrintSelection(tx, opts.restaurantId, design.theme.id, design.pkg, opts.config);
    await audit({ restaurantId: opts.restaurantId, userId: opts.userId, action: "print.select", entityType: "theme", entityId: design.theme.id, data: { name: design.theme.name, config: opts.config !== undefined } }, tx);
  });
  return (await getPrintSelection(opts.restaurantId))!;
}

/** Print starter packages shipped with the app (seeded into the library). */
export async function getPrintStarterPackages(): Promise<{ key: string; name: string; description: Record<string, string>; pkg: ThemePackage }[]> {
  return structuredClone(PRINT_STARTERS);
}
