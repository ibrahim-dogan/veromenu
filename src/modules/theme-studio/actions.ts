"use server";
/**
 * Theme Studio server actions (restaurant scope). Menu themes: permission `theme.manage`; print designs (kind
 * "print", QR table cards): `tables.manage` or `theme.manage` (see ./access.ts). Always plan feature `theme_studio`.
 * Storage goes through theme-engine/service.ts (which enforces restaurant scoping + validation).
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { themes } from "@/core/db/schema";
import { aiTranscribe } from "@/core/ai";
import { audit } from "@/core/audit";
import { action, AppError } from "@/core/http/action";
import { serializePackage, validatePackage } from "@/modules/theme-engine";
import { parseStudioThemeId, THEME_LIMITS, type PrintFormat, type ThemeKind, type ThemePackage, type ThemeSettingField, type ThemeValidation } from "@/modules/theme-engine/types";
import { settingFields } from "@/modules/theme-engine/settings";
import {
  createTheme,
  deleteTheme,
  duplicateTheme,
  getPrintStarterPackages,
  getStarterPackages,
  getThemeWithPackage,
  listThemes,
  publishTheme,
  saveThemeVersion,
  selectPrintDesign,
} from "@/modules/theme-engine/service";
import { designAiContext, designContext } from "./access";
import { blankPackage, blankPrintPackage, exportFileName, parseVmTheme, sanitizeSettings } from "./lib/package";
import { packageKind, previewView, printPreviewSize, printPreviewViews, renderPreviewHtml, renderPrintPreviewHtml, writeThemeConfig } from "./service";

const rid = z.uuid();
const tid = z.uuid();
const name = z.string().trim().min(1).max(80);
const kindSchema = z.enum(["menu", "print"]);
const formatSchema = z.enum(["a6", "a6-landscape", "a5", "a5-landscape", "a4", "a4-landscape", "tent-a6"] satisfies [PrintFormat, ...PrintFormat[]]);

/** Loose shape check – the engine's validatePackage does the real validation. */
const pkgSchema = z.object({
  manifest: z.record(z.string(), z.unknown()),
  files: z.record(z.string().max(120), z.string().max(THEME_LIMITS.maxFileBytes)),
});
const asPkg = (p: z.infer<typeof pkgSchema>) => p as unknown as ThemePackage;

/** Permission by kind (create actions) or by the theme's kind (theme actions) + plan feature theme_studio. */
const studioContext = (restaurantId: string, target: ThemeKind | { themeId: string } = "menu") => designContext(restaurantId, target);

function invalid(validation: ThemeValidation): never {
  const detail = validation.errors.map((e) => `${e.file ?? ""}${e.line ? `:${e.line}` : ""} ${e.message}`.trim()).join("; ");
  throw new AppError("validation", detail.slice(0, 400));
}

// ------------------------------------------------------------------ create

export const createBlankThemeAction = action(
  z.object({ restaurantId: rid, name, kind: kindSchema.default("menu"), format: formatSchema.optional() }),
  async ({ restaurantId, name, kind, format }) => {
  const ctx = await studioContext(restaurantId, kind);
  const pkg = kind === "print" ? blankPrintPackage(name, format ?? "a6") : blankPackage(name);
  const res = await createTheme({ restaurantId, name, pkg, kind, origin: "manual", userId: ctx.user.id, note: "blank" });
  if (!res.validation.ok) invalid(res.validation);
  return { themeId: res.themeId };
  },
);

/** "Verwenden" on a library theme (or a shipped starter when the library is not seeded yet). */
export const adoptLibraryThemeAction = action(
  z.object({ restaurantId: rid, libraryThemeId: tid.optional(), starterKey: z.string().max(64).optional() }),
  async ({ restaurantId, libraryThemeId, starterKey }) => {
    const starter = !libraryThemeId && starterKey ? [...(await getStarterPackages()), ...(await getPrintStarterPackages())].find((x) => x.key === starterKey) : undefined;
    const ctx = await studioContext(restaurantId, libraryThemeId ? { themeId: libraryThemeId } : starter ? packageKind(starter.pkg) : "menu");
    let pkg: ThemePackage;
    let themeName: string;
    let description: string | null = null;
    let origin: "library" | "starter";
    let parentThemeId: string | null = null;
    if (libraryThemeId) {
      const lib = await getThemeWithPackage(restaurantId, libraryThemeId);
      if (lib.theme.restaurantId !== null) throw new AppError("notFound");
      pkg = lib.pkg;
      themeName = lib.theme.name;
      description = lib.theme.description;
      origin = lib.theme.origin === "starter" ? "starter" : "library";
      parentThemeId = lib.theme.id;
    } else if (starterKey) {
      const s = starter;
      if (!s) throw new AppError("notFound");
      pkg = s.pkg;
      themeName = s.name;
      description = s.description.de ?? null;
      origin = "starter";
    } else throw new AppError("validation");
    const res = await createTheme({ restaurantId, name: themeName, description, pkg, kind: packageKind(pkg), origin, parentThemeId, userId: ctx.user.id, note: origin });
    if (!res.validation.ok) invalid(res.validation);
    return { themeId: res.themeId, kind: packageKind(pkg) };
  },
);

/** Import a .vmtheme.json export. `kind` = what the caller expects (tables page → "print"); a mismatch is rejected. */
export const importThemeAction = action(z.object({ restaurantId: rid, json: z.string().min(2).max(6_000_000), kind: kindSchema.optional() }), async ({ restaurantId, json, kind }) => {
  let pkg: ThemePackage;
  try {
    pkg = parseVmTheme(json);
  } catch (e) {
    throw new AppError("validation", e instanceof Error ? e.message : "invalidFormat");
  }
  const pkgK = packageKind(pkg);
  if (kind && kind !== pkgK) throw new AppError("validation", pkgK === "print" ? "printDesignNotMenuTheme" : "menuThemeNotPrintDesign");
  const ctx = await studioContext(restaurantId, pkgK);
  const validation = validatePackage(pkg);
  if (!validation.ok) invalid(validation);
  const themeName = String(pkg.manifest.name || "Import").slice(0, 80);
  const res = await createTheme({ restaurantId, name: themeName, pkg, kind: pkgK, origin: "import", userId: ctx.user.id, note: "import" });
  return { themeId: res.themeId, kind: pkgK };
});

export const duplicateThemeAction = action(z.object({ restaurantId: rid, themeId: tid, name: name.optional() }), async ({ restaurantId, themeId, name }) => {
  const ctx = await studioContext(restaurantId, { themeId });
  const res = await duplicateTheme({ restaurantId, themeId, name, userId: ctx.user.id });
  return res;
});

export const deleteThemeAction = action(z.object({ restaurantId: rid, themeId: tid }), async ({ restaurantId, themeId }) => {
  const ctx = await studioContext(restaurantId, { themeId });
  // The active theme / the selected print design cannot be deleted – switch first.
  if (parseStudioThemeId(ctx.restaurant.themeId) === themeId || ctx.restaurant.settings?.print?.themeId === themeId) throw new AppError("validation", "theme is active");
  await deleteTheme(restaurantId, themeId);
  return { themeId };
});

export const renameThemeAction = action(
  z.object({ restaurantId: rid, themeId: tid, name, description: z.string().trim().max(300).nullable().optional() }),
  async ({ restaurantId, themeId, name, description }) => {
    const ctx = await studioContext(restaurantId, { themeId });
    const res = await db
      .update(themes)
      .set({ name, ...(description !== undefined ? { description } : {}), updatedAt: new Date() })
      .where(and(eq(themes.id, themeId), eq(themes.restaurantId, restaurantId)))
      .returning({ id: themes.id });
    if (!res.length) throw new AppError("notFound");
    await audit({ restaurantId, userId: ctx.user.id, action: "theme.rename", entityType: "theme", entityId: themeId, data: { name } });
    return { name };
  },
);

// ------------------------------------------------------------------ versions

/** Saves a new version. Invalid packages are NOT saved – the validation is returned for the editor. */
export const saveVersionAction = action(
  z.object({ restaurantId: rid, themeId: tid, pkg: pkgSchema, note: z.string().max(300).optional(), author: z.enum(["user", "ai"]).default("user") }),
  async ({ restaurantId, themeId, pkg, note, author }) => {
    const ctx = await studioContext(restaurantId, { themeId });
    const validation = validatePackage(asPkg(pkg));
    if (!validation.ok) return { saved: false as const, validation };
    const res = await saveThemeVersion({ restaurantId, themeId, pkg: asPkg(pkg), note, author, userId: ctx.user.id });
    await audit({ restaurantId, userId: ctx.user.id, action: "theme.version.save", entityType: "theme", entityId: themeId, data: { number: res.number, author } });
    return { saved: true as const, versionId: res.versionId, number: res.number, validation: res.validation };
  },
);

// Version list / single version / preview data / media are GET route handlers under
// src/app/api/restaurants/[rid]/themes/** – server actions are dispatched one at a time per client, so reads
// must not queue behind a long-running AI edit.

export const restoreVersionAction = action(
  z.object({ restaurantId: rid, themeId: tid, versionId: z.uuid(), note: z.string().max(300) }),
  async ({ restaurantId, themeId, versionId, note }) => {
    const ctx = await studioContext(restaurantId, { themeId });
    const { pkg } = await getThemeWithPackage(restaurantId, themeId, versionId);
    const res = await saveThemeVersion({ restaurantId, themeId, pkg, note, author: "user", userId: ctx.user.id });
    await audit({ restaurantId, userId: ctx.user.id, action: "theme.version.restore", entityType: "theme", entityId: themeId, data: { from: versionId, number: res.number } });
    return { versionId: res.versionId, number: res.number, pkg };
  },
);

// ------------------------------------------------------------------ publish + customizer

/** Publishes a version, activates it for guests and stores the customizer values as restaurants.themeConfig. */
export const publishThemeAction = action(
  z.object({ restaurantId: rid, themeId: tid, versionId: z.uuid(), settings: z.record(z.string(), z.unknown()).optional() }),
  async ({ restaurantId, themeId, versionId, settings }) => {
    const ctx = await studioContext(restaurantId, { themeId });
    const { theme, pkg } = await getThemeWithPackage(restaurantId, themeId, versionId);
    const validation = validatePackage(pkg);
    if (!validation.ok) invalid(validation);
    if (theme.kind === "print") {
      // "Als Druckdesign verwenden": settings.print = { themeId, config } – the guest menu theme stays untouched.
      const prev = ctx.restaurant.settings?.print;
      const values = sanitizeSettings(pkg.manifest, settings ?? (prev?.themeId === themeId ? prev.config : {}));
      await publishTheme({ restaurantId, themeId, versionId, userId: ctx.user.id, config: values });
      return { themeId, versionId, settings: values };
    }
    const from = ctx.restaurant.themeId;
    await publishTheme({ restaurantId, themeId, versionId, userId: ctx.user.id });
    const wasActive = parseStudioThemeId(from) === themeId;
    const values = sanitizeSettings(pkg.manifest, settings ?? (wasActive ? ctx.restaurant.themeConfig : {}));
    await writeThemeConfig(restaurantId, values);
    return { themeId, versionId, settings: values };
  },
);

/** Customizer values → restaurants.themeConfig. Only for the active studio theme (otherwise preview only). */
export const saveThemeSettingsAction = action(
  z.object({ restaurantId: rid, themeId: tid, values: z.record(z.string(), z.unknown()) }),
  async ({ restaurantId, themeId, values }) => {
    const ctx = await studioContext(restaurantId, { themeId });
    const { theme, pkg } = await getThemeWithPackage(restaurantId, themeId, undefined);
    if (theme.kind === "print") {
      // Customizer of the selected print design → settings.print.config (validated against the printed version).
      if (ctx.restaurant.settings?.print?.themeId !== themeId) throw new AppError("validation", "theme not active");
      const sel = await selectPrintDesign({ restaurantId, themeId, config: values, userId: ctx.user.id });
      return { settings: sel.config };
    }
    if (parseStudioThemeId(ctx.restaurant.themeId) !== themeId) throw new AppError("validation", "theme not active");
    const published =
      theme.publishedVersionId && theme.publishedVersionId !== theme.currentVersionId ? (await getThemeWithPackage(restaurantId, themeId, theme.publishedVersionId)).pkg : pkg;
    // Published field definitions win (guests render the published version); fields that only exist in the latest
    // saved version are kept too, so their values are already in place when that version gets published.
    const fields = new Map<string, ThemeSettingField>();
    for (const f of settingFields(published.manifest)) fields.set(f.id, f);
    for (const f of settingFields(pkg.manifest)) if (!fields.has(f.id)) fields.set(f.id, f);
    const clean = sanitizeSettings({ settings: [...fields.values()] }, values);
    await writeThemeConfig(restaurantId, clean);
    await audit({ restaurantId, userId: ctx.user.id, action: "theme.settings.update", entityType: "theme", entityId: themeId, data: { settings: clean } });
    return { settings: clean };
  },
);

// ------------------------------------------------------------------ export / preview / voice

export const exportThemeAction = action(z.object({ restaurantId: rid, themeId: tid, versionId: z.uuid().optional() }), async ({ restaurantId, themeId, versionId }) => {
  const ctx = await studioContext(restaurantId, { themeId });
  const { theme, pkg } = await getThemeWithPackage(restaurantId, themeId, versionId);
  await audit({ restaurantId, userId: ctx.user.id, action: "theme.export", entityType: "theme", entityId: themeId });
  return { fileName: exportFileName(theme.name), json: serializePackage(pkg) };
});

/** Server-rendered document for the mini previews on theme cards (own + library themes). */
export const renderThemePreviewAction = action(z.object({ restaurantId: rid, themeId: tid }), async ({ restaurantId, themeId }) => {
  const ctx = await studioContext(restaurantId, { themeId });
  const { theme, pkg } = await getThemeWithPackage(restaurantId, themeId, undefined);
  if (theme.kind === "print") {
    // card preview: the first table card of the restaurant (sample cards for library designs)
    const { views } = await printPreviewViews(ctx.restaurant, theme.restaurantId ? "real" : "sample", 2);
    const settings = theme.isActive ? ctx.restaurant.settings?.print?.config : {};
    return { html: await renderPrintPreviewHtml(pkg, views.slice(-1), settings, restaurantId, ctx.restaurant.defaultLocale), kind: "print" as const, ...printPreviewSize(pkg) };
  }
  const { view } = await previewView(ctx.restaurant, ctx.restaurant.defaultLocale, theme.restaurantId ? "real" : "sample");
  const settings = theme.isActive ? ctx.restaurant.themeConfig : {};
  return { html: await renderPreviewHtml(pkg, view, settings, restaurantId), kind: "menu" as const };
});

/** Voice instruction → text (theme_studio + ai.use; independent of the ai_agent feature). */
export const transcribeThemeVoiceAction = action(
  z.object({ restaurantId: rid, wavBase64: z.string().min(100).max(3_400_000), uiLocale: z.string().max(5).optional(), kind: kindSchema.optional() }),
  async ({ restaurantId, wavBase64, uiLocale, kind }) => {
    const ctx = await designAiContext(restaurantId, kind ?? "menu");
    const hint = [...new Set([uiLocale ?? "de", ctx.restaurant.defaultLocale, "de", "en", "tr"])].join(", ");
    const text = await aiTranscribe(wavBase64, { restaurantId, userId: ctx.user.id }, hint);
    return { text: text.slice(0, 4000) };
  },
);

// create / publish / delete are audited inside theme-engine/service.ts.

/** Theme list for client refreshes (hub). */
export const listThemesAction = action(z.object({ restaurantId: rid }), async ({ restaurantId }) => {
  await studioContext(restaurantId);
  return listThemes(restaurantId);
});
