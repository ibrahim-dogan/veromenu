import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { FeatureGate } from "@/components/shell/feature-gate";
import { localeInfo } from "@/core/i18n/locales";
import { planHas } from "@/modules/billing/plans";
import { getThemeWithPackage } from "@/modules/theme-engine/service";
import { StudioApp, type Panel } from "@/modules/theme-studio/components/studio/studio-app";
import { sanitizeSettings } from "@/modules/theme-studio/lib/package";

export async function generateMetadata() {
  const t = await getTranslations("themeStudio.studio");
  return { title: t("metaTitle") };
}

const PANELS: Panel[] = ["files", "customize", "ai", "versions"];

/** Theme Studio: file tree + code editor + live sandboxed preview, customizer, AI chat with diff review, versions. */
export default async function ThemeStudioPage({ params, searchParams }: PageProps<"/[locale]/dashboard/[rid]/design/studio/[themeId]">) {
  const { rid, themeId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(rid, "theme.manage");
  const r = ctx.restaurant;
  if (!planHas(r.plan, "theme_studio")) return <FeatureGate plan={r.plan} feature="theme_studio">{null}</FeatureGate>;
  if (!/^[0-9a-f-]{36}$/i.test(themeId)) notFound();

  let data: Awaited<ReturnType<typeof getThemeWithPackage>>;
  try {
    data = await getThemeWithPackage(rid, themeId);
  } catch {
    notFound();
  }
  // Library themes are only editable as a copy ("Verwenden").
  if (data.theme.restaurantId !== rid) notFound();

  const panel = typeof sp.panel === "string" && (PANELS as string[]).includes(sp.panel) ? (sp.panel as Panel) : "files";
  const locales = [...new Set([r.defaultLocale, ...r.enabledLocales])].map((code) => {
    const info = localeInfo(code);
    return { code, label: info ? `${info.flag} ${info.native}` : code };
  });

  return (
    <StudioApp
      restaurantId={rid}
      slug={r.slug}
      themeId={themeId}
      meta={{ name: data.theme.name, isActive: data.theme.isActive, currentVersionId: data.theme.currentVersionId, publishedVersionId: data.theme.publishedVersionId }}
      versionId={data.versionId}
      pkg={data.pkg}
      initialSettings={data.theme.isActive ? sanitizeSettings(data.pkg.manifest, r.themeConfig) : {}}
      initialPanel={panel}
      locales={locales}
      defaultLocale={r.defaultLocale}
      canUseAi={ctx.can("ai.use") && planHas(r.plan, "theme_studio")}
    />
  );
}
