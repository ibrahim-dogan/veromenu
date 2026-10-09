"use client";
/**
 * CONTRACT (owned by the AI-quality module): runs AI allergen/additive detection for one item and
 * shows the suggestion (per allergen: contains / may contain / unlikely + reason + confidence).
 * The user confirms or edits → confirmAllergens(). Ambiguous results create a review task.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { useAction } from "@/components/use-action";
import { detectItemAllergens, loadAllergenState } from "../actions";
import { AllergenReviewPanel, type PanelState } from "./allergen-review-panel";

export function AllergenDetectButton({ restaurantId, itemId, onDone }: { restaurantId: string; itemId: string; onDone?: () => void }) {
  const t = useTranslations("allergens");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PanelState | null>(null);
  const [version, setVersion] = useState(0);
  const load = useAction(loadAllergenState, { refresh: false });
  const detect = useAction(detectItemAllergens, {});

  async function runDetect() {
    const res = await detect.run({ restaurantId, itemId });
    if (res.ok) {
      setState(res.data);
      setVersion((v) => v + 1);
    }
  }

  async function openDialog() {
    setOpen(true);
    setState(null);
    const res = await load.run({ restaurantId, itemId });
    if (!res.ok) return;
    setState(res.data);
    setVersion((v) => v + 1);
    // Analyse automatically when there is no up-to-date suggestion for an unconfirmed item.
    if (res.data.status !== "confirmed" && !res.data.fresh) await runDetect();
  }

  const busy = load.pending || detect.pending;

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={openDialog}>
        <ShieldCheck size={15} /> {t("detectButton")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title={state ? state.item.name : t("dialogTitle")}
        description={state ? `${t("dialogTitle")} · ${state.item.categoryName}` : undefined}
      >
        {detect.pending ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-stone-600" role="status" aria-live="polite">
            <Sparkles size={24} className="animate-pulse text-brand-600" />
            {t("analysing")}
          </div>
        ) : !state ? (
          <div className="flex justify-center py-12" role="status">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-stone-300 border-t-transparent" aria-label="…" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={runDetect}>
                {state.suggestion ? <RefreshCw size={14} /> : <Sparkles size={14} />}
                {state.suggestion ? t("redetect") : t("suggestNow")}
              </Button>
            </div>
            <AllergenReviewPanel
              key={version}
              restaurantId={restaurantId}
              state={state}
              onConfirmed={() => {
                setOpen(false);
                onDone?.();
              }}
            />
          </div>
        )}
      </Dialog>
    </>
  );
}
