import { getLocale, getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { PageHeader } from "@/components/ui";
import { getThemeManifest, listThemeManifests } from "@/themes";
import { sanitizeConfig } from "@/themes/config";
import { planHas } from "@/modules/billing/plans";
import { parseStudioThemeId } from "@/modules/theme-engine/types";
import { getStarterPackages, listThemes, type ThemeSummary } from "@/modules/theme-engine/service";
import { DesignHub, type HubTab } from "@/modules/theme-studio/components/design-hub";
import type { ThemeCardData } from "@/modules/theme-studio/lib/client";

export async function generateMetadata() {
  const t = await getTranslations("design");
  return { title: t("title") };
}

const TABS: HubTab[] = ["mine", "new", "library", "builtin"];
const card = (s: ThemeSummary): ThemeCardData => ({
  id: s.id,
  name: s.name,
  description: s.description,
  origin: s.origin,
  currentVersionId: s.currentVersionId,
  publishedVersionId: s.publishedVersionId,
  isActive: s.isActive,
  updatedAt: new Date(s.updatedAt).toISOString(),
});

/** Design hub: active design, own studio themes, new theme (AI / template / blank / import), library, built-in themes. */
export default async function DesignPage({ params, searchParams }: PageProps<"/[locale]/dashboard/[rid]/design">) {
  const { rid } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(rid, "theme.manage");
  const [t, locale] = await Promise.all([getTranslations("design"), getLocale()]);
  const r = ctx.restaurant;
  const studioEnabled = planHas(r.plan, "theme_studio");
  const activeStudioId = parseStudioThemeId(r.themeId);

  let own: ThemeCardData[] = [];
  let library: ThemeCardData[] = [];
  let starters: { key: string; name: string; description: string | null }[] = [];
  let engineReady = true;
  if (studioEnabled || activeStudioId) {
    try {
      const res = await listThemes(rid);
      own = res.own.map(card);
      library = res.library.map(card);
    } catch (e) {
      console.error("[design] listThemes failed", e);
      engineReady = false;
    }
    if (engineReady && library.length === 0 && studioEnabled) {
      try {
        starters = (await getStarterPackages()).map((s) => ({ key: s.key, name: s.name, description: s.description[locale] ?? s.description.de ?? null }));
      } catch {
        /* no starters shipped */
      }
    }
  }

  const builtinManifest = getThemeManifest(r.themeId);
  const activeTheme = activeStudioId ? (own.find((o) => o.id === activeStudioId) ?? null) : null;
  const active = activeStudioId
    ? { kind: "studio" as const, name: activeTheme?.name ?? t("unknownTheme"), theme: activeTheme }
    : { kind: "builtin" as const, name: builtinManifest.name, theme: null };

  const requested = typeof sp.tab === "string" && (TABS as string[]).includes(sp.tab) ? (sp.tab as HubTab) : null;
  const initialTab: HubTab = requested ?? (!studioEnabled ? "builtin" : own.length ? "mine" : activeStudioId ? "mine" : "new");

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <DesignHub
        restaurantId={rid}
        slug={r.slug}
        studioEnabled={studioEnabled}
        engineReady={engineReady}
        canUseAi={ctx.can("ai.use")}
        initialTab={initialTab}
        active={active}
        own={own}
        library={library}
        starters={starters}
        builtin={{
          manifests: listThemeManifests(),
          activeId: activeStudioId ? null : builtinManifest.id,
          config: activeStudioId ? {} : sanitizeConfig(builtinManifest, r.themeConfig),
        }}
      />
    </>
  );
}
