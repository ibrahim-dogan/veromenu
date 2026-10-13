import { getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { PageHeader } from "@/components/ui";
import { planHas } from "@/modules/billing/plans";
import { guestMenuUrl, listTables, tableUsage } from "@/modules/tables/service";
import { printRestaurantData } from "@/modules/tables/print-designs";
import { PrintDesigns, type PrintDesignDto } from "@/modules/tables/components/print-designs";
import { getPrintSelection, listPrintDesigns, resolveThemeMedia } from "@/modules/theme-engine/service";

export async function generateMetadata() {
  const t = await getTranslations("printDesigns");
  return { title: t("pageTitle") };
}

/** QR print designs (table tents, cards, posters) – separate from table management. */
export default async function PrintPage({ params, searchParams }: PageProps<"/[locale]/dashboard/[rid]/print">) {
  const { rid } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(rid, "tables.manage");
  const t = await getTranslations("printDesigns");
  const slug = ctx.restaurant.slug;
  const [rows, usage, designList, selection, printBase] = await Promise.all([
    listTables(rid),
    tableUsage(rid),
    listPrintDesigns(rid).catch((e) => {
      console.error("[print] listPrintDesigns failed", e);
      return { own: [], library: [] };
    }),
    getPrintSelection(rid),
    printRestaurantData(ctx.restaurant),
  ]);
  const designs: PrintDesignDto[] = await Promise.all(
    [...designList.own, ...designList.library].map(async (d) => ({
      id: d.theme.id,
      name: d.theme.name,
      description: d.theme.description,
      own: d.theme.restaurantId === rid,
      pkg: d.pkg,
      media: await resolveThemeMedia(rid, d.pkg, selection?.themeId === d.theme.id ? selection.config : {}),
    })),
  );
  const tables = usage.enabled
    ? rows.map((r) => ({ id: r.id, label: r.label, area: r.area, isActive: r.isActive, url: guestMenuUrl(slug, r.token) }))
    : [];
  // ?tables=id,id – preselected from the tables page ("Ausgewählte drucken")
  const wanted = typeof sp.tables === "string" ? sp.tables.split(",") : [];
  const initialTableIds = wanted.filter((id) => tables.some((x) => x.id === id));

  return (
    <div className="space-y-6">
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      <PrintDesigns
        restaurantId={rid}
        designs={designs}
        selection={selection && designs.some((d) => d.id === selection.themeId) ? selection : null}
        tables={tables}
        base={{ ...printBase, genericUrl: guestMenuUrl(slug) }}
        canUseTables={usage.enabled}
        canUseStudio={planHas(ctx.restaurant.plan, "theme_studio")}
        cardLocale={ctx.restaurant.defaultLocale}
        initialTableIds={initialTableIds}
      />
    </div>
  );
}
