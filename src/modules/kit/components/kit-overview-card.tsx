"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { buttonClass } from "@/components/ui";
import type { KitJobDto } from "../types";

type State = { state: "none" } | { state: "running"; jobId: string; done: number; total: number } | { state: "ready"; jobId: string };

/**
 * Overview card: "Speisekarte hochladen – wir erledigen den Rest" (nothing ran yet / empty menu), live status of a
 * running kit job (polls the job route) or "results are ready".
 */
export function KitOverviewCard({ restaurantId, initial, designs }: { restaurantId: string; initial: State; designs: boolean }) {
  const t = useTranslations("kit.card");
  const [s, setS] = useState<State>(initial);
  const href = `/dashboard/${restaurantId}/onboarding`;

  const runningId = s.state === "running" ? s.jobId : null;
  useEffect(() => {
    if (!runningId) return;
    let alive = true;
    const h = setInterval(async () => {
      try {
        const res = await fetch(`/api/restaurants/${restaurantId}/jobs/${runningId}`, { cache: "no-store" });
        const body = (await res.json()) as { ok: boolean; data?: KitJobDto };
        if (!alive || !body.ok || !body.data) return;
        const j = body.data;
        if (j.active) {
          const done = j.steps.filter((x) => x.status === "done" || x.status === "failed" || x.status === "skipped").length;
          setS({ state: "running", jobId: j.id, done, total: j.steps.length });
        } else setS({ state: "ready", jobId: j.id });
      } catch {
        /* keep the last state */
      }
    }, 5000);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [restaurantId, runningId]);

  if (s.state === "running")
    return (
      <Link href={href} className="focus-ring flex items-center gap-4 rounded-xl border border-violet-200 bg-violet-50/60 px-5 py-4 shadow-sm hover:border-violet-300">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-600 text-white">
          <Loader2 size={18} className="animate-spin" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-stone-900">{t("running", { done: s.done, total: s.total })}</span>
          <span className="mt-1.5 block h-1.5 rounded-full bg-violet-100" aria-hidden>
            <span className="block h-1.5 rounded-full bg-violet-500 transition-all" style={{ width: `${Math.max(5, (s.done / Math.max(1, s.total)) * 100)}%` }} />
          </span>
        </span>
        <span className="hidden text-sm font-medium text-violet-700 sm:inline">{t("runningCta")}</span>
        <ArrowRight size={16} className="text-violet-400" aria-hidden />
      </Link>
    );

  if (s.state === "ready")
    return (
      <Link href={href} className="focus-ring flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-5 py-4 shadow-sm hover:border-emerald-300">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
          <CheckCircle2 size={18} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 font-semibold text-stone-900">{t("ready")}</span>
        <span className="hidden text-sm font-medium text-emerald-700 sm:inline">{t("readyCta")}</span>
        <ArrowRight size={16} className="text-emerald-500" aria-hidden />
      </Link>
    );

  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-violet-50 px-5 py-5 shadow-sm sm:flex-row sm:items-center sm:px-6">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-700 text-white">
        <Upload size={22} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold text-stone-900">{t("title")}</h2>
        <p className="mt-0.5 text-sm text-stone-600">{designs ? t("hintPaid") : t("hintFree")}</p>
      </div>
      <Link href={href} className={buttonClass("primary", "lg", "shrink-0")}>
        {t("cta")} <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
}
