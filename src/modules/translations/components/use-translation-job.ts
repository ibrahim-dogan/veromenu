"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { planTranslationJob, runTranslationBatch } from "../actions";

export type JobProgress = { batch: number; batches: number; done: number; total: number; locale: string } | null;
type Totals = { translated: number; approved: number; machine: number; needsReview: number; skipped: number; failed: number };

/**
 * Runs a translation job batch by batch from the browser (no job queue needed):
 * plan → for each batch: runTranslationBatch → refresh the page so progress is visible live.
 */
export function useTranslationJob(restaurantId: string) {
  const t = useTranslations("translations");
  const te = useTranslations("errors");
  const router = useRouter();
  const [progress, setProgress] = useState<JobProgress>(null);
  const cancelled = useRef(false);

  const errorText = (code: string) => (te.has(code) ? te(code) : te("unexpected"));

  async function run(opts: { mode: "missing" | "stale" | "missing_stale" | "keys"; locales?: string[]; keys?: string[]; force?: boolean }) {
    cancelled.current = false;
    const plan = await planTranslationJob({ restaurantId, mode: opts.mode, locales: opts.locales, keys: opts.keys });
    if (!plan.ok) return void toast.error(errorText(plan.error));
    const { batches, strings, creditsNeeded, creditsRemaining } = plan.data;
    if (!batches.length) return void toast(t("jobNothing"));
    if (creditsNeeded > creditsRemaining) toast(t("jobCreditsWarning", { needed: creditsNeeded, remaining: creditsRemaining }));

    const totals: Totals = { translated: 0, approved: 0, machine: 0, needsReview: 0, skipped: 0, failed: 0 };
    let done = 0;
    for (const [i, b] of batches.entries()) {
      if (cancelled.current) break;
      setProgress({ batch: i + 1, batches: batches.length, done, total: strings, locale: b.locale });
      const res = await runTranslationBatch({ restaurantId, locale: b.locale, keys: b.keys, force: opts.force });
      if (!res.ok) {
        toast.error(errorText(res.error));
        break;
      }
      for (const k of Object.keys(totals) as (keyof Totals)[]) totals[k] += res.data[k];
      done += b.keys.length;
      setProgress({ batch: i + 1, batches: batches.length, done, total: strings, locale: b.locale });
      router.refresh();
    }
    setProgress(null);
    if (totals.translated || totals.skipped)
      toast.success(t("jobDone", { translated: totals.translated, approved: totals.approved, review: totals.needsReview }));
    router.refresh();
  }

  return {
    run,
    progress,
    running: progress !== null,
    cancel: () => {
      cancelled.current = true;
    },
  };
}
