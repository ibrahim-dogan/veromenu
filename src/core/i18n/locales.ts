/**
 * Locale catalog.
 * - UI_LOCALES: languages of the whole app UI (landing, auth, dashboard, admin). German is the default.
 * - CONTENT_LOCALES: languages a restaurant may enable for its guest menu (menu content is AI-translated,
 *   guest UI strings come from src/messages/<locale>/guest.json with English fallback).
 */
export const UI_LOCALES = ["de", "en", "tr"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const DEFAULT_LOCALE: UiLocale = "de";

export type ContentLocaleInfo = { code: string; name: string; native: string; flag: string; rtl?: boolean };

export const CONTENT_LOCALES: ContentLocaleInfo[] = [
  { code: "de", name: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "en", name: "English", native: "English", flag: "🇬🇧" },
  { code: "tr", name: "Turkish", native: "Türkçe", flag: "🇹🇷" },
  { code: "fr", name: "French", native: "Français", flag: "🇫🇷" },
  { code: "it", name: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "es", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "nl", name: "Dutch", native: "Nederlands", flag: "🇳🇱" },
  { code: "pl", name: "Polish", native: "Polski", flag: "🇵🇱" },
  { code: "ru", name: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "uk", name: "Ukrainian", native: "Українська", flag: "🇺🇦" },
  { code: "ar", name: "Arabic", native: "العربية", flag: "🇸🇦", rtl: true },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "pt", name: "Portuguese", native: "Português", flag: "🇵🇹" },
  { code: "el", name: "Greek", native: "Ελληνικά", flag: "🇬🇷" },
  { code: "da", name: "Danish", native: "Dansk", flag: "🇩🇰" },
];

export const CONTENT_LOCALE_CODES = CONTENT_LOCALES.map((l) => l.code);
export const ALL_LOCALES = Array.from(new Set<string>([...UI_LOCALES, ...CONTENT_LOCALE_CODES]));

export const localeInfo = (code: string) => CONTENT_LOCALES.find((l) => l.code === code);
export const isRtl = (code: string) => !!localeInfo(code)?.rtl;
export const isUiLocale = (l: string | undefined | null): l is UiLocale => !!l && (UI_LOCALES as readonly string[]).includes(l);
