/**
 * Theme engine v2 – public, ISOMORPHIC API (runs in the browser for the studio live preview and on the
 * server for the guest frame). No server-only imports here; storage lives in ./service.ts.
 *
 * Docs for theme authors (and the theme-ai LLM prompt): docs/THEMES.md
 */
import type { ThemePackage } from "./types";

export * from "./types";

export { FONT_LIBRARY, fontStack, fontFaceCss, isFontId, getFont, type FontInfo } from "./fonts";
export { validatePackage } from "./validate";
export { renderThemeDocument, renderErrorDocument, type RenderThemeOptions, type RenderThemeResult } from "./render";
export { sampleThemeView } from "./sample";
export { buildThemeView } from "./view";
export { themeFrameCsp, themeFrameHeaders } from "./csp";
export { bridgeMessageSchema } from "./bridge-schema";
export { THEME_FILTERS, contrastColor, type ThemeMediaRef } from "./liquid";
export {
  manifestSchema,
  settingFieldSchema,
  resolveSettings,
  defaultSettings,
  settingCssVar,
  usedFontIds,
  HOST_COLOR_SETTINGS,
  type SettingValue,
} from "./settings";

/** .vmtheme.json export/import (assets embedded as data URLs on export). */
export function serializePackage(pkg: ThemePackage): string {
  return JSON.stringify({ format: "vmtheme", apiVersion: 1, ...pkg }, null, 2);
}

/** Parses a .vmtheme.json export (or a bare { manifest, files } object). Validate the result with validatePackage(). */
export function parsePackage(json: string): ThemePackage | null {
  try {
    const v = JSON.parse(json) as { manifest?: unknown; files?: unknown };
    if (!v || typeof v !== "object" || !v.manifest || !v.files || typeof v.files !== "object") return null;
    return { manifest: v.manifest as ThemePackage["manifest"], files: v.files as Record<string, string> };
  } catch {
    return null;
  }
}
