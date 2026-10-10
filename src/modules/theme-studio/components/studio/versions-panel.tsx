"use client";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Eye, History, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/core/utils";
import { Badge, Button } from "@/components/ui";
import { listVersionsAction } from "../../actions";

export type VersionRow = { id: string; number: number; note: string | null; author: string; createdAt: string };

/** Version history: preview any version, restore (creates a new version). */
export function VersionsPanel({
  restaurantId,
  themeId,
  currentVersionId,
  publishedVersionId,
  previewingId,
  refreshKey,
  onPreview,
  onRestore,
  busyId,
}: {
  restaurantId: string;
  themeId: string;
  currentVersionId: string | null;
  publishedVersionId: string | null;
  previewingId: string | null;
  refreshKey: string;
  onPreview: (v: VersionRow) => void;
  onRestore: (v: VersionRow) => void;
  busyId: string | null;
}) {
  const t = useTranslations("themeStudio.versions");
  const f = useFormatter();
  const [rows, setRows] = useState<VersionRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    listVersionsAction({ restaurantId, themeId }).then((res) => alive && setRows(res.ok ? [...res.data].sort((a, b) => b.number - a.number) : []));
    return () => {
      alive = false;
    };
  }, [restaurantId, themeId, refreshKey]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 py-2">
        <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("title")}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {rows === null ? (
          <div className="grid place-items-center py-10 text-stone-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="flex items-center gap-2 px-2 py-6 text-sm text-stone-500">
            <History size={16} aria-hidden /> {t("empty")}
          </p>
        ) : (
          <ol className="space-y-1">
            {rows.map((v) => (
              <li key={v.id} className={cn("rounded-lg border px-3 py-2", previewingId === v.id ? "border-brand-300 bg-brand-50" : "border-transparent hover:bg-stone-50")}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-semibold text-stone-900">{t("number", { number: v.number })}</span>
                  {v.id === currentVersionId && <Badge tone="blue">{t("current")}</Badge>}
                  {v.id === publishedVersionId && <Badge tone="green">{t("published")}</Badge>}
                  <Badge tone={v.author === "ai" ? "purple" : "neutral"}>{t(`author_${v.author}` as "author_user")}</Badge>
                </div>
                {v.note && <p className="mt-0.5 line-clamp-2 text-xs text-stone-600">{v.note}</p>}
                <p className="mt-0.5 text-[11px] text-stone-400">{f.dateTime(new Date(v.createdAt), { dateStyle: "medium", timeStyle: "short" })}</p>
                <div className="mt-1.5 flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onPreview(v)} aria-pressed={previewingId === v.id}>
                    <Eye size={13} aria-hidden /> {t("preview")}
                  </Button>
                  {v.id !== currentVersionId && (
                    <Button variant="ghost" size="sm" onClick={() => onRestore(v)} loading={busyId === v.id}>
                      {busyId !== v.id && <RotateCcw size={13} aria-hidden />} {t("restore")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
