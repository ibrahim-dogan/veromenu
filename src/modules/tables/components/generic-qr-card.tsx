"use client";
import { useTranslations, useLocale } from "next-intl";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Card, buttonClass } from "@/components/ui";
import { CopyButton } from "./copy-button";

export function GenericQrCard({ restaurantId, url }: { restaurantId: string; url: string }) {
  const t = useTranslations("tables");
  const locale = useLocale();
  const base = `/api/restaurants/${restaurantId}/qr`;
  return (
    <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${base}?format=svg&size=320`}
        alt={t("generic.alt")}
        width={160}
        height={160}
        className="mx-auto h-40 w-40 shrink-0 rounded-lg border border-stone-200 bg-white p-1 sm:mx-0"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h2 className="font-semibold text-stone-900">{t("generic.title")}</h2>
          <p className="mt-0.5 text-sm text-stone-500">{t("generic.description")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-sm text-stone-700">{url}</code>
          <a href={url} target="_blank" rel="noreferrer" className="text-stone-500 hover:text-stone-800" aria-label={t("generic.open")}>
            <ExternalLink size={16} aria-hidden />
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={url} label={t("generic.copyLink")} />
          <a href={`${base}?format=png&size=1024&download=1`} className={buttonClass("secondary", "sm")}>
            <Download size={14} aria-hidden /> PNG
          </a>
          <a href={`${base}?format=svg&size=1024&download=1`} className={buttonClass("secondary", "sm")}>
            <Download size={14} aria-hidden /> SVG
          </a>
          <a href={`${base}/pdf?layout=tent&generic=1&locale=${locale}`} className={buttonClass("secondary", "sm")}>
            <FileText size={14} aria-hidden /> {t("generic.tentPdf")}
          </a>
        </div>
      </div>
    </Card>
  );
}
