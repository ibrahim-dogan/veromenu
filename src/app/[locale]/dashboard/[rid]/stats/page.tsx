import { getTranslations } from "next-intl/server";
import { BarChart3, ShieldCheck } from "lucide-react";
import { requireRestaurant } from "@/core/auth/guards";
import { Link } from "@/core/i18n/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/core/utils";
import { planHas } from "@/modules/billing/plans";
import { getStats, parseRange, STATS_RANGES } from "@/modules/stats/service";
import { KpiGrid } from "@/modules/stats/components/kpi-grid";
import { StatsCharts } from "@/modules/stats/components/stats-charts";

export default async function StatsPage({ params, searchParams }: PageProps<"/[locale]/dashboard/[rid]/stats">) {
  const { rid } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(rid, "stats.view");
  const t = await getTranslations("stats");
  const range = parseRange(Array.isArray(sp.range) ? sp.range[0] : sp.range);
  const data = await getStats(rid, ctx.restaurant.timezone, range);
  const showOrders = planHas(ctx.restaurant.plan, "ordering");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm" role="group" aria-label={t("rangeLabel")}>
            {STATS_RANGES.map((r) => (
              <Link
                key={r}
                href={`/dashboard/${rid}/stats?range=${r}`}
                className={cn("focus-ring rounded-md px-3 py-1.5 text-sm font-medium", r === range ? "bg-brand-700 text-white" : "text-stone-600 hover:bg-stone-50")}
                aria-current={r === range ? "true" : undefined}
              >
                {t("range", { days: r })}
              </Link>
            ))}
          </div>
        }
      />

      <KpiGrid
        kpis={data}
        currency={ctx.restaurant.currency}
        days={range}
        keys={showOrders ? ["views", "visitors", "scans", "orders", "revenueCents", "avgOrderCents"] : ["views", "visitors", "scans"]}
      />

      {data.hasAnyData ? (
        <StatsCharts data={data} currency={ctx.restaurant.currency} showOrders={showOrders} />
      ) : (
        <EmptyState icon={<BarChart3 size={28} />} title={t("empty.title")} description={t("empty.description")} />
      )}

      <p className="flex items-start gap-2 text-xs text-stone-500">
        <ShieldCheck size={14} className="mt-px shrink-0" aria-hidden />
        {t("privacyNote")}
      </p>
    </div>
  );
}
