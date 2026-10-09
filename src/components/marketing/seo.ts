import type { Metadata } from "next";
import { UI_LOCALES, DEFAULT_LOCALE } from "@/core/i18n/locales";

/**
 * SEO helpers for the public marketing site.
 * Reads APP_URL directly from process.env (NOT env()) so these helpers never throw during `next build`
 * when runtime secrets are absent. Marketing pages export `generateStaticParams = () => []`, so they are
 * rendered on the first request (with the runtime APP_URL) and cached afterwards.
 */
export const siteUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Absolute URL for a marketing path in a locale (German has no prefix). path: "/" | "/preise" ... */
export function localizedUrl(locale: string, path: string) {
  const clean = path === "/" ? "" : path;
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  return `${siteUrl()}${prefix}${clean}` || siteUrl();
}

const OG_LOCALES: Record<string, string> = { de: "de_DE", en: "en_GB", tr: "tr_TR" };

export function marketingMetadata(opts: {
  locale: string;
  path: string;
  title: string;
  description: string;
  /** Use the title as-is (skip the "· VeroMenu" template), e.g. for the home page. */
  absoluteTitle?: boolean;
  noIndex?: boolean;
}): Metadata {
  const languages: Record<string, string> = {};
  for (const l of UI_LOCALES) languages[l] = localizedUrl(l, opts.path);
  languages["x-default"] = localizedUrl(DEFAULT_LOCALE, opts.path);
  const url = localizedUrl(opts.locale, opts.path);
  return {
    metadataBase: new URL(siteUrl()),
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical: url, languages },
    openGraph: {
      type: "website",
      siteName: "VeroMenu",
      url,
      title: opts.title,
      description: opts.description,
      locale: OG_LOCALES[opts.locale] ?? opts.locale,
      alternateLocale: UI_LOCALES.filter((l) => l !== opts.locale).map((l) => OG_LOCALES[l]),
    },
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
    robots: opts.noIndex ? { index: false, follow: true } : undefined,
  };
}

/** Safe JSON-LD serialization (prevents </script> injection). */
export const jsonLd = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });

/** Marketing routes listed in the sitemap (German slugs are used for every locale). */
export const MARKETING_PATHS = ["/", "/funktionen", "/preise", "/kontakt", "/impressum", "/datenschutz", "/agb", "/avv"] as const;
