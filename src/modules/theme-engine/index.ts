/**
 * CONTRACT (implemented by the theme-engine engineer). ISOMORPHIC – must run in the browser (studio live
 * preview) and on the server (guest frame). No server-only imports here.
 */
import type { ThemePackage, ThemeValidation, ThemeView } from "./types";

export * from "./types";

/** Self-hosted font library (DSGVO: never load fonts from Google servers). id → display info. */
export type FontInfo = { id: string; family: string; category: "sans" | "serif" | "display" | "script"; weights: number[] };
export const FONT_LIBRARY: FontInfo[] = [];

/** Structural + Liquid syntax validation (paths, sizes, manifest shape, parse errors with line numbers). */
export function validatePackage(_pkg: ThemePackage): ThemeValidation {
  throw new Error("theme-engine: validatePackage not implemented yet");
}

/**
 * Renders the full sandbox document (doctype, CSP meta, font CSS, theme CSS, rendered menu.liquid, bridge
 * script, theme JS). `assetBaseUrl` = absolute app origin for media/fonts (the frame has an opaque origin).
 */
export async function renderThemeDocument(_opts: {
  pkg: ThemePackage;
  view: ThemeView;
  assetBaseUrl: string;
  guestMessages: Record<string, string>;
}): Promise<{ html: string; errors: string[] }> {
  throw new Error("theme-engine: renderThemeDocument not implemented yet");
}

/** Sample view (realistic German restaurant) for previews without real data and for AI validation. */
export function sampleThemeView(): ThemeView {
  throw new Error("theme-engine: sampleThemeView not implemented yet");
}

/** .vmtheme.json export/import (assets embedded as data URLs on export). */
export function serializePackage(pkg: ThemePackage): string {
  return JSON.stringify({ format: "vmtheme", apiVersion: 1, ...pkg }, null, 2);
}
