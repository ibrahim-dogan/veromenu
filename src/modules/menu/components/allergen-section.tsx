"use client";
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/core/utils";
import { Button } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { ADDITIVES, ALLERGENS, catalogLabel, type CatalogEntry } from "@/modules/allergens/catalog";
import { AllergenDetectButton } from "@/modules/allergens/components/allergen-detect-button";
import { DialogIsolate } from "@/modules/media/components/dialog-isolate";
import { confirmAllergensAction } from "../actions";
import { AllergenStatusBadge } from "./shared";
import type { EditorItem } from "./types";

/** Allergens & additives of one item: confirmed values, status, manual selection + confirmation, AI detection. */
export function AllergenSection({
  restaurantId,
  item,
  canReview,
  canUseAi,
  dirtyRecipe,
}: {
  restaurantId: string;
  item: EditorItem;
  canReview: boolean;
  canUseAi: boolean;
  /** Unsaved changes to name/description/ingredients in the form. */
  dirtyRecipe: boolean;
}) {
  const t = useTranslations("menu");
  const locale = useLocale();
  const router = useRouter();
  const syncKey = `${item.allergenStatus}|${item.allergens.join(",")}|${item.additives.join(",")}`;
  const [allergens, setAllergens] = React.useState<string[]>(item.allergens);
  const [additives, setAdditives] = React.useState<string[]>(item.additives);
  const [lastKey, setLastKey] = React.useState(syncKey);
  if (lastKey !== syncKey) {
    // server data changed (confirmation, AI detection, recipe change) → resync selection
    setLastKey(syncKey);
    setAllergens(item.allergens);
    setAdditives(item.additives);
  }
  const { run, pending } = useAction(confirmAllergensAction, { success: t("allergensConfirmed") });

  const changed =
    [...allergens].sort().join() !== [...item.allergens].sort().join() || [...additives].sort().join() !== [...item.additives].sort().join();

  const toggle = (list: string[], set: (v: string[]) => void, code: string) =>
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);

  const confirmed = item.allergenStatus === "confirmed";

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 p-4" aria-labelledby="allergen-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-stone-500" aria-hidden />
          <h3 id="allergen-heading" className="font-semibold text-stone-900">
            {t("allergensTitle")}
          </h3>
          <AllergenStatusBadge status={item.allergenStatus} />
        </div>
        {canUseAi && canReview && (
          <DialogIsolate>
            <AllergenDetectButton restaurantId={restaurantId} itemId={item.id} onDone={() => router.refresh()} />
          </DialogIsolate>
        )}
      </div>

      {item.allergenStatus === "confirmed" && (item.allergens.length || item.additives.length) ? (
        <p className="text-sm text-stone-700">
          <span className="font-medium">{t("confirmedLabel")}:</span>{" "}
          {[...ALLERGENS.filter((a) => item.allergens.includes(a.code)), ...ADDITIVES.filter((a) => item.additives.includes(a.code))]
            .map((a) => `${a.letter} ${catalogLabel(a, locale)}`)
            .join(", ")}
        </p>
      ) : item.allergenStatus === "confirmed" ? (
        <p className="text-sm text-stone-700">{t("confirmedNone")}</p>
      ) : (
        <p className="text-sm text-stone-500">{t(`allergenHint.${item.allergenStatus}`)}</p>
      )}

      {dirtyRecipe && confirmed && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("recipeChangeWarning")}</p>}

      {canReview ? (
        <>
          <CodeGrid
            legend={t("allergensLegend")}
            entries={ALLERGENS}
            selected={allergens}
            onToggle={(c) => toggle(allergens, setAllergens, c)}
            locale={locale}
          />
          <CodeGrid
            legend={t("additivesLegend")}
            entries={ADDITIVES}
            selected={additives}
            onToggle={(c) => toggle(additives, setAdditives, c)}
            locale={locale}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-stone-500">{t("confirmHint")}</p>
            <Button
              type="button"
              variant={confirmed && !changed ? "secondary" : "primary"}
              size="sm"
              loading={pending}
              onClick={() => run({ restaurantId, itemId: item.id, allergens, additives })}
            >
              <Check size={14} aria-hidden /> {confirmed && !changed ? t("reconfirm") : t("confirmAllergens")}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-stone-500">{t("noReviewPermission")}</p>
      )}
    </section>
  );
}

function CodeGrid({
  legend,
  entries,
  selected,
  onToggle,
  locale,
}: {
  legend: string;
  entries: CatalogEntry[];
  selected: string[];
  onToggle: (code: string) => void;
  locale: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-stone-700">{legend}</legend>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {entries.map((a) => {
          const on = selected.includes(a.code);
          return (
            <label
              key={a.code}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500",
                on ? "border-brand-600 bg-brand-50 text-brand-900" : "border-stone-200 hover:bg-stone-50",
              )}
            >
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(a.code)} />
              <span
                className={cn(
                  "flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-semibold",
                  on ? "bg-brand-700 text-white" : "bg-stone-100 text-stone-600",
                )}
                aria-hidden
              >
                {a.letter}
              </span>
              <span className="leading-tight">{catalogLabel(a, locale)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
