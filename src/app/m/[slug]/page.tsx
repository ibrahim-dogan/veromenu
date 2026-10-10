import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { resolveTheme } from "@/themes";
import { getGuestT } from "@/modules/guest/i18n";
import { firstParam, loadGuestRequest } from "@/modules/guest/request";
import { GuestMessageScreen, HtmlLang } from "@/modules/guest/components/screens";
import { trackEvent } from "@/modules/analytics/track";
import { getGuestRestaurantRow } from "@/modules/guest/load";
import type { GuestMenuData } from "@/modules/guest/types";
import { GuestFrame } from "@/modules/guest/components/guest-frame";
import { LanguageSwitcher } from "@/modules/guest/components/language-switcher";
import { LegalFooter } from "@/modules/guest/components/legal-footer";
import { guestHref } from "@/modules/guest/components/blocks";
import { StudioThemeHost } from "@/modules/guest/components/studio-host";
import { parseStudioThemeId } from "@/modules/theme-engine";
import { frameSrc, hostControls, hostCssVars, renderStudioGuest, selectStudioTheme, type StudioSelection } from "@/modules/theme-engine/guest";

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
  if (parseStudioThemeId(res.data.theme.id)) {
    const bg = (res.data.theme.config as Record<string, unknown> | null)?.color_background;
    if (typeof bg === "string" && /^#[0-9a-f]{6}$/i.test(bg)) return { themeColor: bg };
  }
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
  const t = getGuestT(data.locale);

  // cookie-less analytics, after the response is sent (never in previews)
  const track = async (themeId: string) => {
    if (data.preview) return;
    const h = new Headers(await headers());
    const fromQr = !!firstParam(sp.t) || firstParam(sp.src) === "qr";
    after(async () => {
      const base = { restaurantId: data.restaurant.id, headers: h, tableId: data.table?.id ?? null, locale: data.locale };
      if (fromQr) await trackEvent({ ...base, type: "qr_scan", meta: { table: !!data.table } });
      await trackEvent({ ...base, type: "menu_view", meta: { mode: data.menuMode, theme: themeId } });
    });
  };

  // Studio theme (theme engine v2) → sandboxed iframe; any problem → built-in "classic" below
  if (parseStudioThemeId(data.theme.id)) {
    const row = await getGuestRestaurantRow(slug);
    const sel = row ? await selectStudioTheme(data, { plan: row.plan, activeThemeId: row.themeId, versionId: firstParam(sp.v) }) : null;
    if (sel) {
      const out = await renderStudioGuest(data, sel).catch((e: unknown) => {
        console.error("[theme-engine] render failed", e);
        return null;
      });
      if (out?.ok) {
        await track(data.theme.id);
        return <StudioPage data={data} sel={sel} t={t} />;
      }
    }
  }

  const { theme, config } = await resolveTheme(data.theme.id, data.theme.config);
  data.theme = { id: theme.manifest.id, config };
  await track(theme.manifest.id);

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

function StudioPage({ data, sel, t }: { data: GuestMenuData; sel: StudioSelection; t: ReturnType<typeof getGuestT> }) {
  const manifest = sel.pkg.manifest;
  const controls = hostControls(manifest, data);
  const vars = hostCssVars(manifest, data.theme.config);
  const withVersion = (href: string) => (data.preview ? `${href}&v=${encodeURIComponent(sel.versionId)}` : href);
  const langHrefs = Object.fromEntries(data.availableLocales.map((l) => [l.code, withVersion(guestHref(data, { lang: l.code }))]));
  return (
    <GuestFrame data={data} t={t} vars={vars} hostCartButton={controls.cart}>
      <style>{`html,body{background:${vars["--g-bg"]};overflow:hidden;overscroll-behavior:none}`}</style>
      <StudioThemeHost
        src={frameSrc(data, sel)}
        title={t("menuFrameTitle", { name: data.restaurant.name })}
        categoryIds={data.menus.flatMap((m) => m.categories.map((c) => c.id))}
        langHrefs={langHrefs}
        showLanguage={controls.language}
        languageSwitcher={<LanguageSwitcher data={data} t={t} buttonClassName="bg-g-surface/90 text-g-text border-g-border border shadow-md backdrop-blur h-11" />}
        info={<LegalFooter data={data} t={t} className="text-g-muted pt-4" />}
        hostCartBar={controls.cart}
      />
    </GuestFrame>
  );
}
