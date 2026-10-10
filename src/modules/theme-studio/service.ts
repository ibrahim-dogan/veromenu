import "server-only";
/**
 * Theme Studio server helpers: plan gating, preview data (real menu → ThemeView), mini-preview rendering
 * and the platform theme library (admin). Restaurant theme storage itself lives in theme-engine/service.ts.
 */
import { and, desc, eq, inArray, isNull, isNotNull, or } from "drizzle-orm";
import { db } from "@/core/db";
import { media, restaurants, themes, themeVersions } from "@/core/db/schema";
import { mediaSrc } from "@/core/storage/media";
import { env } from "@/core/env";
import { AppError } from "@/core/http/action";
import { getGuestMessages } from "@/modules/guest/i18n";
import type { GuestMessages } from "@/modules/guest/t";
import { buildThemeView, renderThemeDocument, sampleThemeView, validatePackage, type ThemeMediaRef } from "@/modules/theme-engine";
import type { ThemePackage, ThemeView } from "@/modules/theme-engine/types";
import { getThemeWithPackage } from "@/modules/theme-engine/service";
import { mediaIdsFor, sanitizeSettings } from "./lib/package";

/** Guest strings flattened to dotted keys ("tags.vegan") – the shape renderThemeDocument expects. */
export function flatGuestMessages(locale: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (m: GuestMessages, prefix: string) => {
    for (const [k, v] of Object.entries(m)) {
      if (typeof v === "string") out[prefix + k] = v;
      else walk(v, `${prefix}${k}.`);
    }
  };
  walk(getGuestMessages(locale), "");
  return out;
}

export const assetBaseUrl = () => env().APP_URL.replace(/\/$/, "");

/** ThemeView for the studio preview: the restaurant's real menu (when possible) or the sample restaurant. */
export async function previewView(restaurant: { slug: string; enabledLocales: string[]; defaultLocale: string }, locale: string, source: "real" | "sample") {
  const lang = restaurant.enabledLocales.includes(locale) ? locale : restaurant.defaultLocale;
  if (source === "real") {
    try {
      // lazy: guest/load pulls in auth guards (request-bound) – keeps this module importable from scripts
      const { loadGuestMenu } = await import("@/modules/guest/load");
      const res = await loadGuestMenu(restaurant.slug, { lang });
      if (res.status === "ok") {
        const view = buildThemeView(res.data, { mode: "preview", settings: {} });
        return { view: { ...view, mode: "preview" as const }, source: "real" as const, locale: view.locale };
      }
    } catch (e) {
      console.error("[theme-studio] buildThemeView failed, using sample", e);
    }
  }
  const sample = sampleThemeView();
  return { view: { ...sample, locale, mode: "preview" as const }, source: "sample" as const, locale };
}

/** Media ids (image settings, manifest.assets) → URLs. Only the restaurant's own (or platform) images. */
export async function resolvePreviewMedia(restaurantId: string | null, ids: string[]): Promise<Record<string, ThemeMediaRef>> {
  const uniq = [...new Set(ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)))].slice(0, 60);
  if (!uniq.length) return {};
  const rows = await db
    .select({ id: media.id, storageKey: media.storageKey, variants: media.variants, mime: media.mime })
    .from(media)
    .where(and(inArray(media.id, uniq), restaurantId ? or(eq(media.restaurantId, restaurantId), isNull(media.restaurantId)) : isNull(media.restaurantId)));
  const out: Record<string, ThemeMediaRef> = {};
  for (const m of rows) {
    if (!m.mime.startsWith("image/")) continue;
    out[m.id] = { url: mediaSrc(m, "orig")!, sm: mediaSrc(m, "sm"), md: mediaSrc(m, "md") };
  }
  return out;
}

/** Full sandbox document for card previews (rendered on the server, shown in a sandboxed srcdoc iframe). */
export async function renderPreviewHtml(pkg: ThemePackage, view: ThemeView, settings: unknown, restaurantId: string | null = null): Promise<string> {
  const clean = sanitizeSettings(pkg.manifest, settings);
  const { html } = await renderThemeDocument({
    pkg,
    view: { ...view, settings: clean, mode: "preview" },
    assetBaseUrl: assetBaseUrl(),
    guestMessages: flatGuestMessages(view.locale),
    media: await resolvePreviewMedia(restaurantId, mediaIdsFor(pkg.manifest, clean)),
  });
  return html;
}

// ------------------------------------------------------------------ platform library (admin)

export type LibraryTheme = { id: string; name: string; description: string | null; origin: string; currentVersionId: string | null; updatedAt: Date };

export async function listLibraryThemes(): Promise<LibraryTheme[]> {
  return db
    .select({ id: themes.id, name: themes.name, description: themes.description, origin: themes.origin, currentVersionId: themes.currentVersionId, updatedAt: themes.updatedAt })
    .from(themes)
    .where(isNull(themes.restaurantId))
    .orderBy(themes.name);
}

/** Restaurant themes that can be promoted into the library (latest first). */
export async function listPromotableThemes(limit = 100) {
  return db
    .select({ id: themes.id, name: themes.name, origin: themes.origin, restaurantId: themes.restaurantId, restaurantName: restaurants.name, updatedAt: themes.updatedAt })
    .from(themes)
    .innerJoin(restaurants, eq(restaurants.id, themes.restaurantId))
    .where(and(isNotNull(themes.restaurantId), isNotNull(themes.currentVersionId)))
    .orderBy(desc(themes.updatedAt))
    .limit(limit);
}

async function loadVersionPackage(themeId: string, versionId: string | null): Promise<ThemePackage> {
  if (!versionId) throw new AppError("notFound");
  const [v] = await db.select({ pkg: themeVersions.package }).from(themeVersions).where(and(eq(themeVersions.id, versionId), eq(themeVersions.themeId, themeId))).limit(1);
  if (!v) throw new AppError("notFound");
  return v.pkg as ThemePackage;
}

export async function getLibraryPackage(themeId: string): Promise<{ theme: LibraryTheme; pkg: ThemePackage }> {
  const [t] = await db
    .select({ id: themes.id, name: themes.name, description: themes.description, origin: themes.origin, currentVersionId: themes.currentVersionId, updatedAt: themes.updatedAt })
    .from(themes)
    .where(and(eq(themes.id, themeId), isNull(themes.restaurantId)))
    .limit(1);
  if (!t) throw new AppError("notFound");
  return { theme: t, pkg: await loadVersionPackage(t.id, t.currentVersionId) };
}

async function insertLibraryTheme(opts: { name: string; description: string | null; pkg: ThemePackage; origin: string; parentThemeId?: string | null; userId: string; note: string }) {
  const validation = validatePackage(opts.pkg);
  if (!validation.ok) throw new AppError("validation", validation.errors.map((e) => `${e.file ?? ""}${e.line ? `:${e.line}` : ""} ${e.message}`).join("; ").slice(0, 400));
  return db.transaction(async (tx) => {
    const [t] = await tx
      .insert(themes)
      .values({ restaurantId: null, name: opts.name, description: opts.description, origin: opts.origin, parentThemeId: opts.parentThemeId ?? null, createdBy: opts.userId })
      .returning({ id: themes.id });
    const [v] = await tx
      .insert(themeVersions)
      .values({ themeId: t.id, number: 1, package: opts.pkg, note: opts.note, author: "system", createdBy: opts.userId })
      .returning({ id: themeVersions.id });
    await tx.update(themes).set({ currentVersionId: v.id, publishedVersionId: v.id }).where(eq(themes.id, t.id));
    return { themeId: t.id };
  });
}

/** Copies the current version of a restaurant theme into the platform library. */
export async function promoteToLibrary(opts: { sourceThemeId: string; name: string; description: string | null; userId: string }) {
  const [src] = await db.select().from(themes).where(and(eq(themes.id, opts.sourceThemeId), isNotNull(themes.restaurantId))).limit(1);
  if (!src || !src.restaurantId) throw new AppError("notFound");
  const { pkg } = await getThemeWithPackage(src.restaurantId, src.id);
  return insertLibraryTheme({
    name: opts.name,
    description: opts.description,
    pkg: { ...pkg, manifest: { ...pkg.manifest, name: opts.name } },
    origin: "library",
    parentThemeId: src.id,
    userId: opts.userId,
    note: `promoted from ${src.id}`,
  });
}

export async function updateLibraryTheme(themeId: string, data: { name: string; description: string | null }) {
  const res = await db
    .update(themes)
    .set({ name: data.name, description: data.description, updatedAt: new Date() })
    .where(and(eq(themes.id, themeId), isNull(themes.restaurantId)))
    .returning({ id: themes.id });
  if (!res.length) throw new AppError("notFound");
}

export async function deleteLibraryTheme(themeId: string) {
  const res = await db.delete(themes).where(and(eq(themes.id, themeId), isNull(themes.restaurantId))).returning({ id: themes.id });
  if (!res.length) throw new AppError("notFound");
}

/** Writes customizer values into restaurants.themeConfig (only used when the studio theme is active). */
export async function writeThemeConfig(restaurantId: string, values: Record<string, unknown>) {
  await db.update(restaurants).set({ themeConfig: values, updatedAt: new Date() }).where(eq(restaurants.id, restaurantId));
}
