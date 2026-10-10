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
import { parseStudioThemeId, studioThemeId, type ThemePackage, type ThemeValidation } from "./types";
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
  isActive: boolean; // restaurants.themeId === studio:<id>
  updatedAt: Date;
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

function toSummary(t: ThemeRow, activeThemeId: string | null | undefined): ThemeSummary {
  return {
    id: t.id,
    restaurantId: t.restaurantId,
    name: t.name,
    description: t.description,
    origin: t.origin,
    currentVersionId: t.currentVersionId,
    publishedVersionId: t.publishedVersionId,
    isActive: parseStudioThemeId(activeThemeId) === t.id,
    updatedAt: t.updatedAt,
  };
}

async function restaurantRow(restaurantId: string) {
  if (!UUID.test(restaurantId)) throw new AppError("notFound");
  const [r] = await db.select({ id: restaurants.id, plan: restaurants.plan, themeId: restaurants.themeId }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) throw new AppError("notFound");
  return r;
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

export async function listThemes(restaurantId: string): Promise<{ own: ThemeSummary[]; library: ThemeSummary[] }> {
  const r = await restaurantRow(restaurantId);
  const rows = await db
    .select()
    .from(themes)
    .where(or(eq(themes.restaurantId, restaurantId), isNull(themes.restaurantId)))
    .orderBy(desc(themes.updatedAt));
  return {
    own: rows.filter((t) => t.restaurantId === restaurantId).map((t) => toSummary(t, r.themeId)),
    library: rows
      .filter((t) => t.restaurantId === null)
      .sort((a, b) => starterOrder(a.name) - starterOrder(b.name) || a.name.localeCompare(b.name))
      .map((t) => toSummary(t, r.themeId)),
  };
}

const starterOrder = (name: string) => {
  const i = STARTER_THEMES.findIndex((s) => s.name === name);
  return i < 0 ? 99 : i;
};

/** Theme + package of a version (default: latest saved = currentVersionId). Own or library themes. */
export async function getThemeWithPackage(restaurantId: string, themeId: string, versionId?: string): Promise<{ theme: ThemeSummary; versionId: string; pkg: ThemePackage }> {
  const r = await restaurantRow(restaurantId);
  const t = await themeRow(restaurantId, themeId, "read");
  const vid = versionId ?? t.currentVersionId;
  if (!vid) throw new AppError("notFound");
  return { theme: toSummary(t, r.themeId), versionId: vid, pkg: await versionPackage(t.id, vid) };
}

/** Published package of the restaurant's ACTIVE studio theme (guest runtime). null → fall back to built-in. */
export async function getActiveStudioTheme(restaurantId: string, activeThemeId: string | null | undefined): Promise<{ themeId: string; versionId: string; pkg: ThemePackage } | null> {
  const themeId = parseStudioThemeId(activeThemeId);
  if (!themeId || !UUID.test(themeId)) return null;
  const [t] = await db
    .select({ id: themes.id, publishedVersionId: themes.publishedVersionId })
    .from(themes)
    .where(and(eq(themes.id, themeId), or(eq(themes.restaurantId, restaurantId), isNull(themes.restaurantId))))
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
}): Promise<{ themeId: string; versionId: string; validation: ThemeValidation }> {
  await assertThemeStudio(opts.restaurantId);
  const validation = assertValid(opts.pkg);
  const name = opts.name.trim().slice(0, 80) || opts.pkg.manifest.name;
  const res = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(themes)
      .values({
        restaurantId: opts.restaurantId,
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
    await audit({ restaurantId: opts.restaurantId, userId: opts.userId, action: "theme.create", entityType: "theme", entityId: t.id, data: { name, origin: opts.origin } }, tx);
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
 */
export async function publishTheme(opts: { restaurantId: string; themeId: string; versionId: string; userId: string }): Promise<void> {
  await assertThemeStudio(opts.restaurantId);
  const t = await themeRow(opts.restaurantId, opts.themeId, "write");
  assertValid(await versionPackage(t.id, opts.versionId)); // version belongs to theme + still valid
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
  if (parseStudioThemeId(r.themeId) === t.id) throw new AppError("validation", "theme_active");
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
  let created = 0;
  let updated = 0;
  for (const s of STARTER_THEMES) {
    assertValid(s.pkg);
    const description = s.description.de ?? s.description.en ?? null;
    const [existing] = await db
      .select()
      .from(themes)
      .where(and(isNull(themes.restaurantId), eq(themes.origin, "starter"), eq(themes.name, s.name)))
      .limit(1);
    if (!existing) {
      await db.transaction(async (tx) => {
        const [t] = await tx.insert(themes).values({ restaurantId: null, name: s.name, description, origin: "starter" }).returning({ id: themes.id });
        const [v] = await tx.insert(themeVersions).values({ themeId: t.id, number: 1, package: s.pkg, note: `Starter ${s.key}`, author: "system" }).returning({ id: themeVersions.id });
        await tx.update(themes).set({ currentVersionId: v.id, publishedVersionId: v.id }).where(eq(themes.id, t.id));
      });
      created++;
      continue;
    }
    const current = existing.currentVersionId ? await versionPackage(existing.id, existing.currentVersionId).catch(() => null) : null;
    if (current && JSON.stringify(current) === JSON.stringify(s.pkg)) continue;
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
