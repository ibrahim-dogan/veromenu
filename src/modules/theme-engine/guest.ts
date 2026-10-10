import "server-only";
/**
 * Guest runtime glue for studio themes (server): which studio theme/version a guest request renders,
 * rendering with a short-lived in-process cache (the /m/[slug] page renders once to decide about the
 * fallback, the frame request right after hits the cache), frame URLs and host control insets.
 */
import { createHash } from "node:crypto";
import { env } from "@/core/env";
import { planHas } from "@/modules/billing/plans";
import { getGuestMessages } from "@/modules/guest/i18n";
import type { GuestMenuData } from "@/modules/guest/types";
import { parseStudioThemeId, type ThemeManifest, type ThemePackage } from "./types";
import { renderThemeDocument, type RenderThemeResult } from "./render";
import { HEX_COLOR, HOST_COLOR_SETTINGS, resolveSettings } from "./settings";
import { contrastColor, contrastRatio } from "./liquid";
import { buildThemeView } from "./view";
import { getActiveStudioTheme, getThemeWithPackage, resolveThemeMedia } from "./service";

export type StudioSelection = { themeId: string; versionId: string; pkg: ThemePackage };

/** Absolute app origin used for media/font URLs inside the frame (never derived from the Host header). */
export const themeAssetBase = () => env().APP_URL.replace(/\/+$/, "");

/**
 * Studio theme for a loaded guest menu, or null (→ built-in theme). Live: the restaurant's published
 * version. Preview (data.preview = authorized theme.manage user): the requested theme/version.
 */
export async function selectStudioTheme(data: GuestMenuData, opts: { plan: string; activeThemeId: string | null; versionId?: string | null }): Promise<StudioSelection | null> {
  const themeId = parseStudioThemeId(data.theme.id);
  if (!themeId || data.menuMode !== "digital" || !planHas(opts.plan, "theme_studio")) return null;
  if (data.preview) {
    try {
      const v = opts.versionId && /^[0-9a-f-]{36}$/i.test(opts.versionId) ? opts.versionId : undefined;
      const r = await getThemeWithPackage(data.restaurant.id, themeId, v);
      return { themeId: r.theme.id, versionId: r.versionId, pkg: r.pkg };
    } catch {
      return null;
    }
  }
  return getActiveStudioTheme(data.restaurant.id, opts.activeThemeId);
}

/** Host controls in the top-end corner (info always; language when the host renders it). */
export function hostControls(manifest: ThemeManifest, data: GuestMenuData) {
  const language = (manifest.controls?.languageSwitcher ?? "host") === "host" && data.availableLocales.length > 1;
  const cart = (manifest.controls?.cartButton ?? "host") === "host";
  return { language, cart, insetTopEnd: 12 + 44 + (language ? 72 : 0) };
}

/** URL of the sandboxed frame document for a guest request. */
export function frameSrc(data: GuestMenuData, sel: StudioSelection): string {
  const p = new URLSearchParams({ lang: data.locale });
  if (data.tableToken) p.set("t", data.tableToken);
  if (data.preview) {
    p.set("preview", "1");
    p.set("theme", sel.themeId);
    p.set("v", sel.versionId);
  }
  return `/m/${data.restaurant.slug}/frame?${p.toString()}`;
}

// ---- render cache (key = everything that influences the output)
const g = globalThis as unknown as { __vmFrameCache?: Map<string, { at: number; res: RenderThemeResult }> };
const cache = (g.__vmFrameCache ??= new Map());
const TTL = 60_000;

export async function renderStudioGuest(data: GuestMenuData, sel: StudioSelection): Promise<RenderThemeResult & { manifest: ThemeManifest }> {
  const manifest = sel.pkg.manifest;
  const view = buildThemeView(data, { manifest });
  const controls = hostControls(manifest, data);
  const assetBaseUrl = themeAssetBase();
  const key = createHash("sha1")
    .update(JSON.stringify([sel.versionId, assetBaseUrl, controls.insetTopEnd, view]))
    .digest("base64url");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { ...hit.res, manifest };

  const res = await renderThemeDocument({
    pkg: sel.pkg,
    view,
    assetBaseUrl,
    guestMessages: getGuestMessages(data.locale) as Record<string, unknown>,
    media: await resolveThemeMedia(data.restaurant.id, sel.pkg, view.settings),
    hostInsetTopEnd: controls.insetTopEnd,
  });
  if (res.errors.length) console.warn(`[theme-engine] ${data.restaurant.slug} theme ${sel.themeId}@${sel.versionId}:`, res.errors.slice(0, 5));
  cache.set(key, { at: Date.now(), res });
  if (cache.size > 100) {
    for (const [k, v] of cache) if (Date.now() - v.at > TTL || cache.size > 100) cache.delete(k);
  }
  return { ...res, manifest };
}

/** --g-* variables for the host overlays (cart, item sheet, info) derived from the theme's well-known color settings. */
export function hostCssVars(manifest: ThemeManifest, rawSettings: unknown): Record<string, string> {
  const values = resolveSettings(manifest, rawSettings);
  const pick = (cssVar: keyof typeof HOST_COLOR_SETTINGS, fallback: string) => {
    const v = values[HOST_COLOR_SETTINGS[cssVar]];
    return typeof v === "string" && HEX_COLOR.test(v) ? v : fallback;
  };
  const bg = pick("--g-bg", "#ffffff");
  // overlays are sheets on --g-surface: keep the theme's text color only when it stays readable there
  const surface = pick("--g-surface", contrastColor(bg) === "#ffffff" ? "#1f1d24" : "#ffffff");
  const themeText = pick("--g-text", "");
  const text = themeText && contrastRatio(themeText, surface) >= 4.5 ? themeText : contrastColor(surface, "#1c1917", "#f5f5f4");
  const primary = pick("--g-primary", text);
  const accent = pick("--g-accent", primary);
  return {
    "--g-bg": bg,
    "--g-surface": surface,
    "--g-text": text,
    "--g-muted": `color-mix(in srgb, var(--g-text) 62%, var(--g-surface))`,
    "--g-border": `color-mix(in srgb, var(--g-text) 16%, var(--g-surface))`,
    "--g-primary": primary,
    "--g-on-primary": contrastColor(primary),
    "--g-accent": accent,
    "--g-on-accent": contrastColor(accent),
    "--g-radius": "14px",
    "--g-gap": "1rem",
    "--g-pad": "1rem",
  };
}
