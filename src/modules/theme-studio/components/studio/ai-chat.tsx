"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, Loader2, Send, User } from "lucide-react";
import { cn } from "@/core/utils";
import { Button, Textarea } from "@/components/ui";
import { VoiceButton } from "../voice-button";

export type ChatMessage = { id: number; role: "user" | "ai" | "system"; text: string };
const SUGGESTIONS = ["darker", "bigger", "images", "font", "allergens"] as const;

/** Instruction (text or voice) → proposeThemeEdit; the result is reviewed as a diff in the center pane. */
export function AiChat({
  restaurantId,
  messages,
  busy,
  disabled,
  disabledHint,
  onSend,
}: {
  restaurantId: string;
  messages: ChatMessage[];
  busy: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onSend: (text: string) => void;
}) {
  const t = useTranslations("themeStudio.ai");
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length, busy]);

  const send = () => {
    const v = text.trim();
    if (v.length < 2 || busy || disabled) return;
    onSend(v);
    setText("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2">
        <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("title")}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {messages.length === 0 && (
          <div className="space-y-3 rounded-lg bg-violet-50 p-3 text-sm text-violet-900">
            <p>{t("intro")}</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => setText(t(`suggestion_${s}`))} className="focus-ring rounded-full border border-violet-200 bg-white px-2.5 py-1 text-xs text-violet-800 hover:border-violet-400">
                  {t(`suggestion_${s}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn("flex gap-2 text-sm", m.role === "user" && "flex-row-reverse")}>
            {m.role !== "system" && (
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full", m.role === "user" ? "bg-brand-100 text-brand-800" : "bg-violet-100 text-violet-700")}>
                {m.role === "user" ? <User size={13} aria-hidden /> : <Bot size={13} aria-hidden />}
              </span>
            )}
            <p
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 whitespace-pre-wrap",
                m.role === "user" ? "bg-brand-700 text-white" : m.role === "ai" ? "bg-stone-100 text-stone-800" : "mx-auto bg-transparent text-center text-xs text-stone-500",
              )}
            >
              {m.text}
            </p>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-violet-700" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden /> {t("thinking")}
          </p>
        )}
        <div ref={end} />
      </div>
      <div className="space-y-2 border-t border-stone-200 bg-white p-3">
        {disabledHint && <p className="text-xs text-amber-700">{disabledHint}</p>}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
          maxLength={4000}
          placeholder={t("placeholder")}
          disabled={disabled}
          aria-label={t("placeholder")}
        />
        <div className="flex items-center gap-2">
          <VoiceButton restaurantId={restaurantId} disabled={disabled || busy} onText={(v) => setText((p) => (p ? `${p.trimEnd()} ${v}` : v))} />
          <Button className="ml-auto bg-violet-600 hover:bg-violet-700" size="sm" onClick={send} disabled={disabled || busy || text.trim().length < 2} loading={busy}>
            {!busy && <Send size={14} aria-hidden />} {t("send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
