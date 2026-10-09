import { getFormatter, getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/core/auth/guards";
import { Link } from "@/core/i18n/navigation";
import { Badge, Card, CardBody, CardHeader, DataTable, PageHeader, Stat, Td, Th } from "@/components/ui";
import { PLANS } from "@/modules/billing/plans";
import { getPlatformOverview } from "@/modules/admin/service";
import { SignupsChart } from "@/modules/admin/components/signups-chart";

export default async function AdminHome() {
  await requirePlatformAdmin();
  const [t, f, o] = await Promise.all([getTranslations("admin"), getFormatter(), getPlatformOverview()]);
  const eur = (cents: number) => f.number(cents / 100, { style: "currency", currency: "EUR" });
  const usd = (v: number) => f.number(v, { style: "currency", currency: "USD", maximumFractionDigits: v < 10 ? 2 : 0 });
  const n = (v: number) => f.number(v);
  const planTotal = o.planMix.reduce((s, p) => s + p.count, 0);

  return (
    <>
      <PageHeader title={t("overview.title")} description={t("overview.description")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label={t("overview.kpiRestaurants")}
          value={n(o.restaurants.total)}
          hint={t("overview.kpiRestaurantsHint", { active: n(o.restaurants.active), suspended: n(o.restaurants.total - o.restaurants.active) })}
        />
        <Stat
          label={t("overview.kpiSignups")}
          value={n(o.restaurants.new7)}
          hint={t("overview.kpiSignupsHint", { month: n(o.restaurants.new30), users: n(o.users.new30) })}
        />
        <Stat label={t("overview.kpiMrr")} value={eur(o.mrrCents)} hint={t("overview.kpiMrrHint")} />
        <Stat label={t("overview.kpiViews")} value={n(o.menuViews30)} hint={t("overview.kpiViewsHint")} />
        <Stat label={t("overview.kpiOrders")} value={n(o.orders30)} hint={t("overview.kpiOrdersHint", { revenue: eur(o.orderRevenue30Cents) })} />
        <Stat
          label={t("overview.kpiAiCost")}
          value={usd(o.ai.cost)}
          hint={t("overview.kpiAiCostHint", { calls: n(o.ai.calls), failed: n(o.ai.failed) })}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title={t("overview.signupsChart")} description={t("overview.signupsChartHint")} />
          <CardBody>
            <SignupsChart data={o.weeks} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("overview.planMix")} description={t("overview.planMixHint")} />
          <CardBody className="space-y-4">
            {o.planMix.map((p) => {
              const pct = planTotal ? Math.round((p.count / planTotal) * 100) : 0;
              const price = PLANS.find((x) => x.id === p.plan)!.priceMonthlyCents;
              return (
                <div key={p.plan}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-stone-800">
                      {t(`plans.${p.plan}`)} <span className="font-normal text-stone-400">· {eur(price)}</span>
                    </span>
                    <span className="tabular-nums text-stone-600">
                      {n(p.count)} <span className="text-stone-400">({pct} %)</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className={p.plan === "pro" ? "h-full bg-brand-700" : p.plan === "starter" ? "h-full bg-brand-400" : "h-full bg-stone-300"}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={t("overview.topRestaurants")} description={t("overview.topRestaurantsHint")} />
        {o.topByViews.length ? (
          <div className="p-3">
            <DataTable className="border-0">
              <thead>
                <tr>
                  <Th>#</Th>
                  <Th>{t("restaurants.colName")}</Th>
                  <Th>{t("restaurants.colPlan")}</Th>
                  <Th className="text-right">{t("overview.views")}</Th>
                </tr>
              </thead>
              <tbody>
                {o.topByViews.map((r, i) => (
                  <tr key={r.id} className="hover:bg-stone-50">
                    <Td className="w-10 tabular-nums text-stone-400">{i + 1}</Td>
                    <Td>
                      <Link href={`/admin/restaurants/${r.id}`} className="font-medium text-stone-900 hover:text-brand-700">
                        {r.name}
                      </Link>
                      <span className="ml-2 text-xs text-stone-400">/{r.slug}</span>
                    </Td>
                    <Td>
                      <Badge tone={r.plan === "pro" ? "purple" : r.plan === "starter" ? "blue" : "neutral"}>{t(`plans.${r.plan}`)}</Badge>
                    </Td>
                    <Td className="text-right font-medium tabular-nums">{n(r.views)}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        ) : (
          <CardBody>
            <p className="text-sm text-stone-500">{t("overview.noData")}</p>
          </CardBody>
        )}
      </Card>
    </>
  );
}
