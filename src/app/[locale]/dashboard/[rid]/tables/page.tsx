import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { requireRestaurant } from "@/core/auth/guards";
import { EmptyState, PageHeader } from "@/components/ui";
import { planHas } from "@/modules/billing/plans";
import { guestMenuUrl, listTables, tableUsage } from "@/modules/tables/service";
import { printRestaurantData } from "@/modules/tables/print-designs";
import { GenericQrCard } from "@/modules/tables/components/generic-qr-card";
import { TablesManager } from "@/modules/tables/components/tables-manager";
import { PrintDesigns, type PrintDesignDto } from "@/modules/tables/components/print-designs";
import { getPrintSelection, listPrintDesigns, resolveThemeMedia } from "@/modules/theme-engine/service";

export default async function TablesPage({ params }: PageProps<"/[locale]/dashboard/[rid]/tables">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid, "tables.manage");
  const t = await getTranslations("tables");
  const tc = await getTranslations("common");
  const [rows, usage] = await Promise.all([listTables(rid), tableUsage(rid)]);
  const slug = ctx.restaurant.slug;
  const tableDtos = rows.map((r) => ({
    id: r.id,
    label: r.label,
    area: r.area,
    seats: r.seats,
    isActive: r.isActive,
    url: guestMenuUrl(slug, r.token),
  }));

  // ---- QR print designs (theme packages of kind "print")
  const [designList, selection, printBase] = await Promise.all([
    listPrintDesigns(rid).catch((e) => {
      console.error("[tables] listPrintDesigns failed", e);
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

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <GenericQrCard restaurantId={rid} url={guestMenuUrl(slug)} />
      {usage.enabled ? (
        <TablesManager restaurantId={rid} limit={usage.limit} hasLogo={!!ctx.restaurant.settings?.logoMediaId} tables={tableDtos} />
      ) : (
        <EmptyState icon={<Lock size={28} />} title={t("locked.title")} description={t("locked.description")} action={<span className="text-sm font-medium text-brand-700">{tc("upgrade")}</span>} />
      )}
      <PrintDesigns
        restaurantId={rid}
        designs={designs}
        selection={selection && designs.some((d) => d.id === selection.themeId) ? selection : null}
        tables={usage.enabled ? tableDtos.map(({ id, label, area, isActive, url }) => ({ id, label, area, isActive, url })) : []}
        base={{ ...printBase, genericUrl: guestMenuUrl(slug) }}
        canUseTables={usage.enabled}
        canUseStudio={planHas(ctx.restaurant.plan, "theme_studio")}
        cardLocale={ctx.restaurant.defaultLocale}
      />
    </div>
  );
}
