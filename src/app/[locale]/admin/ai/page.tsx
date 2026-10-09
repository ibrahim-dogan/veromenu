import { getFormatter, getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/core/auth/guards";
import { env } from "@/core/env";
import { ADAPTERS } from "@/core/ai/adapters";
import { listProviders, listTaskSettings, usageStats } from "@/core/ai/admin";
import { Card, CardBody, CardHeader, DataTable, PageHeader, Stat, Td, Th } from "@/components/ui";
import { ProvidersCard } from "./_components/providers-card";
import { TaskRouting } from "./_components/task-routing";

export default async function AdminAiPage() {
  await requirePlatformAdmin();
  const t = await getTranslations("adminAi");
  const fmt = await getFormatter();
  const [providers, settings, usage] = await Promise.all([listProviders(), listTaskSettings(), usageStats(30)]);
  const adapters = Object.entries(ADAPTERS).map(([id, a]) => ({ id, label: a.label, defaultBaseUrl: a.defaultBaseUrl }));
  const usd = (n: number | null | undefined) => fmt.number(n ?? 0, { style: "currency", currency: "USD", maximumFractionDigits: n && n < 1 ? 4 : 2 });
  const num = (n: number) => fmt.number(n);
  const maxDaily = Math.max(0.000001, ...usage.daily.map((d) => d.cost));
  const taskLabel = (k: string) => (t.has(`task.${k}`) ? t(`task.${k}`) : k);

  const breakdown = (title: string, rows: { key: string; calls: number; errors: number; cost: number; tokensIn: number; tokensOut: number; avgMs: number; provider?: string }[], label: (r: { key: string; provider?: string }) => React.ReactNode) => (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <CardBody>
          <p className="text-sm text-stone-500">{t("noUsage")}</p>
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <Th>{t("colName")}</Th>
                <Th className="text-right">{t("colCalls")}</Th>
                <Th className="text-right">{t("colErrors")}</Th>
                <Th className="text-right">{t("colTokens")}</Th>
                <Th className="text-right">{t("colAvg")}</Th>
                <Th className="text-right">{t("colCost")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.key}-${i}`}>
                  <Td className="max-w-64 truncate">{label(r)}</Td>
                  <Td className="text-right tabular-nums">{num(r.calls)}</Td>
                  <Td className={`text-right tabular-nums ${r.errors ? "text-red-700" : ""}`}>{num(r.errors)}</Td>
                  <Td className="text-right text-xs tabular-nums text-stone-500">
                    {num(r.tokensIn)} / {num(r.tokensOut)}
                  </Td>
                  <Td className="text-right tabular-nums text-stone-500">{fmt.number(r.avgMs / 1000, { maximumFractionDigits: 1 })} s</Td>
                  <Td className="text-right font-medium tabular-nums">{usd(r.cost)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-6">
        {!providers.length && env().OPENROUTER_API_KEY && (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("envFallbackHint")}</p>
        )}
        <ProvidersCard providers={providers} adapters={adapters} />
        <TaskRouting settings={settings} providers={providers} />

        <section className="space-y-4" aria-labelledby="usage-h">
          <h2 id="usage-h" className="text-lg font-semibold text-stone-900">
            {t("usageTitle")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("statCost")} value={usd(usage.totals.cost)} />
            <Stat label={t("statCalls")} value={num(usage.totals.calls)} />
            <Stat label={t("statErrors")} value={num(usage.totals.errors)} hint={usage.totals.calls ? t("errorRate", { pct: Math.round((usage.totals.errors / usage.totals.calls) * 100) }) : undefined} />
            <Stat label={t("statTokens")} value={`${num(usage.totals.tokensIn)} / ${num(usage.totals.tokensOut)}`} hint={t("tokensHint")} />
          </div>
          {usage.daily.length > 0 && (
            <Card>
              <CardHeader title={t("dailyTitle")} />
              <CardBody>
                <div className="flex h-28 items-end gap-1" role="img" aria-label={t("dailyTitle")}>
                  {usage.daily.map((d) => (
                    <div key={d.day} className="group relative flex-1" title={`${d.day}: ${usd(d.cost)} · ${d.calls}`}>
                      <div className="w-full rounded-t bg-brand-500/80 group-hover:bg-brand-700" style={{ height: `${Math.max(3, (d.cost / maxDaily) * 100)}px` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-stone-400">
                  <span>{usage.daily[0]?.day}</span>
                  <span>{usage.daily.at(-1)?.day}</span>
                </div>
              </CardBody>
            </Card>
          )}
          <div className="grid gap-4 xl:grid-cols-2">
            {breakdown(t("byTask"), usage.byTask, (r) => taskLabel(r.key))}
            {breakdown(t("byModel"), usage.byModel, (r) => (
              <span>
                <span className="font-mono text-xs">{r.key}</span>
                <span className="block text-[11px] text-stone-400">{r.provider}</span>
              </span>
            ))}
          </div>
          {breakdown(t("byRestaurant"), usage.byRestaurant, (r) => (r.key === "—" ? t("platform") : r.key))}
          <Card>
            <CardHeader title={t("errorsTitle")} />
            {usage.recentErrors.length === 0 ? (
              <CardBody>
                <p className="text-sm text-stone-500">{t("noErrors")}</p>
              </CardBody>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <Th>{t("colTime")}</Th>
                    <Th>{t("colTask")}</Th>
                    <Th>{t("model")}</Th>
                    <Th>{t("colRestaurant")}</Th>
                    <Th>{t("colError")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {usage.recentErrors.map((e) => (
                    <tr key={e.id}>
                      <Td className="whitespace-nowrap text-xs">{fmt.dateTime(e.createdAt, { dateStyle: "short", timeStyle: "short" })}</Td>
                      <Td>{taskLabel(e.task)}</Td>
                      <Td className="font-mono text-xs">{e.model}</Td>
                      <Td className="text-xs">{e.restaurant ?? t("platform")}</Td>
                      <Td className="max-w-md text-xs break-words text-red-700">{e.error}</Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}
