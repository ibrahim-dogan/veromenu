"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, FileText, ImageIcon, Sparkles, X } from "lucide-react";
import { cn } from "@/core/utils";
import { Button, Label } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { DialogIsolate } from "./dialog-isolate";
import { Dropzone } from "./dropzone";
import { isPdf, useMediaList, type MediaAccept, type MediaItem } from "./media-client";

/**
 * CONTRACT (owned by the menu/media module): pick an existing media item of the restaurant or upload a new one.
 * Upload goes to POST /api/restaurants/[rid]/media (multipart "file") → { id, url, variants }.
 */
export function MediaPicker({
  restaurantId,
  value,
  onChange,
  accept = "image",
  label,
}: {
  restaurantId: string;
  value: string | null;
  onChange: (mediaId: string | null) => void;
  accept?: "image" | "pdf" | "any";
  label?: string;
}) {
  const t = useTranslations("media");
  const [open, setOpen] = React.useState(false);
  // The list is needed for the preview of the current value and inside the dialog.
  const { items } = useMediaList(restaurantId, accept, open || !!value);
  const current = value ? items?.find((m) => m.id === value) : undefined;
  const labelId = React.useId();

  return (
    <div className="space-y-1.5">
      {label && <Label id={labelId}>{label}</Label>}
      <div className="flex items-center gap-3" aria-labelledby={label ? labelId : undefined} role="group">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50 text-stone-400 hover:border-stone-300"
          aria-label={value ? t("change") : t("choose")}
        >
          {current ? <Thumb item={current} /> : <ImageIcon size={22} aria-hidden />}
        </button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {value ? t("change") : t("choose")}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X size={14} aria-hidden /> {t("removeSelection")}
            </Button>
          )}
        </div>
      </div>

      <DialogIsolate>
        <PickerDialog
          open={open}
          onClose={() => setOpen(false)}
          restaurantId={restaurantId}
          accept={accept}
          value={value}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      </DialogIsolate>
    </div>
  );
}

type Filter = "all" | "upload" | "ai_generated";

function PickerDialog({
  open,
  onClose,
  restaurantId,
  accept,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  accept: MediaAccept;
  value: string | null;
  onPick: (id: string | null) => void;
}) {
  const t = useTranslations("media");
  const { items, loading } = useMediaList(restaurantId, accept, open);
  const [filter, setFilter] = React.useState<Filter>("all");
  const list = (items ?? []).filter((m) => filter === "all" || m.kind === filter);
  const hasAi = (items ?? []).some((m) => m.kind === "ai_generated");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={t("pickerTitle")}
      description={accept === "pdf" ? t("pickerDescriptionPdf") : accept === "any" ? t("pickerDescriptionAny") : t("pickerDescription")}
      footer={
        <>
          {value && (
            <Button type="button" variant="ghost" onClick={() => onPick(null)}>
              {t("removeSelection")}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("close")}
          </Button>
        </>
      }
    >
      <Dropzone restaurantId={restaurantId} accept={accept} multiple={false} compact onUploaded={(m) => onPick(m.id)} />
      {hasAi && (
        <Tabs<Filter>
          className="mt-4"
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: t("filterAll") },
            { value: "upload", label: t("filterUploads") },
            { value: "ai_generated", label: t("filterAi") },
          ]}
        />
      )}
      <div className="mt-4">
        {loading ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-stone-100" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-500">{t("emptyPicker")}</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" role="listbox" aria-label={t("pickerTitle")}>
            {list.map((m) => {
              const selected = m.id === value;
              return (
                <li key={m.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => onPick(m.id)}
                    className={cn(
                      "focus-ring group relative block aspect-square w-full overflow-hidden rounded-lg border bg-stone-50",
                      selected ? "border-brand-600 ring-2 ring-brand-600" : "border-stone-200 hover:border-stone-400",
                    )}
                    title={m.alt ?? undefined}
                  >
                    <Thumb item={m} />
                    {m.kind === "ai_generated" && (
                      <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 rounded bg-violet-600/90 px-1 py-0.5 text-[10px] font-medium text-white">
                        <Sparkles size={10} aria-hidden /> {t("aiBadgeShort")}
                      </span>
                    )}
                    {selected && (
                      <span className="absolute top-1 right-1 rounded-full bg-brand-600 p-0.5 text-white">
                        <Check size={12} aria-hidden />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

export function Thumb({ item, className }: { item: MediaItem; className?: string }) {
  if (isPdf(item))
    return (
      <span className={cn("flex h-full w-full flex-col items-center justify-center gap-1 bg-red-50 text-red-700", className)}>
        <FileText size={24} aria-hidden />
        <span className="text-[10px] font-semibold">PDF</span>
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={item.thumb} alt={item.alt ?? ""} loading="lazy" className={cn("h-full w-full object-cover", className)} />;
}
