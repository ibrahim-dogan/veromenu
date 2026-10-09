import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { resolveTheme } from "@/themes";
import { getGuestT } from "@/modules/guest/i18n";
import { firstParam, loadGuestRequest } from "@/modules/guest/request";
import { GuestMessageScreen, HtmlLang } from "@/modules/guest/components/screens";
import { trackEvent } from "@/modules/analytics/track";

export async function generateMetadata({ params, searchParams }: PageProps<"/m/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await loadGuestRequest(slug, sp);
  if (res.status !== "ok") return { title: res.status === "suspended" ? res.name : "Menu", robots: { index: false } };
  const { data } = res;
  const t = getGuestT(data.locale);
  const title = data.restaurant.name;
  const description = t("metaDescription", { name: title });
  const cover = data.restaurant.cover ?? data.restaurant.logo;
  return {
    title,
    description,
    alternates: { canonical: `/m/${slug}` },
    // table-specific and preview URLs must not be indexed
    robots: data.preview || firstParam(sp.t) ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "website",
      title,
      description,
      locale: data.locale,
      url: `/m/${slug}`,
      images: cover ? [{ url: cover.md, width: cover.width ?? undefined, height: cover.height ?? undefined, alt: title }] : undefined,
    },
    twitter: { card: cover ? "summary_large_image" : "summary", title, description },
  };
}

export async function generateViewport({ params, searchParams }: PageProps<"/m/[slug]">): Promise<Viewport> {
  const { slug } = await params;
  const res = await loadGuestRequest(slug, await searchParams);
  if (res.status !== "ok") return {};
  const { theme, config } = await resolveTheme(res.data.theme.id, res.data.theme.config);
  return { themeColor: theme.cssVars(config)["--g-bg"] };
}

export default async function GuestMenuPage({ params, searchParams }: PageProps<"/m/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const res = await loadGuestRequest(slug, sp);
  if (res.status === "not_found") notFound();
  if (res.status === "suspended") {
    const t = getGuestT(res.locale);
    const dir = res.availableLocales.find((l) => l.code === res.locale)?.rtl ? "rtl" : "ltr";
    return <GuestMessageScreen lang={res.locale} dir={dir} icon="🕯️" title={t("unavailableTitle")} text={t("unavailableText", { name: res.name })} />;
  }

  const { data } = res;
  const { theme, config } = await resolveTheme(data.theme.id, data.theme.config);
  data.theme = { id: theme.manifest.id, config };
  const t = getGuestT(data.locale);

  // cookie-less analytics, after the response is sent (never in previews)
  if (!data.preview) {
    const h = new Headers(await headers());
    const fromQr = !!firstParam(sp.t) || firstParam(sp.src) === "qr";
    after(async () => {
      const base = { restaurantId: data.restaurant.id, headers: h, tableId: data.table?.id ?? null, locale: data.locale };
      if (fromQr) await trackEvent({ ...base, type: "qr_scan", meta: { table: !!data.table } });
      await trackEvent({ ...base, type: "menu_view", meta: { mode: data.menuMode, theme: theme.manifest.id } });
    });
  }

  const Theme = theme.Component;
  const bg = theme.cssVars(config)["--g-bg"];
  return (
    <>
      <HtmlLang lang={data.locale} dir={data.dir} />
      <style>{`html,body{background:${/^#[0-9a-f]{3,8}$/i.test(bg) ? bg : "#fff"}}`}</style>
      <Theme data={data} config={config} t={t} />
    </>
  );
}
