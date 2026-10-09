import { FileText, Download, ExternalLink } from "lucide-react";
import { cn } from "@/core/utils";
import type { GuestT } from "../t";
import type { GuestMenuData } from "../types";
import { AiLabel } from "./blocks";

/**
 * PDF / image menu mode: uploaded pages shown as images; PDFs get open + download buttons
 * (phones open them in the native viewer) and an inline embed on larger screens.
 */
export function PdfMenu({ data, t, className, cardClassName }: { data: GuestMenuData; t: GuestT; className?: string; cardClassName?: string }) {
  if (!data.pdfPages.length) return <p className={cn("text-g-muted py-16 text-center", className)}>{t("menuEmpty")}</p>;
  const btn = "inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold";
  return (
    <div className={cn("space-y-6", className)}>
      {data.pdfPages.map((p, i) =>
        p.image ? (
          <figure key={p.id} className={cn("relative overflow-hidden rounded-[var(--g-radius)] shadow-sm", cardClassName)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.image.md}
              srcSet={`${p.image.sm} 480w, ${p.image.md} 1200w`}
              sizes="(min-width: 768px) 720px, 100vw"
              width={p.image.width ?? undefined}
              height={p.image.height ?? undefined}
              alt={p.image.alt ?? t("pdfPage", { n: i + 1 })}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="h-auto w-full"
            />
            {p.image.isAi && <AiLabel t={t} />}
            <figcaption className="sr-only">{t("pdfPage", { n: i + 1 })}</figcaption>
          </figure>
        ) : (
          <div key={p.id} className={cn("border-g-border bg-g-surface space-y-4 rounded-[var(--g-radius)] border p-5", cardClassName)}>
            <div className="flex items-center gap-3">
              <FileText size={28} className="text-g-primary shrink-0" aria-hidden />
              <p className="font-g-display text-lg font-semibold">{data.pdfPages.length > 1 ? t("pdfPage", { n: i + 1 }) : t("menu")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={p.url} target="_blank" rel="noopener" className={cn(btn, "bg-g-primary text-g-on-primary")}>
                <ExternalLink size={16} aria-hidden /> {t("pdfOpen")}
              </a>
              <a href={p.url} download className={cn(btn, "border-g-border border")}>
                <Download size={16} aria-hidden /> {t("pdfDownload")}
              </a>
            </div>
            <object data={p.url} type="application/pdf" aria-label={t("menu")} className="hidden h-[80vh] w-full rounded-[var(--g-radius)] md:block">
              <a href={p.url}>{t("pdfOpen")}</a>
            </object>
          </div>
        ),
      )}
    </div>
  );
}
