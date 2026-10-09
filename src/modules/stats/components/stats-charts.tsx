"use client";
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { cn, formatPrice, toBcp47 } from "@/core/utils";
import { localeInfo } from "@/core/i18n/locales";
import type { StatsData } from "../service";

// Validated 2-series palette (dataviz validator: CVD ΔE 8.6, chroma ≥ 0.1, light surface).
const C1 = "#18794e";
const C2 = "#d0731a";
const GRID = "#e7e5e4";
const AXIS = "#78716c";

const tooltipStyle = {
  contentStyle: { borderRadius: 10, border: "1px solid #e7e5e4", boxShadow: "0 4px 16px rgb(0 0 0 / 0.08)", fontSize: 12 },
  labelStyle: { color: "#1c1917", fontWeight: 600, marginBottom: 4 },
};

export function StatsCharts({ data, currency, showOrders }: { data: StatsData; currency: string; showOrders: boolean }) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const bcp = toBcp47(locale);
  const dayFmt = new Intl.DateTimeFormat(bcp, { day: "2-digit", month: "2-digit" });
  const longFmt = new Intl.DateTimeFormat(bcp, { weekday: "short", day: "2-digit", month: "long" });
  const parseDay = (d: string) => new Date(`${d}T12:00:00`);
  const series = data.series.map((p) => ({ ...p, label: dayFmt.format(parseDay(p.day)), revenue: p.revenueCents / 100 }));
  const money = (cents: number) => formatPrice(cents, bcp, currency);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("charts.viewsTitle")} description={t("charts.viewsDescription")} />
          <CardBody>
            <div className="h-64" role="img" aria-label={t("charts.viewsTitle")}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                  <Tooltip
                    {...tooltipStyle}
                    labelFormatter={(_, p) => (p?.[0] ? longFmt.format(parseDay((p[0].payload as { day: string }).day)) : "")}
                  />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#44403c" }} />
                  <Line type="monotone" dataKey="views" name={t("kpi.views")} stroke={C1} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                  <Line type="monotone" dataKey="visitors" name={t("kpi.visitors")} stroke={C2} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        {showOrders ? (
          <Card>
            <CardHeader title={t("charts.revenueTitle")} description={t("charts.revenueDescription")} />
            <CardBody>
              <div className="h-64" role="img" aria-label={t("charts.revenueTitle")}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap={2}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
                    <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v)}`} />
                    <Tooltip
                      {...tooltipStyle}
                      cursor={{ fill: "#f5f5f4" }}
                      labelFormatter={(_, p) => (p?.[0] ? longFmt.format(parseDay((p[0].payload as { day: string }).day)) : "")}
                      formatter={(v, _n, item) => [
                        `${money(Math.round(Number(v) * 100))} · ${t("charts.ordersCount", { count: (item.payload as { paidOrders: number }).paidOrders })}`,
                        t("kpi.revenue"),
                      ]}
                    />
                    <Bar dataKey="revenue" name={t("kpi.revenue")} fill={C1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>
        ) : (
          <ScansByTable data={data} />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {showOrders && <ScansByTable data={data} />}
        <RankCard
          title={t("charts.topViewed")}
          empty={t("charts.noItemViews")}
          rows={data.topViewed.map((r) => ({ key: r.itemId, label: r.name, value: r.count, display: t("charts.viewsCount", { count: r.count }) }))}
        />
        {showOrders && (
          <RankCard
            title={t("charts.topOrdered")}
            empty={t("charts.noOrders")}
            rows={data.topOrdered.map((r, i) => ({
              key: `${r.name}-${i}`,
              label: r.name,
              value: r.quantity,
              display: `${r.quantity}× · ${money(r.revenueCents)}`,
            }))}
          />
        )}
        <RankCard
          title={t("charts.languages")}
          description={t("charts.languagesDescription")}
          empty={t("charts.noViews")}
          rows={data.languages.map((r) => {
            const info = localeInfo(r.locale);
            return {
              key: r.locale,
              label: info ? `${info.flag} ${info.native}` : t("charts.unknownLanguage"),
              value: r.count,
              display: percent(r.count, data.languages.reduce((s, x) => s + x.count, 0), bcp),
            };
          })}
        />
      </div>

      <Heatmap data={data} showOrders={showOrders} />
    </div>
  );
}

function percent(n: number, total: number, bcp: string) {
  return new Intl.NumberFormat(bcp, { style: "percent", maximumFractionDigits: 0 }).format(total ? n / total : 0);
}

function ScansByTable({ data }: { data: StatsData }) {
  const t = useTranslations("stats");
  const rows = data.scansByTable.map((r) => ({ name: r.tableId ? (r.label ?? t("charts.deletedTable")) : t("charts.genericQr"), count: r.count }));
  return (
    <Card>
      <CardHeader title={t("charts.scansTitle")} description={t("charts.scansDescription")} />
      <CardBody>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-500">{t("charts.noScans")}</p>
        ) : (
          <div style={{ height: Math.max(160, rows.length * 30 + 24) }} role="img" aria-label={t("charts.scansTitle")}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }} barCategoryGap={4}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "#44403c" }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} cursor={{ fill: "#f5f5f4" }} formatter={(v) => [String(v), t("kpi.scans")]} />
                <Bar dataKey="count" name={t("kpi.scans")} fill={C1} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function RankCard({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description?: string;
  rows: { key: string; label: string; value: number; display: string }[];
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-500">{empty}</p>
        ) : (
          <ol className="space-y-2.5">
            {rows.map((r, i) => (
              <li key={r.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-stone-800">
                    <span className="mr-2 tabular-nums text-stone-400">{i + 1}.</span>
                    {r.label}
                  </span>
                  <span className="shrink-0 tabular-nums text-stone-600">{r.display}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                  <div className="h-1.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: C1 }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function Heatmap({ data, showOrders }: { data: StatsData; showOrders: boolean }) {
  const t = useTranslations("stats");
  const [mode, setMode] = React.useState<"views" | "orders">("views");
  const grid = data.heatmap[mode];
  const max = Math.max(0, ...grid.flat());
  const days = t("heatmap.days").split(",");
  const hours = Array.from({ length: 24 }, (_, h) => h);
  // Sequential single-hue ramp (brand green), light → dark.
  const ramp = ["#f1f7f3", "#cfe5d7", "#9fcbb0", "#5fa47f", "#2f7d56", "#1b5a3c"];
  const color = (v: number) => (v === 0 || max === 0 ? "#f5f5f4" : ramp[Math.min(ramp.length - 1, Math.ceil((v / max) * (ramp.length - 1)))]);

  return (
    <Card>
      <CardHeader
        title={t("heatmap.title")}
        description={t("heatmap.description")}
        actions={
          showOrders ? (
            <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 text-xs">
              {(["views", "orders"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn("focus-ring rounded-md px-2.5 py-1 font-medium", mode === m ? "bg-brand-700 text-white" : "text-stone-600 hover:bg-stone-50")}
                >
                  {t(`heatmap.${m}`)}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />
      <CardBody>
        {max === 0 ? (
          <p className="py-10 text-center text-sm text-stone-500">{t("charts.noViews")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate" style={{ borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="w-10" />
                  {hours.map((h) => (
                    <th key={h} className="text-[10px] font-normal text-stone-400">
                      {h % 3 === 0 ? h : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, d) => (
                  <tr key={d}>
                    <th className="pr-2 text-right text-xs font-medium text-stone-500">{days[d]}</th>
                    {row.map((v, h) => (
                      <td
                        key={h}
                        className="h-6 rounded-[4px]"
                        style={{ background: color(v) }}
                        title={t("heatmap.cell", { day: days[d], hour: `${String(h).padStart(2, "0")}:00`, count: v })}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-stone-500">
              {t("heatmap.less")}
              {ramp.map((c) => (
                <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} />
              ))}
              {t("heatmap.more")}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
