"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/core/utils";

const STEPS = ["analyze", "palette", "layout", "code", "check"] as const;
const STEP_SECONDS = [6, 14, 28, 50, 75];

/** Non-dismissable progress state for AI theme generation (typically 30–90 s). */
export function AiProgress({ open, kind }: { open: boolean; kind: "files" | "prompt" | "edit" }) {
  return open ? <ProgressOverlay kind={kind} /> : null;
}

function ProgressOverlay({ kind }: { kind: "files" | "prompt" | "edit" }) {
  const t = useTranslations("themeStudio.progress");
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(h);
  }, []);
  const elapsed = Math.floor((now - started) / 1000);
  const current = STEP_SECONDS.findIndex((s) => elapsed < s);
  const active = current === -1 ? STEPS.length - 1 : current;
  const pct = Math.min(95, Math.round((elapsed / 90) * 100));

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-stone-900/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-white p-6 text-center shadow-2xl" role="status" aria-live="polite">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-600">
          <Sparkles size={26} className="animate-pulse" aria-hidden />
        </div>
        <div>
          <p className="text-lg font-semibold text-stone-900">{t(`title_${kind}`)}</p>
          <p className="mt-1 text-sm text-stone-500">{t("hint")}</p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-violet-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <ol className="space-y-2 text-left text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-2", i > active ? "text-stone-400" : "text-stone-800")}>
              {i < active ? <Check size={16} className="text-emerald-600" aria-hidden /> : i === active ? <Loader2 size={16} className="animate-spin text-violet-600" aria-hidden /> : <span className="h-4 w-4 rounded-full border border-stone-300" aria-hidden />}
              {t(`step_${s}`)}
            </li>
          ))}
        </ol>
        <p className="text-xs text-stone-400 tabular-nums">{t("elapsed", { seconds: elapsed })}</p>
      </div>
    </div>
  );
}
