import { getLocale, getTranslations } from "next-intl/server";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui";
import { cn, formatPrice, toBcp47 } from "@/core/utils";
import type { KpiSet, Kpis } from "../service";

type Key = "views" | "visitors" | "scans" | "orders" | "revenueCents" | "avgOrderCents";

/** KPI tiles with trend vs. the previous period of equal length. Server component. */
export async function KpiGrid({
  kpis,
  currency,
  keys = ["views", "visitors", "scans", "orders", "revenueCents", "avgOrderCents"],
  days,
}: {
  kpis: KpiSet;
  currency: string;
  keys?: Key[];
  days: number;
}) {
  const t = await getTranslations("stats");
  const bcp = toBcp47(await getLocale());
  const num = new Intl.NumberFormat(bcp);
  const pct = new Intl.NumberFormat(bcp, { style: "percent", maximumFractionDigits: 0, signDisplay: "always" });
  const label: Record<Key, string> = {
    views: t("kpi.views"),
    visitors: t("kpi.visitors"),
    scans: t("kpi.scans"),
    orders: t("kpi.orders"),
    revenueCents: t("kpi.revenue"),
    avgOrderCents: t("kpi.avgOrder"),
  };
  const fmt = (k: Key, v: number) => (k === "revenueCents" || k === "avgOrderCents" ? formatPrice(v, bcp, currency) : num.format(v));

  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", { 6: "xl:grid-cols-6", 5: "lg:grid-cols-5", 4: "lg:grid-cols-4" }[keys.length])}>
      {keys.map((k) => {
        const cur = (kpis.current as Kpis)[k];
        const prev = (kpis.previous as Kpis)[k];
        const delta = prev > 0 ? (cur - prev) / prev : null;
        return (
          <Card key={k} className="px-4 py-3.5">
            <p className="truncate text-xs font-medium text-stone-500">{label[k]}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-stone-900 sm:text-2xl">{fmt(k, cur)}</p>
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-0.5 text-xs tabular-nums",
                delta == null || Math.abs(delta) < 0.005 ? "text-stone-400" : delta > 0 ? "text-emerald-700" : "text-red-700",
              )}
              title={t("kpi.previous", { value: fmt(k, prev), days })}
            >
              {delta == null || Math.abs(delta) < 0.005 ? (
                <Minus size={12} aria-hidden />
              ) : delta > 0 ? (
                <ArrowUpRight size={12} aria-hidden />
              ) : (
                <ArrowDownRight size={12} aria-hidden />
              )}
              {delta == null ? t("kpi.noTrend") : t("kpi.trend", { value: pct.format(delta) })}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
