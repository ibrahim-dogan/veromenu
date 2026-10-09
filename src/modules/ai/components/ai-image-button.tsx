"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, ImageIcon, Info, Loader2, Lock, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/core/utils";
import { Button, Label, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { MediaPicker } from "@/modules/media/components/media-picker";
import { acceptAiImage, discardAiImage, generateAiImage, getAiImageContext } from "../actions";
import { IMAGE_STYLES, type AiImageContext, type ImageStyle } from "../image-types";
import { useBusyAction } from "./use-busy-action";

const STYLE_SWATCH: Record<ImageStyle, string> = {
  bright: "bg-gradient-to-br from-amber-50 via-white to-sky-50",
  rustic: "bg-gradient-to-br from-amber-700 via-amber-800 to-stone-800",
  dark: "bg-gradient-to-br from-stone-700 via-stone-900 to-black",
  minimal: "bg-white ring-1 ring-inset ring-stone-200",
};

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * CONTRACT (owned by the AI-studio module): button that opens the AI image dialog for an item or category.
 * Generates an image (optionally from a reference photo), shows a preview, and on accept saves it as
 * media (kind "ai_generated") and assigns it to the target. Calls onApplied(mediaId) afterwards.
 */
export function AiImageButton({
  restaurantId,
  target,
  onApplied,
}: {
  restaurantId: string;
  target: { type: "item" | "category"; id: string };
  onApplied?: (mediaId: string) => void;
}) {
  const t = useTranslations("aiImage");
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Sparkles size={14} className="text-brand-700" /> {t("button")}
      </Button>
      {/* keep the native dialog close/cancel events from closing a parent dialog (e.g. the item editor) */}
      <div className="contents" onClick={stop} {...({ onClose: stop, onCancel: stop } as React.HTMLAttributes<HTMLDivElement>)}>
        {open && <AiImageDialog restaurantId={restaurantId} target={target} onClose={() => setOpen(false)} onApplied={onApplied} />}
      </div>
    </>
  );
}

function AiImageDialog({
  restaurantId,
  target,
  onClose,
  onApplied,
}: {
  restaurantId: string;
  target: { type: "item" | "category"; id: string };
  onClose: () => void;
  onApplied?: (mediaId: string) => void;
}) {
  const t = useTranslations("aiImage");
  const [ctx, setCtx] = React.useState<AiImageContext | null>(null);
  const [subject, setSubject] = React.useState("");
  const [style, setStyle] = React.useState<ImageStyle>("bright");
  const [referenceId, setReferenceId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<{ token: string; previewUrl: string } | null>(null);
  const [failed, setFailed] = React.useState(false);

  const load = useBusyAction(getAiImageContext, { refresh: false });
  const generate = useBusyAction(generateAiImage, { refresh: false });
  const accept = useBusyAction(acceptAiImage, { success: t("applied") });
  const discard = useBusyAction(discardAiImage, { refresh: false });

  React.useEffect(() => {
    let alive = true;
    load.run({ restaurantId, target }).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setCtx(res.data);
        if (res.data.state === "ok") setSubject(res.data.subject);
      } else onClose();
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, target.type, target.id]);

  async function doGenerate() {
    setFailed(false);
    const res = await generate.run({ restaurantId, target, subject, style, referenceMediaId: referenceId, discardToken: draft?.token ?? null });
    if (res.ok) setDraft(res.data);
    else setFailed(true);
  }

  async function doAccept() {
    if (!draft) return;
    const res = await accept.run({ restaurantId, target, token: draft.token });
    if (res.ok) {
      onApplied?.(res.data.mediaId);
      onClose();
    }
  }

  function close() {
    if (generate.pending || accept.pending) return;
    if (draft) void discard.run({ restaurantId, token: draft.token });
    onClose();
  }

  const ok = ctx?.state === "ok" ? ctx : null;

  return (
    <Dialog
      open
      onClose={close}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={18} className="text-brand-700" /> {t("title")}
        </span>
      }
      description={ok ? ok.name : undefined}
      footer={
        ok ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={close} disabled={generate.pending || accept.pending}>
              {t("cancel")}
            </Button>
            {draft ? (
              <>
                <Button type="button" variant="secondary" onClick={doGenerate} loading={generate.pending} disabled={accept.pending || subject.trim().length < 2}>
                  {!generate.pending && <RefreshCw size={15} />} {t("regenerate")}
                </Button>
                <Button type="button" onClick={doAccept} loading={accept.pending} disabled={generate.pending}>
                  {!accept.pending && <Check size={16} />} {t("accept")}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={doGenerate} loading={generate.pending} disabled={subject.trim().length < 2}>
                {!generate.pending && <Sparkles size={15} />} {t("generate")}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {!ctx ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-stone-400" />
        </div>
      ) : !ok ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Lock size={26} className="text-stone-400" />
          <p className="font-medium text-stone-800">{t(ctx.state === "plan" ? "planTitle" : "permissionTitle")}</p>
          <p className="max-w-sm text-sm text-stone-500">{t(ctx.state === "plan" ? "planHint" : "permissionHint")}</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ai-image-subject">{t("subjectLabel")}</Label>
              <Textarea
                id="ai-image-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                rows={3}
                maxLength={600}
                className="text-base sm:text-sm"
                disabled={generate.pending}
              />
              <p className="text-xs text-stone-500">{t("subjectHint")}</p>
            </div>

            <fieldset className="space-y-1.5" disabled={generate.pending}>
              <legend className="mb-1.5 text-sm font-medium text-stone-700">{t("styleLabel")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {IMAGE_STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(s)}
                    aria-pressed={style === s}
                    className={cn(
                      "focus-ring flex items-center gap-2 rounded-lg border p-2 text-left text-sm transition-colors",
                      style === s ? "border-brand-600 bg-brand-50 text-brand-900 ring-1 ring-brand-600" : "border-stone-200 hover:border-stone-300",
                    )}
                  >
                    <span className={cn("h-7 w-7 shrink-0 rounded-md", STYLE_SWATCH[s])} aria-hidden />
                    <span className="leading-tight">{t(`styles.${s}`)}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <MediaPicker restaurantId={restaurantId} value={referenceId} onChange={setReferenceId} accept="image" label={t("referenceLabel")} />
              {ok.current && referenceId !== ok.current.id && (
                <button type="button" onClick={() => setReferenceId(ok.current!.id)} className="text-xs text-brand-700 hover:underline">
                  {t("useCurrent")}
                </button>
              )}
              <p className="text-xs text-stone-500">{t("referenceHint")}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
              {draft ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.previewUrl} alt={t("previewAlt")} className={cn("h-full w-full object-cover", generate.pending && "opacity-40")} />
              ) : ok.current ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ok.current.thumb} alt="" className="h-full w-full object-cover opacity-50 grayscale" />
              ) : (
                <ImageIcon size={36} className="text-stone-300" />
              )}
              {generate.pending && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 text-sm text-stone-700 backdrop-blur-[1px]">
                  <Loader2 size={28} className="animate-spin text-brand-700" />
                  {t("generating")}
                </div>
              )}
              {draft && !generate.pending && (
                <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{t("aiLabel")}</span>
              )}
            </div>
            {failed && <p className="text-sm text-red-700">{t("failed")}</p>}
            <p className="flex gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <Info size={14} className="mt-px shrink-0" />
              {t("transparencyNote")}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
