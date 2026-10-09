"use client";
import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Info, Scale } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { cn } from "@/core/utils";
import { ADDITIVES, ALLERGENS, catalogLabel } from "../catalog";
import { confirmItemAllergens } from "../actions";
import type { AllergenState, VerdictEntry } from "../service";

export type PanelState = AllergenState & { canConfirm: boolean };

const STATUS_TONE = { unknown: "neutral", ai_suggested: "blue", needs_review: "red", confirmed: "green" } as const;

export function AllergenStatusBadge({ status }: { status: AllergenState["status"] }) {
  const t = useTranslations("allergens");
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

/**
 * Shows an AI allergen suggestion (contains / maybe / not detected with reasons, confidence and chef questions)
 * and lets a reviewer tick the final set and confirm it. Used in the item dialog and inline in the review center.
 */
export function AllergenReviewPanel({
  restaurantId,
  state,
  onConfirmed,
  compact,
}: {
  restaurantId: string;
  state: PanelState;
  onConfirmed?: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("allergens");
  const locale = useLocale();
  const fmt = useFormatter();
  const s = state.suggestion;
  const byCode = new Map((s?.allergens ?? []).map((a) => [a.code, a]));
  const addByCode = new Map((s?.additives ?? []).map((a) => [a.code, a]));

  const initialAllergens =
    state.status === "confirmed" || !s ? state.confirmed.allergens : s.allergens.filter((a) => a.status === "contains").map((a) => a.code);
  const initialAdditives =
    state.status === "confirmed" || !s ? state.confirmed.additives : s.additives.filter((a) => a.status === "contains").map((a) => a.code);
  const [allergens, setAllergens] = useState<string[]>(initialAllergens);
  const [additives, setAdditives] = useState<string[]>(initialAdditives);
  const [ack, setAck] = useState(false);
  const [showAdditives, setShowAdditives] = useState(initialAdditives.length > 0 || (s?.additives.length ?? 0) > 0);
  const confirm = useAction(confirmItemAllergens, { success: t("confirmedToast"), onSuccess: () => onConfirmed?.() });

  const contains = s?.allergens.filter((a) => a.status === "contains") ?? [];
  const maybe = s?.allergens.filter((a) => a.status === "may_contain") ?? [];
  const uncertainNot = s?.allergens.filter((a) => a.status === "not_detected" && a.confidence < 0.8) ?? [];
  const toggle = (list: string[], set: (v: string[]) => void, code: string) =>
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
  const label = (code: string) => {
    const e = ALLERGENS.find((a) => a.code === code);
    return e ? `${e.letter} · ${catalogLabel(e, locale)}` : code;
  };
  const addLabel = (code: string) => {
    const e = ADDITIVES.find((a) => a.code === code);
    return e ? `${e.letter} · ${catalogLabel(e, locale)}` : code;
  };
  const pct = (n: number) => fmt.number(n, { style: "percent", maximumFractionDigits: 0 });

  const Entry = ({ e, tone, name }: { e: VerdictEntry; tone: "red" | "amber" | "stone"; name: string }) => (
    <li className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-3">
      <span
        className={cn(
          "shrink-0 text-sm font-medium sm:w-56",
          tone === "red" && "text-red-700",
          tone === "amber" && "text-amber-800",
          tone === "stone" && "text-stone-700",
        )}
      >
        {name}
      </span>
      <span className="text-sm text-stone-600">
        {e.reason}{" "}
        <span className={cn("whitespace-nowrap text-xs", e.confidence < 0.8 ? "font-medium text-amber-700" : "text-stone-400")}>
          ({t("confidence", { value: pct(e.confidence) })})
        </span>
      </span>
    </li>
  );

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <AllergenStatusBadge status={state.status} />
          {state.status === "confirmed" && state.confirmed.at && (
            <span className="text-stone-500">{t("confirmedAt", { date: fmt.dateTime(new Date(state.confirmed.at), { dateStyle: "medium", timeStyle: "short" }) })}</span>
          )}
          {s && <span className="text-xs text-stone-400">{t("aiSource", { model: s.model })}</span>}
        </div>
      )}

      {s && !state.fresh && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {t("notFresh")}
        </p>
      )}

      {s ? (
        <div className="space-y-3">
          {s.reviewReasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {s.reviewReasons.map((r) => (
                <Badge key={r} tone="yellow">
                  {t.has(`reviewReason.${r}`) ? t(`reviewReason.${r}`) : r}
                </Badge>
              ))}
            </div>
          )}
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-red-700">{t("contains")}</h4>
            {contains.length ? (
              <ul className="divide-y divide-stone-100">
                {contains.map((e) => (
                  <Entry key={e.code} e={e} tone="red" name={label(e.code)} />
                ))}
              </ul>
            ) : (
              <p className="py-1 text-sm text-stone-500">{t("containsNone")}</p>
            )}
          </section>
          {maybe.length > 0 && (
            <section className="rounded-lg bg-amber-50/70 px-3 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">{t("mayContain")}</h4>
              <ul className="divide-y divide-amber-100">
                {maybe.map((e) => (
                  <Entry key={e.code} e={e} tone="amber" name={label(e.code)} />
                ))}
              </ul>
            </section>
          )}
          {uncertainNot.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{t("uncertainNotDetected")}</h4>
              <ul className="divide-y divide-stone-100">
                {uncertainNot.map((e) => (
                  <Entry key={e.code} e={e} tone="stone" name={label(e.code)} />
                ))}
              </ul>
            </section>
          )}
          {s.additives.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">{t("additivesSuggested")}</h4>
              <ul className="divide-y divide-stone-100">
                {s.additives.map((e) => (
                  <Entry key={e.code} e={e} tone={e.status === "contains" ? "red" : "amber"} name={addLabel(e.code)} />
                ))}
              </ul>
            </section>
          )}
          {s.questions.length > 0 && (
            <section className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-800">
                <CircleHelp size={14} /> {t("questionsTitle")}
              </h4>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-sky-950">
                {s.questions.map((q, i) => (
                  <li key={i}>
                    {q.question}
                    {q.allergens.length > 0 && (
                      <span className="ml-1 text-xs text-sky-700">({q.allergens.map((c) => ALLERGENS.find((a) => a.code === c)?.letter ?? c).join(", ")})</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <p className="text-sm text-stone-500">{t("noSuggestion")}</p>
      )}

      {/* final selection */}
      <fieldset className="rounded-xl border border-stone-200 p-3">
        <legend className="px-1 text-sm font-semibold text-stone-900">{t("finalSelection")}</legend>
        <p className="mb-2 text-xs text-stone-500">{t("finalSelectionHint")}</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {ALLERGENS.map((a) => {
            const v = byCode.get(a.code);
            return (
              <label
                key={a.code}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-stone-50",
                  allergens.includes(a.code) && "bg-red-50/70",
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-700"
                  checked={allergens.includes(a.code)}
                  onChange={() => toggle(allergens, setAllergens, a.code)}
                  disabled={!state.canConfirm}
                />
                <span aria-hidden>{a.icon}</span>
                <span className="flex-1">{label(a.code)}</span>
                {v?.status === "may_contain" && <span className="h-2 w-2 rounded-full bg-amber-400" title={t("mayContain")} />}
                {v?.status === "contains" && <span className="h-2 w-2 rounded-full bg-red-500" title={t("contains")} />}
              </label>
            );
          })}
        </div>
        <button
          type="button"
          className="focus-ring mt-3 inline-flex items-center gap-1 rounded text-sm font-medium text-stone-700 hover:text-stone-900"
          aria-expanded={showAdditives}
          onClick={() => setShowAdditives((v) => !v)}
        >
          <ChevronDown size={15} className={cn("transition-transform", showAdditives && "rotate-180")} /> {t("additivesHeading")} ({additives.length})
        </button>
        {showAdditives && (
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {ADDITIVES.map((a) => (
              <label key={a.code} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-stone-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-700"
                  checked={additives.includes(a.code)}
                  onChange={() => toggle(additives, setAdditives, a.code)}
                  disabled={!state.canConfirm}
                />
                <span className="flex-1">{addLabel(a.code)}</span>
                {addByCode.get(a.code) && (
                  <span className={cn("h-2 w-2 rounded-full", addByCode.get(a.code)!.status === "contains" ? "bg-red-500" : "bg-amber-400")} />
                )}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <p className="flex items-start gap-2 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600">
        <Scale size={14} className="mt-0.5 shrink-0" /> {t("legalHint")}
      </p>

      {state.canConfirm ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-stone-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-700" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            {t("acknowledge")}
          </label>
          <Button
            disabled={!ack}
            loading={confirm.pending}
            onClick={() => confirm.run({ restaurantId, itemId: state.item.id, allergens, additives })}
          >
            <CheckCircle2 size={16} /> {allergens.length ? t("confirm", { n: allergens.length }) : t("confirmNone")}
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-stone-500">
          <Info size={15} /> {t("noPermission")}
        </p>
      )}
    </div>
  );
}
