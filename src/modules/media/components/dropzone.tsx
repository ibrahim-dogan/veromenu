"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { UploadCloud } from "lucide-react";
import { cn } from "@/core/utils";
import { toast } from "@/components/ui/toast";
import { ACCEPT_ATTR, acceptsFile, invalidateMedia, MAX_UPLOAD_MB, uploadMedia, type MediaAccept, type MediaItem } from "./media-client";

/** Drag & drop / click upload area. Uploads sequentially and reports each stored item. */
export function Dropzone({
  restaurantId,
  accept = "any",
  multiple = true,
  onUploaded,
  compact,
  className,
}: {
  restaurantId: string;
  accept?: MediaAccept;
  multiple?: boolean;
  onUploaded?: (item: MediaItem) => void;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("media");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  const [busy, setBusy] = React.useState<{ done: number; total: number } | null>(null);
  const id = React.useId();

  async function handle(files: FileList | File[]) {
    const list = Array.from(files).slice(0, multiple ? 20 : 1);
    if (!list.length) return;
    setBusy({ done: 0, total: list.length });
    let okCount = 0;
    for (const [i, f] of list.entries()) {
      if (!acceptsFile(accept, f)) {
        toast.error(`${f.name}: ${t("errors.unsupportedType")}`);
      } else {
        const res = await uploadMedia(restaurantId, f);
        if (res.ok) {
          okCount++;
          onUploaded?.(res.item);
        } else toast.error(`${f.name}: ${t(`errors.${res.error}`)}`);
      }
      setBusy({ done: i + 1, total: list.length });
    }
    setBusy(null);
    if (okCount) {
      invalidateMedia(restaurantId);
      toast.success(t("uploaded", { count: okCount }));
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const hint = accept === "image" ? t("hintImage", { mb: MAX_UPLOAD_MB }) : accept === "pdf" ? t("hintPdf", { mb: MAX_UPLOAD_MB }) : t("hintAny", { mb: MAX_UPLOAD_MB });

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!busy) handle(e.dataTransfer.files);
      }}
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors focus-within:ring-2 focus-within:ring-brand-500",
        compact ? "px-4 py-4" : "px-6 py-8",
        over ? "border-brand-500 bg-brand-50" : "border-stone-300 bg-stone-50/60 hover:border-stone-400",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        accept={ACCEPT_ATTR[accept]}
        multiple={multiple}
        onChange={(e) => e.target.files && handle(e.target.files)}
        disabled={!!busy}
      />
      <UploadCloud className={cn("text-stone-400", compact ? "mb-1" : "mb-2")} size={compact ? 22 : 30} aria-hidden />
      {busy ? (
        <span className="text-sm font-medium text-stone-700" aria-live="polite">
          {t("uploading", { done: busy.done, total: busy.total })}
        </span>
      ) : (
        <span className="text-sm text-stone-700">
          <span className="font-medium text-brand-700 underline-offset-4 hover:underline">{t("chooseFiles")}</span> {t("orDrop")}
        </span>
      )}
      <span className="mt-1 block text-xs text-stone-500">{hint}</span>
    </label>
  );
}
