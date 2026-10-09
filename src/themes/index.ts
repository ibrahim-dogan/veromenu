import "server-only";
import { THEME_LOADERS, THEME_MANIFESTS } from "./registry.generated";
import { sanitizeConfig } from "./config";
import type { ThemeConfig, ThemeManifest, ThemeModule } from "./types";

export const DEFAULT_THEME_ID = "classic";

export const listThemeManifests = (): ThemeManifest[] =>
  Object.values(THEME_MANIFESTS).sort((a, b) => (a.id === DEFAULT_THEME_ID ? -1 : b.id === DEFAULT_THEME_ID ? 1 : a.name.localeCompare(b.name)));

export const isThemeId = (id: unknown): id is string => typeof id === "string" && id in THEME_MANIFESTS;

/** Manifest for a theme id; unknown ids fall back to "classic". */
export const getThemeManifest = (id: string | null | undefined): ThemeManifest => THEME_MANIFESTS[isThemeId(id) ? id : DEFAULT_THEME_ID];

/** Loads a theme module + sanitized config (unknown theme → classic, invalid config → defaults). */
export async function resolveTheme(id: string | null | undefined, rawConfig: unknown): Promise<{ theme: ThemeModule; config: ThemeConfig }> {
  const themeId = isThemeId(id) ? id : DEFAULT_THEME_ID;
  const theme = await THEME_LOADERS[themeId]();
  return { theme, config: sanitizeConfig(theme.manifest, rawConfig) };
}
