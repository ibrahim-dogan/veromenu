import "server-only";
/**
 * CONTRACT (implemented by the theme-engine engineer): server-side theme storage. All functions enforce
 * restaurant scoping (a restaurant may read its own themes + library themes, write only its own).
 */
import type { ThemePackage, ThemeValidation } from "./types";

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

const ni = (n: string): never => {
  throw new Error(`theme-engine: ${n} not implemented yet`);
};

export async function listThemes(_restaurantId: string): Promise<{ own: ThemeSummary[]; library: ThemeSummary[] }> {
  return ni("listThemes");
}
export async function getThemeWithPackage(_restaurantId: string, _themeId: string, _versionId?: string): Promise<{ theme: ThemeSummary; versionId: string; pkg: ThemePackage }> {
  return ni("getThemeWithPackage");
}
/** Validates, then creates theme + version 1. */
export async function createTheme(_opts: {
  restaurantId: string;
  name: string;
  description?: string | null;
  pkg: ThemePackage;
  origin: "starter" | "ai_prompt" | "ai_file" | "manual" | "import" | "duplicate" | "library";
  parentThemeId?: string | null;
  userId: string;
  note?: string;
}): Promise<{ themeId: string; versionId: string; validation: ThemeValidation }> {
  return ni("createTheme");
}
/** Validates and stores a new immutable version (becomes currentVersionId). Rejects invalid packages. */
export async function saveThemeVersion(_opts: {
  restaurantId: string;
  themeId: string;
  pkg: ThemePackage;
  note?: string;
  author: "user" | "ai" | "import" | "system";
  userId: string;
}): Promise<{ versionId: string; number: number; validation: ThemeValidation }> {
  return ni("saveThemeVersion");
}
export async function listThemeVersions(_restaurantId: string, _themeId: string): Promise<ThemeVersionSummary[]> {
  return ni("listThemeVersions");
}
/** Publishes a version and activates the theme for guests (restaurants.themeId = studio:<id>). */
export async function publishTheme(_opts: { restaurantId: string; themeId: string; versionId: string; userId: string }): Promise<void> {
  return ni("publishTheme");
}
export async function duplicateTheme(_opts: { restaurantId: string; themeId: string; name?: string; userId: string }): Promise<{ themeId: string }> {
  return ni("duplicateTheme");
}
export async function deleteTheme(_restaurantId: string, _themeId: string): Promise<void> {
  return ni("deleteTheme");
}
/** Starter packages shipped with the app (seeded into the library). */
export async function getStarterPackages(): Promise<{ key: string; name: string; description: Record<string, string>; pkg: ThemePackage }[]> {
  return ni("getStarterPackages");
}
