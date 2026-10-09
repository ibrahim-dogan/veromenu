import type { MetadataRoute } from "next";
import { UI_LOCALES } from "@/core/i18n/locales";
import { MARKETING_PATHS, localizedUrl } from "@/components/marketing/seo";

// Evaluated per request so the runtime APP_URL (not the build-time one) is used.
// Only public marketing/legal pages – /dashboard, /admin and guest menus (/m) are intentionally excluded.
export const dynamic = "force-dynamic";

const PRIORITY: Record<string, number> = { "/": 1, "/funktionen": 0.9, "/preise": 0.9, "/kontakt": 0.6 };

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return MARKETING_PATHS.flatMap((path) =>
    UI_LOCALES.map((locale) => ({
      url: localizedUrl(locale, path),
      lastModified,
      changeFrequency: path === "/" || path === "/preise" ? ("weekly" as const) : ("monthly" as const),
      priority: PRIORITY[path] ?? 0.3,
      alternates: { languages: Object.fromEntries(UI_LOCALES.map((l) => [l, localizedUrl(l, path)])) },
    })),
  );
}
