import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { ALL_LOCALES } from "./locales";
import { getMessages } from "./messages";

export default getRequestConfig(async ({ requestLocale, locale: explicit }) => {
  // `explicit` is set when code calls getTranslations({ locale }) – used by the guest menu,
  // which supports more languages than the app UI.
  const requested = explicit ?? (await requestLocale);
  const locale =
    explicit && ALL_LOCALES.includes(explicit)
      ? explicit
      : hasLocale(routing.locales, requested)
        ? requested
        : routing.defaultLocale;

  return {
    locale,
    messages: getMessages(locale),
    timeZone: "Europe/Berlin",
    onError(error) {
      if (process.env.NODE_ENV !== "production") console.warn("[i18n]", error.message);
    },
    getMessageFallback({ namespace, key }) {
      return [namespace, key].filter(Boolean).join(".");
    },
  };
});
