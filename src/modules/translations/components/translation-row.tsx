"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Pencil, RefreshCw, ShieldQuestion } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { cn } from "@/core/utils";
import { approveTranslation, runReviewOnly, saveTranslation } from "../actions";
import type { TranslationListRow } from "../service";
import { ScoreBadge, TranslationStatusBadge } from "./status-badges";

export function TranslationRow({
  restaurantId,
  locale,
  row,
  busy,
  onRetranslate,
}: {
  restaurantId: string;
  locale: string;
  row: TranslationListRow;
  busy: boolean;
  onRetranslate: (key: string) => void;
}) {
  const t = useTranslations("translations");
  const tc = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.value ?? "");
  const save = useAction(saveTranslation, { success: t("savedApproved"), onSuccess: () => setEditing(false) });
  const approve = useAction(approveTranslation, { success: t("approvedToast") });
  const review = useAction(runReviewOnly, { success: t("reviewedToast") });

  const canApprove = !!row.id && row.value && (row.status === "machine" || row.status === "needs_review" || row.status === "stale");
  const inputId = `tr-${row.key}`;

  return (
    <div
      className={cn(
        "grid gap-3 border-b border-stone-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)_11rem]",
        row.status === "needs_review" && "bg-red-50/40",
        row.status === "stale" && "bg-amber-50/40",
      )}
    >
      {/* source */}
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400">
          {t(`kind.${row.kind}`)} · {t(`field.${row.field}`)}
          {row.context && row.kind !== "menu" ? <span className="normal-case tracking-normal"> · {row.context}</span> : null}
        </p>
        <p className="whitespace-pre-line text-sm text-stone-900">{row.source}</p>
      </div>

      {/* translation */}
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400 lg:hidden">{t("colTranslation")}</p>
        {editing ? (
          <div className="space-y-2">
            <label htmlFor={inputId} className="sr-only">
              {t("colTranslation")}
            </label>
            <Textarea id={inputId} value={draft} onChange={(e) => setDraft(e.target.value)} rows={row.field === "description" ? 3 : 2} autoFocus />
            <div className="flex gap-2">
              <Button size="sm" loading={save.pending} disabled={!draft.trim()} onClick={() => save.run({ restaurantId, locale, key: row.key, value: draft })}>
                <Check size={14} /> {t("saveApprove")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setDraft(row.value ?? ""))}>
                {tc("cancel")}
              </Button>
            </div>
          </div>
        ) : row.value ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="focus-ring group w-full rounded-md text-left text-sm text-stone-900 hover:bg-stone-50"
            title={t("clickToEdit")}
          >
            <span className={cn("whitespace-pre-line", row.status === "stale" && "text-stone-500 line-through decoration-amber-400/60")}>{row.value}</span>
            <Pencil size={12} className="ml-1.5 inline text-stone-300 group-hover:text-stone-500" aria-hidden />
          </button>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="focus-ring rounded-md text-sm italic text-stone-400 hover:text-stone-600">
            {t("missingClickToWrite")}
          </button>
        )}
      </div>

      {/* back translation */}
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-stone-400 lg:hidden">{t("colBack")}</p>
        {row.backTranslation ? (
          <p className="whitespace-pre-line text-sm italic text-stone-600">„{row.backTranslation}“</p>
        ) : row.value ? (
          <p className="text-xs text-stone-400">{row.translatedBy === "human" ? t("noBackHuman") : t("noBack")}</p>
        ) : null}
        {row.reviewNotes && <p className="mt-2 whitespace-pre-line rounded-md bg-stone-50 px-2 py-1.5 text-xs text-stone-600">{row.reviewNotes}</p>}
      </div>

      {/* status + actions */}
      <div className="flex flex-wrap items-start gap-1.5 lg:flex-col lg:items-end">
        <div className="flex flex-wrap gap-1.5 lg:justify-end">
          <TranslationStatusBadge status={row.status} human={row.humanApproved} />
          {row.value && row.status !== "stale" && <ScoreBadge score={row.qualityScore} />}
        </div>
        <div className="flex flex-wrap gap-1 lg:justify-end">
          {canApprove && (
            <Button size="sm" variant="secondary" loading={approve.pending} onClick={() => approve.run({ restaurantId, ids: [row.id!] })}>
              <Check size={14} /> {row.status === "stale" ? t("stillValid") : t("approve")}
            </Button>
          )}
          {row.value && row.status !== "stale" && row.qualityScore == null && (
            <Button size="sm" variant="ghost" loading={review.pending} onClick={() => review.run({ restaurantId, locale, keys: [row.key] })} title={t("reviewOnlyHint")}>
              <ShieldQuestion size={14} /> {t("reviewOnly")}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRetranslate(row.key)} title={t("retranslateHint")}>
            <RefreshCw size={14} /> {row.value ? t("retranslate") : t("translate")}
          </Button>
        </div>
      </div>
    </div>
  );
}
