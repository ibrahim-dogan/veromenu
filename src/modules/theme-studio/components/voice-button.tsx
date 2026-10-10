"use client";
import { useLocale, useTranslations } from "next-intl";
import { Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/core/utils";
import { toast } from "@/components/ui/toast";
import { useVoiceRecorder } from "@/modules/assistant/components/use-voice-recorder";
import { transcribeThemeVoiceAction } from "../actions";

/** Record → 16 kHz WAV → transcript (appended by the caller). */
export function VoiceButton({ restaurantId, onText, disabled, className }: { restaurantId: string; onText: (text: string) => void; disabled?: boolean; className?: string }) {
  const t = useTranslations("themeStudio.voice");
  const te = useTranslations("errors");
  const locale = useLocale();
  const rec = useVoiceRecorder({
    maxSeconds: 90,
    onWav: async (wavBase64) => {
      rec.setState("processing");
      const res = await transcribeThemeVoiceAction({ restaurantId, wavBase64, uiLocale: locale });
      rec.setState("idle");
      if (res.ok) {
        if (res.data.text) onText(res.data.text);
        else toast.error(t("empty"));
      } else toast.error(te.has(res.error) ? te(res.error) : te("unexpected"));
    },
    onError: (e) => toast.error(t(`error_${e}`)),
  });
  const recording = rec.state === "recording";
  const busy = rec.state === "processing";
  return (
    <button
      type="button"
      onClick={() => (recording ? rec.stop() : rec.start())}
      disabled={disabled || busy}
      aria-pressed={recording}
      aria-label={recording ? t("stop") : t("start")}
      title={recording ? t("stop") : t("start")}
      className={cn(
        "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors disabled:opacity-50",
        recording ? "bg-red-600 text-white hover:bg-red-700" : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
        className,
      )}
    >
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : recording ? <Square size={14} aria-hidden /> : <Mic size={16} aria-hidden />}
      {recording ? <span className="tabular-nums">{`${Math.floor(rec.elapsed / 60)}:${String(rec.elapsed % 60).padStart(2, "0")}`}</span> : busy ? t("processing") : t("label")}
    </button>
  );
}
