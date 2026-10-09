import type { MetadataRoute } from "next";
import { siteUrl } from "@/components/marketing/seo";
import { DEFAULT_LOCALE, UI_LOCALES } from "@/core/i18n/locales";

// Evaluated per request so the runtime APP_URL (not the build-time one) is used.
export const dynamic = "force-dynamic";

/** App routes inside [locale] (also disallowed with /en, /tr prefixes). */
const APP_ROUTES = ["/dashboard", "/admin", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email", "/invite"];
/** Non-localized private routes. Guest menus (/m/…) stay crawlable – restaurants benefit from being found –
 *  but are not listed in the sitemap. */
const RAW_ROUTES = ["/api/"];

export default function robots(): MetadataRoute.Robots {
  const disallow = [...APP_ROUTES.flatMap((p) => [p, ...UI_LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((l) => `/${l}${p}`)]), ...RAW_ROUTES];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
