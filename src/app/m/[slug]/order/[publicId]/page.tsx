import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isRtl } from "@/core/i18n/locales";
import { getGuestRestaurantRow } from "@/modules/guest/load";
import { resolveGuestLocale } from "@/modules/guest/locale";
import { getGuestMessages, getGuestT } from "@/modules/guest/i18n";
import { firstParam } from "@/modules/guest/request";
import { GuestSimplePage } from "@/modules/guest/components/simple-page";
import { privacyHref } from "@/modules/guest/components/legal-footer";
import { OrderStatus } from "@/modules/guest/components/order-status";

const PUBLIC_ID = /^[A-Za-z0-9_-]{6,64}$/;

export async function generateMetadata({ params }: PageProps<"/m/[slug]/order/[publicId]">): Promise<Metadata> {
  const r = await getGuestRestaurantRow((await params).slug);
  return { title: r?.name ?? "Order", robots: { index: false, follow: false } };
}

/** Guest order status (number + live status, polls the public order API). */
export default async function OrderStatusPage({ params, searchParams }: PageProps<"/m/[slug]/order/[publicId]">) {
  const { slug, publicId } = await params;
  const sp = await searchParams;
  const r = await getGuestRestaurantRow(slug);
  if (!r || !PUBLIC_ID.test(publicId)) notFound();
  const lang = resolveGuestLocale({
    enabled: r.enabledLocales,
    defaultLocale: r.defaultLocale,
    lang: firstParam(sp.lang),
    acceptLanguage: (await headers()).get("accept-language"),
  });
  const t = getGuestT(lang);
  const back = new URLSearchParams({ lang });
  const token = firstParam(sp.t);
  if (token && /^[A-Za-z0-9_-]{4,128}$/.test(token)) back.set("t", token);
  return (
    <GuestSimplePage
      themeId={r.themeId}
      themeConfig={r.themeConfig}
      lang={lang}
      dir={isRtl(lang) ? "rtl" : "ltr"}
      backHref={`/m/${slug}?${back.toString()}`}
      backLabel={t("backToMenu")}
      footer={
        <nav aria-label={t("legalNav")} className="text-g-muted mt-12 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <a href={`/m/${slug}/impressum?${back.toString()}`} className="underline underline-offset-4 hover:no-underline">
            {t("imprint")}
          </a>
          <a href={privacyHref(lang)} className="underline underline-offset-4 hover:no-underline">
            {t("privacy")}
          </a>
        </nav>
      }
    >
      <OrderStatus publicId={publicId} locale={lang} messages={getGuestMessages(lang)} />
    </GuestSimplePage>
  );
}
