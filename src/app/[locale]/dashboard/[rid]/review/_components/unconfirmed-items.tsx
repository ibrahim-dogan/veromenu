"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { Button, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { ALLERGENS } from "@/modules/allergens/catalog";
import { detectAllergensChunk } from "@/modules/allergens/actions";
import { AllergenDetectButton } from "@/modules/allergens/components/allergen-detect-button";
import { AllergenStatusBadge } from "@/modules/allergens/components/allergen-review-panel";
import type { AllergenStatus } from "@/core/db/schema";

export type UnconfirmedItem = {
  id: string;
  name: string;
  categoryName: string;
  status: AllergenStatus;
  hasFreshSuggestion: boolean;
  suggestedContains: string[];
};

const CHUNK = 5;

export function UnconfirmedItems({ restaurantId, items, creditsRemaining }: { restaurantId: string; items: UnconfirmedItem[]; creditsRemaining: number }) {
  const t = useTranslations("allergens");
  const te = useTranslations("errors");
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const cancelled = useRef(false);
  const todo = items.filter((i) => !i.hasFreshSuggestion);

  async function bulk() {
    if (!todo.length) return void toast(t("bulkNothing"));
    const calls = Math.ceil(todo.length / CHUNK);
    if (!window.confirm(t("bulkConfirm", { n: todo.length, credits: calls }))) return;
    if (calls > creditsRemaining) toast(t("bulkCreditsWarning", { needed: calls, remaining: creditsRemaining }));
    cancelled.current = false;
    let done = 0;
    let review = 0;
    setProgress({ done, total: todo.length });
    for (let i = 0; i < todo.length; i += CHUNK) {
      if (cancelled.current) break;
      const chunk = todo.slice(i, i + CHUNK).map((x) => x.id);
      const res = await detectAllergensChunk({ restaurantId, itemIds: chunk });
      if (!res.ok) {
        toast.error(te.has(res.error) ? te(res.error) : te("unexpected"));
        break;
      }
      done += res.data.done;
      review += res.data.needsReview;
      setProgress({ done, total: todo.length });
      router.refresh();
    }
    setProgress(null);
    if (done) toast.success(t("bulkDone", { count: done, review }));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader
        title={t("unconfirmedTitle", { n: items.length })}
        description={t("unconfirmedDescription")}
        actions={
          items.length > 0 ? (
            <Button size="sm" onClick={bulk} disabled={!!progress || !todo.length}>
              <Sparkles size={14} /> {t("bulkButton")} {todo.length ? `(${todo.length})` : ""}
            </Button>
          ) : undefined
        }
      />
      {progress && (
        <div className="space-y-1.5 border-b border-stone-100 bg-brand-50/40 px-5 py-3" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-sm text-brand-800">
            <span>{t("bulkProgress", { done: progress.done, total: progress.total })}</span>
            <Button size="sm" variant="ghost" onClick={() => (cancelled.current = true)}>
              <X size={14} /> {t("cancel")}
            </Button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.max(4, (progress.done / progress.total) * 100)}%` }} />
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <CardBody>
          <EmptyState title={t("allConfirmedTitle")} description={t("allConfirmedDescription")} />
        </CardBody>
      ) : (
        <ul className="divide-y divide-stone-100">
          {items.map((it) => (
            <li key={it.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">{it.name}</span>
                  <AllergenStatusBadge status={it.status} />
                </div>
                <p className="text-xs text-stone-500">
                  {it.categoryName}
                  {it.hasFreshSuggestion && (
                    <>
                      {" · "}
                      {it.suggestedContains.length
                        ? t("suggestedShort", { list: it.suggestedContains.map((c) => ALLERGENS.find((a) => a.code === c)?.letter ?? c).join(", ") })
                        : t("suggestedNone")}
                    </>
                  )}
                </p>
              </div>
              <AllergenDetectButton restaurantId={restaurantId} itemId={it.id} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
