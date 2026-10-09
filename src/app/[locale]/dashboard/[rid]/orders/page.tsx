import { getTranslations } from "next-intl/server";
import { AlertCircle, Lock } from "lucide-react";
import { requireRestaurant } from "@/core/auth/guards";
import { Link } from "@/core/i18n/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { planHas } from "@/modules/billing/plans";
import { listBoardOrders, orderingSettings, tableOptions } from "@/modules/ordering/service";
import { OrdersView } from "@/modules/ordering/components/orders-view";

export default async function OrdersPage({ params }: PageProps<"/[locale]/dashboard/[rid]/orders">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid, "orders.view");
  const t = await getTranslations("orders");

  if (!planHas(ctx.restaurant.plan, "ordering")) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <EmptyState icon={<Lock size={28} />} title={t("locked.title")} description={t("locked.description")} />
      </>
    );
  }

  const cfg = orderingSettings(ctx.restaurant.settings);
  const [orders, tables] = await Promise.all([listBoardOrders(rid), tableOptions(rid)]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {!cfg.enabled && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle size={16} aria-hidden />
          <span className="flex-1">{t("disabledHint")}</span>
          {ctx.can("settings.manage") && (
            <Link href={`/dashboard/${rid}/settings#ordering`} className="font-medium underline underline-offset-2">
              {t("openSettings")}
            </Link>
          )}
        </div>
      )}
      <OrdersView restaurantId={rid} initialOrders={orders} canManage={ctx.can("orders.manage")} tables={tables} />
    </>
  );
}
