"use client";
import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCheck, Languages, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Select } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { toast } from "@/components/ui/toast";
import { Link } from "@/core/i18n/navigation";
import { localeInfo } from "@/core/i18n/locales";
import { cn } from "@/core/utils";
import { bulkApproveByScore } from "../actions";
import type { EffectiveStatus, LocaleProgress, TranslationListRow } from "../service";
import { TranslationRow } from "./translation-row";
import { useTranslationJob } from "./use-translation-job";

const STATUSES: EffectiveStatus[] = ["needs_review", "stale", "missing", "machine", "approved"];
const BAR: Record<EffectiveStatus, string> = {
  approved: "bg-emerald-500",
  machine: "bg-sky-400",
  needs_review: "bg-red-400",
  stale: "bg-amber-400",
  missing: "bg-stone-200",
};
const PAGE = 60;

export function TranslationsWorkspace({
  restaurantId,
  sourceLocale,
  locales,
  current,
  progress,
  rows,
}: {
  restaurantId: string;
  sourceLocale: string;
  locales: string[];
  current: string;
  progress: Record<string, LocaleProgress>;
  rows: TranslationListRow[];
}) {
  const t = useTranslations("translations");
  const uiLocale = useLocale();
  const job = useTranslationJob(restaurantId);
  const [filter, setFilter] = useState<EffectiveStatus | "all">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [minScore, setMinScore] = useState("4.5");
  const bulk = useAction(bulkApproveByScore, { onSuccess: (d) => toast.success(t("bulkDone", { n: d.count })) });

  const langName = (code: string) => {
    try {
      return new Intl.DisplayNames([uiLocale], { type: "language" }).of(code) ?? code;
    } catch {
      return localeInfo(code)?.name ?? code;
    }
  };

  const p = progress[current];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!needle || r.source.toLowerCase().includes(needle) || (r.value ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, filter, q]);
  const eligibleBulk = rows.filter((r) => r.status === "machine" && (r.qualityScore ?? 0) >= Number(minScore)).length;

  function retranslate(key: string) {
    const row = rows.find((r) => r.key === key);
    if (row?.humanApproved && !window.confirm(t("confirmOverwriteHuman"))) return;
    void job.run({ mode: "keys", keys: [key], locales: [current], force: true });
  }

  return (
    <div className="space-y-6">
      {/* language overview */}
      <Card>
        <CardHeader
          title={t("progressTitle")}
          description={t("progressDescription", { source: langName(sourceLocale) })}
          actions={
            <Button variant="secondary" size="sm" disabled={job.running} onClick={() => job.run({ mode: "missing_stale" })}>
              <Sparkles size={14} /> {t("translateAllLanguages")}
            </Button>
          }
        />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locales.map((l) => {
            const pr = progress[l];
            const pct = pr.total ? Math.round((pr.approved / pr.total) * 100) : 0;
            return (
              <Link
                key={l}
                href={`/dashboard/${restaurantId}/translations?lang=${l}`}
                aria-current={l === current ? "page" : undefined}
                className={cn(
                  "focus-ring block rounded-xl border p-3 transition-colors",
                  l === current ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500" : "border-stone-200 hover:border-stone-300",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-stone-900">
                    <span aria-hidden>{localeInfo(l)?.flag}</span> {langName(l)}
                  </span>
                  <span className="text-xs tabular-nums text-stone-500">{t("approvedPct", { pct })}</span>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden>
                  {STATUSES.slice()
                    .reverse()
                    .map((s) => (pr[s] ? <div key={s} className={BAR[s]} style={{ width: `${(pr[s] / pr.total) * 100}%` }} /> : null))}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
                  {STATUSES.map((s) =>
                    pr[s] ? (
                      <span key={s} className="inline-flex items-center gap-1">
                        <span className={cn("h-2 w-2 rounded-full", BAR[s])} aria-hidden />
                        {t(`status.${s}`)} {pr[s]}
                      </span>
                    ) : null,
                  )}
                </div>
              </Link>
            );
          })}
        </CardBody>
      </Card>

      {/* job progress */}
      {job.progress && (
        <Card className="border-brand-200 bg-brand-50/40" role="status" aria-live="polite">
          <CardBody className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2 font-medium text-brand-800">
                <RefreshCw size={15} className="animate-spin" />
                {t("jobRunning", { lang: langName(job.progress.locale), batch: job.progress.batch, batches: job.progress.batches })}
              </span>
              <Button size="sm" variant="ghost" onClick={job.cancel}>
                <X size={14} /> {t("jobCancel")}
              </Button>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full bg-brand-600 transition-all"
                style={{ width: `${Math.max(4, (job.progress.done / Math.max(1, job.progress.total)) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-brand-800/80">{t("jobCount", { done: job.progress.done, total: job.progress.total })}</p>
          </CardBody>
        </Card>
      )}

      {/* current language */}
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Languages size={18} className="text-stone-400" /> {langName(sourceLocale)} → {langName(current)}
            </span>
          }
          description={t("listDescription")}
          actions={
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" disabled={job.running || !p.missing} onClick={() => job.run({ mode: "missing", locales: [current] })}>
                <Sparkles size={14} /> {t("translateMissing", { n: p.missing })}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={job.running || !p.stale}
                onClick={() => job.run({ mode: "stale", locales: [current] })}
              >
                <RefreshCw size={14} /> {t("retranslateStale", { n: p.stale })}
              </Button>
            </div>
          }
        />
        <div className="flex flex-col gap-3 border-b border-stone-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("filterLabel")}>
            {(["all", ...STATUSES] as const).map((s) => {
              const n = s === "all" ? rows.length : p[s];
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={filter === s}
                  onClick={() => (setFilter(s), setLimit(PAGE))}
                  className={cn(
                    "focus-ring rounded-full border px-2.5 py-1 text-xs font-medium",
                    filter === s ? "border-brand-600 bg-brand-700 text-white" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50",
                  )}
                >
                  {s === "all" ? t("filterAll") : t(`status.${s}`)} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400" aria-hidden />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchPlaceholder")}
                className="h-8 w-48 pl-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={minScore} onChange={(e) => setMinScore(e.target.value)} className="h-8 w-auto text-xs" aria-label={t("bulkMinScore")}>
                {["5", "4.5", "4", "3.5"].map((s) => (
                  <option key={s} value={s}>
                    {t("bulkScoreOption", { score: s })}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                disabled={!eligibleBulk || bulk.pending}
                loading={bulk.pending}
                onClick={async () => {
                  if (!window.confirm(t("bulkConfirm", { n: eligibleBulk, score: minScore }))) return;
                  await bulk.run({ restaurantId, locale: current, minScore: Number(minScore) });
                }}
              >
                <CheckCheck size={14} /> {t("bulkApprove", { n: eligibleBulk })}
              </Button>
            </div>
          </div>
        </div>

        <div className="hidden border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_11rem] lg:gap-3">
          <span>{t("colSource", { lang: langName(sourceLocale) })}</span>
          <span>{t("colTranslationLang", { lang: langName(current) })}</span>
          <span>{t("colBackLang", { lang: langName(sourceLocale) })}</span>
          <span className="text-right">{t("colQuality")}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState title={rows.length ? t("filterEmpty") : t("noTexts")} description={rows.length ? undefined : t("noTextsHint")} />
          </div>
        ) : (
          <div>
            {filtered.slice(0, limit).map((r) => (
              <TranslationRow key={`${current}-${r.key}-${r.id ?? "x"}-${r.value ?? ""}`} restaurantId={restaurantId} locale={current} row={r} busy={job.running} onRetranslate={retranslate} />
            ))}
            {filtered.length > limit && (
              <div className="flex justify-center p-4">
                <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  {t("showMore", { n: filtered.length - limit })}
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
      <p className="text-xs text-stone-500">
        <Badge tone="blue" className="mr-1">
          {t("status.machine")}
        </Badge>
        {t("legendMachine")}
      </p>
    </div>
  );
}
