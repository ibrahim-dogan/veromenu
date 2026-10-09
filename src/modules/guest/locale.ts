import { CONTENT_LOCALES, CONTENT_LOCALE_CODES } from "@/core/i18n/locales";
import type { GuestLocaleOption } from "./types";

/** Guest languages = the owner's enabled locales (default locale always first-class), in catalog order. */
export function guestLocaleOptions(enabled: string[], defaultLocale: string): GuestLocaleOption[] {
  const set = new Set([defaultLocale, ...enabled].filter((c) => CONTENT_LOCALE_CODES.includes(c)));
  return CONTENT_LOCALES.filter((l) => set.has(l.code)).map((l) => ({ code: l.code, native: l.native, flag: l.flag, rtl: !!l.rtl }));
}

/** Parses an Accept-Language header into language codes ordered by q. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { code: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .filter((x) => x.code && x.code !== "*" && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((x) => x.code);
}

/**
 * Resolves the guest language: explicit `lang` param (if enabled) → best Accept-Language match among
 * enabled → restaurant default. The choice is kept in the URL (`?lang=`), never in a cookie.
 */
export function resolveGuestLocale(opts: {
  enabled: string[];
  defaultLocale: string;
  lang?: string | null;
  acceptLanguage?: string | null;
}): string {
  const allowed = guestLocaleOptions(opts.enabled, opts.defaultLocale).map((l) => l.code);
  const lang = opts.lang?.toLowerCase();
  if (lang && allowed.includes(lang)) return lang;
  for (const code of parseAcceptLanguage(opts.acceptLanguage)) if (allowed.includes(code)) return code;
  return allowed.includes(opts.defaultLocale) ? opts.defaultLocale : (allowed[0] ?? "de");
}
