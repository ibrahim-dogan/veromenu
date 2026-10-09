import { headers } from "next/headers";
import { CONTENT_LOCALE_CODES, isRtl } from "@/core/i18n/locales";
import { getGuestT } from "@/modules/guest/i18n";
import { parseAcceptLanguage } from "@/modules/guest/locale";
import { GuestMessageScreen } from "@/modules/guest/components/screens";

/** Unknown menu: friendly message in the browser language (any guest language we have strings for). */
export default async function GuestNotFound() {
  const accept = parseAcceptLanguage((await headers()).get("accept-language"));
  const lang = accept.find((c) => CONTENT_LOCALE_CODES.includes(c)) ?? "de";
  const t = getGuestT(lang);
  return <GuestMessageScreen lang={lang} dir={isRtl(lang) ? "rtl" : "ltr"} icon="🍽️" title={t("notFoundTitle")} text={t("notFoundText")} />;
}
