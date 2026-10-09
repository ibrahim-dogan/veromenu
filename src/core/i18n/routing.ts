import { defineRouting } from "next-intl/routing";
import { UI_LOCALES, DEFAULT_LOCALE } from "./locales";

export const routing = defineRouting({
  locales: UI_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  // German (the main market) has no prefix: /preise, English: /en/..., Turkish: /tr/...
  localePrefix: "as-needed",
  localeCookie: { name: "vm_locale", maxAge: 60 * 60 * 24 * 365 },
});
