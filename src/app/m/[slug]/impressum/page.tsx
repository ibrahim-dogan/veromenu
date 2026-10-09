import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isRtl } from "@/core/i18n/locales";
import { getGuestRestaurantRow } from "@/modules/guest/load";
import { resolveGuestLocale } from "@/modules/guest/locale";
import { getGuestT } from "@/modules/guest/i18n";
import { firstParam } from "@/modules/guest/request";
import { GuestSimplePage } from "@/modules/guest/components/simple-page";

async function ctx(slug: string, sp: Record<string, string | string[] | undefined>) {
  const r = await getGuestRestaurantRow(slug);
  if (!r) return null;
  const lang = resolveGuestLocale({
    enabled: r.enabledLocales,
    defaultLocale: r.defaultLocale,
    lang: firstParam(sp.lang),
    acceptLanguage: (await headers()).get("accept-language"),
  });
  return { r, lang, t: getGuestT(lang) };
}

export async function generateMetadata({ params, searchParams }: PageProps<"/m/[slug]/impressum">): Promise<Metadata> {
  const c = await ctx((await params).slug, await searchParams);
  if (!c) return {};
  return { title: `${c.t("imprintTitle")} · ${c.r.name}` };
}

/** Restaurant imprint (DDG §5) from settings.legal + address + contact. */
export default async function ImprintPage({ params, searchParams }: PageProps<"/m/[slug]/impressum">) {
  const { slug } = await params;
  const sp = await searchParams;
  const c = await ctx(slug, sp);
  if (!c) notFound();
  const { r, lang, t } = c;
  const s = r.settings ?? {};
  const legal = s.legal ?? {};
  const a = s.address ?? {};
  const back = new URLSearchParams({ lang });
  const token = firstParam(sp.t);
  if (token && /^[A-Za-z0-9_-]{4,128}$/.test(token)) back.set("t", token);
  const register = [legal.registerCourt, legal.registerNumber].filter(Boolean).join(", ");
  const hasLegal = !!(legal.companyName || legal.representative || a.street || register || legal.vatId);

  const row = (label: string, value: React.ReactNode) => (
    <div className="border-g-border border-b py-3 last:border-0">
      <dt className="text-g-muted text-xs font-semibold tracking-wide uppercase">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );

  return (
    <GuestSimplePage
      themeId={r.themeId}
      themeConfig={r.themeConfig}
      lang={lang}
      dir={isRtl(lang) ? "rtl" : "ltr"}
      backHref={`/m/${slug}?${back.toString()}`}
      backLabel={t("backToMenu")}
    >
      <h1 className="font-g-display text-3xl font-semibold">{t("imprintTitle")}</h1>
      <p className="text-g-muted mt-1">{t("imprintIntro")}</p>
      <dl className="bg-g-surface border-g-border mt-6 rounded-[var(--g-radius)] border px-5 py-2">
        {row(
          t("imprintProvider"),
          <address className="not-italic">
            <strong className="font-semibold">{legal.companyName || r.name}</strong>
            {legal.companyName && legal.companyName !== r.name && <span className="block">{r.name}</span>}
            {a.street && <span className="block">{a.street}</span>}
            {(a.zip || a.city) && <span className="block">{[a.zip, a.city].filter(Boolean).join(" ")}</span>}
            {a.country && <span className="block">{a.country}</span>}
          </address>,
        )}
        {legal.representative && row(t("imprintRepresentative"), legal.representative)}
        {(s.phone || s.email) &&
          row(
            t("imprintContact"),
            <>
              {s.phone && (
                <a className="block underline underline-offset-4" href={`tel:${s.phone.replace(/[^\d+]/g, "")}`}>
                  {s.phone}
                </a>
              )}
              {s.email && (
                <a className="block underline underline-offset-4" href={`mailto:${s.email}`}>
                  {s.email}
                </a>
              )}
            </>,
          )}
        {register && row(t("imprintRegister"), register)}
        {legal.vatId && row(t("imprintVatId"), legal.vatId)}
        {legal.extra && row(t("imprintMore"), <span className="whitespace-pre-line">{legal.extra}</span>)}
      </dl>
      {!hasLegal && <p className="text-g-muted mt-4 text-sm">{t("imprintMissing")}</p>}
      <p className="text-g-muted mt-8 text-sm">
        {t("imprintPlatform")}{" "}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- other root layout: full navigation intended */}
        <a href="/datenschutz" className="underline underline-offset-4">
          {t("privacy")}
        </a>
      </p>
    </GuestSimplePage>
  );
}
