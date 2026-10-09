"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Check, FileUp, X } from "lucide-react";
import { Badge, Button, Card, CardBody, Textarea } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { Link } from "@/core/i18n/navigation";
import { ALLERGENS } from "@/modules/allergens/catalog";
import { AllergenReviewPanel, AllergenStatusBadge, type PanelState } from "@/modules/allergens/components/allergen-review-panel";
import { ScoreBadge } from "@/modules/translations/components/status-badges";
import { acceptTranslationTask, dismissReviewTask, resolveReviewTask } from "../actions";

function DismissButton({ restaurantId, taskId }: { restaurantId: string; taskId: string }) {
  const t = useTranslations("review");
  const dismiss = useAction(dismissReviewTask, { success: t("dismissed") });
  return (
    <Button size="sm" variant="ghost" loading={dismiss.pending} onClick={() => dismiss.run({ restaurantId, taskId })} title={t("dismissHint")}>
      <X size={14} /> {t("dismiss")}
    </Button>
  );
}

export function AllergenTaskCard({
  restaurantId,
  taskId,
  reason,
  createdAt,
  state,
}: {
  restaurantId: string;
  taskId: string;
  reason: string | null;
  createdAt: string;
  state: PanelState;
}) {
  const t = useTranslations("review");
  const ta = useTranslations("allergens");
  const fmt = useFormatter();
  const conflict = reason?.startsWith("conflict:")
    ? reason
        .slice(9)
        .split(",")
        .map((c) => ALLERGENS.find((a) => a.code === c)?.letter ?? c)
        .join(", ")
    : null;
  return (
    <Card>
      <div className="flex flex-col gap-2 border-b border-stone-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-stone-900">{state.item.name}</h3>
            <AllergenStatusBadge status={state.status} />
          </div>
          <p className="mt-0.5 text-sm text-stone-500">
            {state.item.categoryName} · {fmt.relativeTime(new Date(createdAt))}
          </p>
          {(state.item.description || state.item.ingredients) && (
            <p className="mt-2 max-w-3xl text-sm text-stone-600">
              {state.item.description}
              {state.item.ingredients && (
                <span className="block text-xs text-stone-500">
                  {ta("ingredients")}: {state.item.ingredients}
                </span>
              )}
            </p>
          )}
          {conflict && <p className="mt-2 text-sm font-medium text-red-700">{t("conflict", { list: conflict })}</p>}
        </div>
        <DismissButton restaurantId={restaurantId} taskId={taskId} />
      </div>
      <CardBody>
        <AllergenReviewPanel restaurantId={restaurantId} state={state} compact />
      </CardBody>
    </Card>
  );
}

export type TranslationTaskView = {
  taskId: string;
  createdAt: string;
  localeLabel: string;
  sourceLabel: string;
  kindLabel: string;
  source: string;
  value: string;
  backTranslation: string | null;
  qualityScore: number | null;
  notes: string | null;
  outdated: boolean;
};

export function TranslationTaskCard({ restaurantId, task, canEdit }: { restaurantId: string; task: TranslationTaskView; canEdit: boolean }) {
  const t = useTranslations("review");
  const [value, setValue] = useState(task.value);
  const accept = useAction(acceptTranslationTask, { success: t("accepted") });
  const edited = value.trim() !== task.value.trim();
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge>{task.kindLabel}</Badge>
            <span className="font-medium text-stone-800">
              {task.sourceLabel} <ArrowRight size={13} className="inline" aria-hidden /> {task.localeLabel}
            </span>
            <ScoreBadge score={task.qualityScore} />
            {task.outdated && <Badge tone="yellow">{t("outdated")}</Badge>}
          </div>
          <DismissButton restaurantId={restaurantId} taskId={task.taskId} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{t("source")}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-stone-900">{task.source}</p>
          </div>
          <div>
            <label htmlFor={`tt-${task.taskId}`} className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
              {t("translation")}
            </label>
            <Textarea
              id={`tt-${task.taskId}`}
              className="mt-1"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              disabled={!canEdit}
            />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">{t("backTranslation")}</p>
            {edited ? (
              <p className="mt-1 text-xs text-stone-400">{t("backTranslationEdited")}</p>
            ) : task.backTranslation ? (
              <p className="mt-1 whitespace-pre-line text-sm italic text-stone-600">„{task.backTranslation}“</p>
            ) : (
              <p className="mt-1 text-xs text-stone-400">–</p>
            )}
          </div>
        </div>
        {task.notes && <p className="whitespace-pre-line rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-600">{task.notes}</p>}
        {canEdit && (
          <div className="flex justify-end">
            <Button size="sm" loading={accept.pending} disabled={!value.trim()} onClick={() => accept.run({ restaurantId, taskId: task.taskId, value })}>
              <Check size={14} /> {edited ? t("saveEdited") : t("acceptAsIs")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export function OtherTaskCard({
  restaurantId,
  task,
}: {
  restaurantId: string;
  task: { id: string; kind: string; title: string; reason: string | null; createdAt: string };
}) {
  const t = useTranslations("review");
  const fmt = useFormatter();
  const resolve = useAction(resolveReviewTask, { success: t("resolved") });
  return (
    <Card>
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="purple">{t(`kind.${task.kind === "menu_import" ? "menu_import" : "other"}`)}</Badge>
            <span className="font-medium text-stone-900">{task.title}</span>
          </div>
          {task.reason && <p className="mt-1 text-sm text-stone-600">{task.reason}</p>}
          <p className="mt-1 text-xs text-stone-400">{fmt.relativeTime(new Date(task.createdAt))}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1">
          {task.kind === "menu_import" && (
            <Link href={`/dashboard/${restaurantId}/import`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm text-brand-700 hover:bg-brand-50">
              <FileUp size={14} /> {t("openImport")}
            </Link>
          )}
          <Button size="sm" variant="secondary" loading={resolve.pending} onClick={() => resolve.run({ restaurantId, taskId: task.id })}>
            <Check size={14} /> {t("markResolved")}
          </Button>
          <DismissButton restaurantId={restaurantId} taskId={task.id} />
        </div>
      </CardBody>
    </Card>
  );
}
