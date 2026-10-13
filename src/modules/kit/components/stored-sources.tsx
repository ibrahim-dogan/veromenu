"use client";
/**
 * "Gespeicherte Speisekarte verwenden" for the AI design dialogs (menu theme, print design): shows the restaurant's
 * stored source documents and starts a generation from them – no second upload; the kit's design brief is reused.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Sparkles } from "lucide-react";
import { cn } from "@/core/utils";
import { Button } from "@/components/ui";
import { getStoredSourcesAction } from "../actions";
import type { KitJobDto } from "../types";

type StoredFile = KitJobDto["files"][number];

export function SourceThumbs({ files, size = "md" }: { files: StoredFile[]; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-12 w-12" : "h-16 w-16";
  return (
    <ul className="flex shrink-0 -space-x-3">
      {files.slice(0, 4).map((f) => (
        <li key={f.id} className={cn("overflow-hidden rounded-lg border-2 border-white bg-stone-100 shadow-sm", box)}>
          {f.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.thumb} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center text-stone-400">
              <FileText size={18} aria-hidden />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Renders nothing when no sources are stored (or the lookup fails). */
export function StoredSourcesOption({ restaurantId, kind, open, onUse }: { restaurantId: string; kind: "menu" | "print"; open: boolean; onUse: () => void }) {
  const t = useTranslations("kit.stored");
  const [data, setData] = useState<{ files: StoredFile[]; hasBrief: boolean } | null>(null);
  const loaded = data !== null;

  useEffect(() => {
    if (!open || loaded) return;
    let alive = true;
    getStoredSourcesAction({ restaurantId, kind })
      .then((res) => alive && setData(res.ok ? res.data : { files: [], hasBrief: false }))
      .catch(() => alive && setData({ files: [], hasBrief: false }));
    return () => {
      alive = false;
    };
  }, [open, loaded, restaurantId, kind]);

  if (!data?.files.length) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/60 p-4 sm:flex-row sm:items-center">
        <SourceThumbs files={data.files} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">{t("title")}</p>
          <p className="text-xs text-stone-600">{data.hasBrief ? t("hintBrief") : t("hint")}</p>
        </div>
        <Button size="sm" onClick={onUse} className="shrink-0 bg-violet-600 hover:bg-violet-700">
          <Sparkles size={14} aria-hidden /> {t("use")}
        </Button>
      </div>
      <p className="text-center text-xs font-medium text-stone-400 uppercase">{t("or")}</p>
    </div>
  );
}
