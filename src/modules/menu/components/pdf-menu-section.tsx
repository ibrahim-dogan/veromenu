"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronDown, FileText, Trash2 } from "lucide-react";
import { cn } from "@/core/utils";
import { Badge, Button } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { Dropzone } from "@/modules/media/components/dropzone";
import { MediaPicker } from "@/modules/media/components/media-picker";
import type { MediaItem } from "@/modules/media/components/media-client";
import { setMenuPdfMediaAction } from "../actions";
import type { EditorContext, EditorMedia, EditorMenu } from "./types";

/** Paper menu as PDFs / photos for one menu (menus.pdfMediaIds), shown to guests in PDF mode. */
export function PdfMenuSection({ menu, ctx, pdfMode }: { menu: EditorMenu; ctx: EditorContext; pdfMode: boolean }) {
  const t = useTranslations("menu");
  const [open, setOpen] = React.useState(pdfMode || menu.pdfMediaIds.length > 0);
  const [ids, setIds] = React.useState<string[]>(menu.pdfMediaIds);
  const [synced, setSynced] = React.useState(menu.pdfMediaIds);
  if (synced !== menu.pdfMediaIds) {
    setSynced(menu.pdfMediaIds);
    setIds(menu.pdfMediaIds);
  }
  const [extra, setExtra] = React.useState<Record<string, EditorMedia>>({});
  const latest = React.useRef(ids);
  React.useEffect(() => {
    latest.current = ids;
  }, [ids]);
  const save = useAction(setMenuPdfMediaAction);
  const canEdit = ctx.perms.edit;

  function commit(next: string[]) {
    latest.current = next;
    setIds(next);
    save.run({ restaurantId: ctx.restaurantId, menuId: menu.id, mediaIds: next });
  }
  const remember = (m: MediaItem) =>
    setExtra((x) => ({ ...x, [m.id]: { id: m.id, thumb: m.thumb, url: m.url, mime: m.mime, alt: m.alt, kind: m.kind } }));
  const lookup = (id: string) => ctx.mediaMap[id] ?? extra[id];
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    commit(next);
  };

  return (
    <section className={cn("rounded-xl border bg-white shadow-sm", pdfMode ? "border-brand-300" : "border-stone-200")}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left"
      >
        <FileText size={18} className="text-stone-500" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-semibold text-stone-900">
            {t("pdfTitle")}
            {ids.length > 0 && <Badge tone={pdfMode ? "green" : "neutral"}>{t("pdfCount", { count: ids.length })}</Badge>}
          </span>
          <span className="block text-sm text-stone-500">{pdfMode ? t("pdfDescriptionActive") : t("pdfDescription")}</span>
        </span>
        <ChevronDown size={16} className={cn("text-stone-400 transition-transform", !open && "-rotate-90")} aria-hidden />
      </button>

      {open && (
        <div className="space-y-4 border-t border-stone-100 px-4 py-4">
          {pdfMode && ids.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("pdfEmptyWarning")}</p>}
          {ids.length > 0 && (
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {ids.map((id, i) => {
                const m = lookup(id);
                const pdf = m?.mime === "application/pdf";
                return (
                  <li key={id} className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                    <a href={m?.url} target="_blank" rel="noreferrer" className="relative block aspect-[3/4] bg-stone-50">
                      {m && !pdf ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.thumb} alt={m.alt ?? ""} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-red-700">
                          <FileText size={28} aria-hidden />
                          <span className="text-xs font-semibold">PDF</span>
                        </span>
                      )}
                      <span className="absolute top-1.5 left-1.5 rounded bg-stone-900/75 px-1.5 text-xs font-medium text-white">
                        {t("page", { n: i + 1 })}
                      </span>
                    </a>
                    {canEdit && (
                      <div className="flex justify-between border-t border-stone-100 px-1 py-1">
                        <div className="flex">
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("moveUp")}>
                            <ArrowUp size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={i === ids.length - 1}
                            onClick={() => move(i, 1)}
                            aria-label={t("moveDown")}
                          >
                            <ArrowDown size={14} />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-50"
                          onClick={() => commit(ids.filter((x) => x !== id))}
                          aria-label={t("removeFromPdf")}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {canEdit && (
            <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
              <Dropzone
                restaurantId={ctx.restaurantId}
                accept="any"
                compact
                onUploaded={(m) => {
                  remember(m);
                  if (!latest.current.includes(m.id)) commit([...latest.current, m.id]);
                }}
              />
              <MediaPicker
                restaurantId={ctx.restaurantId}
                accept="any"
                value={null}
                label={t("pdfFromLibrary")}
                onChange={(id) => {
                  if (id && !latest.current.includes(id)) commit([...latest.current, id]);
                }}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
