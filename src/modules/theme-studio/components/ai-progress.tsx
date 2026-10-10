"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { cn } from "@/core/utils";

const STEPS = ["analyze", "palette", "layout", "code", "check"] as const;
const STEP_SECONDS = [6, 14, 28, 50, 75];

export type AiProgressKind = "files" | "prompt" | "edit" | "printFiles" | "printPrompt";

/**
 * Progress state for AI theme generation (typically 30–90 s). Without `onDismiss` it is modal and cannot be
 * closed; with `onDismiss` the owner can let it run in the background (the caller shows a small status pill).
 * `startedAt` keeps the timer running across close/reopen.
 */
export function AiProgress({ open, kind, onDismiss, startedAt }: { open: boolean; kind: AiProgressKind; onDismiss?: () => void; startedAt?: number }) {
  return open ? <ProgressOverlay kind={kind} onDismiss={onDismiss} startedAt={startedAt} /> : null;
}

/** Seconds since `started`, ticking every 500 ms. */
export function useElapsed(started: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (started === null) return;
    const h = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(h);
  }, [started]);
  return started === null ? 0 : Math.max(0, Math.floor((now - started) / 1000));
}

function ProgressOverlay({ kind, onDismiss, startedAt }: { kind: AiProgressKind; onDismiss?: () => void; startedAt?: number }) {
  const t = useTranslations("themeStudio.progress");
  const [started] = useState(() => startedAt ?? Date.now());
  const elapsed = useElapsed(started);
  const current = STEP_SECONDS.findIndex((s) => elapsed < s);
  const active = current === -1 ? STEPS.length - 1 : current;
  const pct = Math.min(95, Math.round((elapsed / 90) * 100));
  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-stone-900/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ai-progress-title">
      <div className="relative w-full max-w-sm space-y-5 rounded-2xl bg-white p-6 text-center shadow-2xl" role="status" aria-live="polite">
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="focus-ring absolute top-3 right-3 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label={t("background")} title={t("background")}>
            <X size={18} />
          </button>
        )}
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-600">
          <Sparkles size={26} className="animate-pulse" aria-hidden />
        </div>
        <div>
          <p id="ai-progress-title" className="text-lg font-semibold text-stone-900">
            {t(`title_${kind}`)}
          </p>
          <p className="mt-1 text-sm text-stone-500">{onDismiss ? t("hintBackground") : t("hint")}</p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-violet-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <ol className="space-y-2 text-left text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-2", i > active ? "text-stone-400" : "text-stone-800")}>
              {i < active ? <Check size={16} className="text-emerald-600" aria-hidden /> : i === active ? <Loader2 size={16} className="animate-spin text-violet-600" aria-hidden /> : <span className="h-4 w-4 rounded-full border border-stone-300" aria-hidden />}
              {t(kind.startsWith("print") ? `printStep_${s}` : `step_${s}`)}
            </li>
          ))}
        </ol>
        <p className="text-xs text-stone-400 tabular-nums">{t("elapsed", { seconds: elapsed })}</p>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="focus-ring rounded-md text-sm font-medium text-violet-700 hover:underline">
            {t("background")}
          </button>
        )}
      </div>
    </div>
  );
}
