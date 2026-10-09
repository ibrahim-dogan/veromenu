import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { requireRestaurant } from "@/core/auth/guards";
import { EmptyState, PageHeader } from "@/components/ui";
import { guestMenuUrl, listTables, tableUsage } from "@/modules/tables/service";
import { GenericQrCard } from "@/modules/tables/components/generic-qr-card";
import { TablesManager } from "@/modules/tables/components/tables-manager";

export default async function TablesPage({ params }: PageProps<"/[locale]/dashboard/[rid]/tables">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid, "tables.manage");
  const t = await getTranslations("tables");
  const tc = await getTranslations("common");
  const [rows, usage] = await Promise.all([listTables(rid), tableUsage(rid)]);
  const slug = ctx.restaurant.slug;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <GenericQrCard restaurantId={rid} url={guestMenuUrl(slug)} />
      {usage.enabled ? (
        <TablesManager
          restaurantId={rid}
          limit={usage.limit}
          hasLogo={!!ctx.restaurant.settings?.logoMediaId}
          tables={rows.map((r) => ({
            id: r.id,
            label: r.label,
            area: r.area,
            seats: r.seats,
            isActive: r.isActive,
            url: guestMenuUrl(slug, r.token),
          }))}
        />
      ) : (
        <EmptyState icon={<Lock size={28} />} title={t("locked.title")} description={t("locked.description")} action={<span className="text-sm font-medium text-brand-700">{tc("upgrade")}</span>} />
      )}
    </div>
  );
}
