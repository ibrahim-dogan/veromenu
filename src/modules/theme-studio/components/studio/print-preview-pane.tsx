"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Maximize2, Minus, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/core/utils";
import { printLayout, printPageCount, renderPrintDocument, type ThemeMediaRef } from "@/modules/theme-engine";
import type { PrintView, ThemePackage } from "@/modules/theme-engine/types";
import { PrintFrame, PX_PER_MM, SHEET_GAP_PX } from "../print-frame";

export type PrintPreviewData = { views: PrintView[]; total: number; locale: string; guestMessages: Record<string, string> };
type Zoom = "fit" | number;
const ZOOMS = [0.25, 0.35, 0.5, 0.75, 1, 1.5];
const PAD = 24;

/**
 * Live preview of a print design: renders the working package with renderPrintDocument (client-side, debounced)
 * into a `sandbox=""` srcdoc iframe and shows the physical sheets on a "desk" – fit-to-width or zoomed, with format
 * badge, imposition toggle (A4 sheet with crop marks ↔ single cards) and real tables vs. sample cards.
 */
export function PrintPreviewPane({
  pkg,
  data,
  media,
  settings,
  source,
  onSource,
  banner,
  onRenderErrors,
}: {
  pkg: ThemePackage | null;
  data: PrintPreviewData | null;
  media: Record<string, ThemeMediaRef>;
  settings: Record<string, unknown>;
  source: "real" | "sample";
  onSource: (s: "real" | "sample") => void;
  banner?: React.ReactNode;
  onRenderErrors: (errors: string[]) => void;
}) {
  const t = useTranslations("themeStudio.printPreview");
  const tf = useTranslations("themeStudio.formats");
  const [zoom, setZoom] = useState<Zoom>("fit");
  /** preview-only override of manifest.print.sheet */
  const [sheetOverride, setSheetOverride] = useState<"card" | "a4" | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [doneFor, setDoneFor] = useState<object | null>(null);
  const [nonce, setNonce] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(600);
  const errCb = useRef(onRenderErrors);
  useEffect(() => {
    errCb.current = onRenderErrors;
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const spec = pkg?.manifest.print ?? null;
  const canImpose = !!spec && printLayout({ ...spec, sheet: "a4" }).slots.length > 1;
  const sheet = sheetOverride && canImpose ? sheetOverride : (spec?.sheet ?? "card");
  const previewPkg = useMemo<ThemePackage | null>(() => (pkg && spec ? { ...pkg, manifest: { ...pkg.manifest, print: { ...spec, sheet } } } : pkg), [pkg, spec, sheet]);
  const layout = useMemo(() => printLayout(previewPkg?.manifest.print), [previewPkg]);
  const cards = data?.views.length ?? 0;
  const pages = Math.max(1, printPageCount(previewPkg?.manifest.print, cards));

  const inputs = useMemo(() => ({ previewPkg, data, media, settings, nonce }), [previewPkg, data, media, settings, nonce]);
  const rendering = !!previewPkg && !!data && doneFor !== inputs;

  useEffect(() => {
    if (!previewPkg || !data) return;
    let alive = true;
    const h = setTimeout(async () => {
      try {
        const res = await renderPrintDocument({
          pkg: previewPkg,
          views: data.views.map((v) => ({ ...v, settings, mode: "preview" })),
          assetBaseUrl: window.location.origin,
          guestMessages: data.guestMessages,
          media,
          mode: "preview",
          locale: data.locale,
        });
        if (!alive) return;
        setHtml(res.html);
        errCb.current(res.errors);
      } catch (e) {
        if (alive) errCb.current([e instanceof Error ? e.message : String(e)]);
      } finally {
        if (alive) setDoneFor(inputs);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [inputs, previewPkg, data, media, settings]);

  const pageW = layout.page.w * PX_PER_MM;
  const pageH = layout.page.h * PX_PER_MM;
  const docH = pages * pageH + (pages - 1) * SHEET_GAP_PX;
  const fit = Math.max(0.1, Math.min(1.5, (boxW - PAD * 2) / pageW));
  const scale = zoom === "fit" ? fit : zoom;
  const step = (dir: 1 | -1) => {
    const cur = scale;
    const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.001) : [...ZOOMS].reverse().find((z) => z < cur - 0.001);
    if (next) setZoom(next);
  };
  const fmt = spec?.format ?? "a6";

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-100">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 bg-white px-2 py-1.5">
        <span className="rounded-md bg-stone-900 px-2 py-1 text-[11px] font-semibold text-white" title={t("formatTitle")}>
          {tf(`${fmt}`)} · {layout.card.w}×{layout.card.h} mm
        </span>
        {canImpose && (
          <div className="flex rounded-lg bg-stone-100 p-0.5" role="radiogroup" aria-label={t("sheet")}>
            {(["a4", "card"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sheet === s}
                onClick={() => setSheetOverride(s)}
                className={cn("focus-ring rounded-md px-2 py-1 text-[11px] font-medium", sheet === s ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}
                title={t(`sheetHint_${s}`)}
              >
                {t(`sheet_${s}`)}
              </button>
            ))}
          </div>
        )}
        <select value={source} onChange={(e) => onSource(e.target.value as "real" | "sample")} className="focus-ring h-8 rounded-md border border-stone-200 bg-white px-1.5 text-xs" aria-label={t("data")}>
          <option value="real">{t("dataReal")}</option>
          <option value="sample">{t("dataSample")}</option>
        </select>
        <span className="ml-auto flex items-center gap-0.5">
          {rendering && <Loader2 size={14} className="mr-1 animate-spin text-stone-400" aria-label={t("rendering")} />}
          <button type="button" onClick={() => step(-1)} className="focus-ring rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label={t("zoomOut")} title={t("zoomOut")}>
            <Minus size={14} />
          </button>
          <span className="w-10 text-center text-[11px] text-stone-600 tabular-nums">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={() => step(1)} className="focus-ring rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label={t("zoomIn")} title={t("zoomIn")}>
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => setZoom("fit")}
            aria-pressed={zoom === "fit"}
            className={cn("focus-ring rounded-md p-1.5 hover:bg-stone-100", zoom === "fit" ? "text-brand-700" : "text-stone-500")}
            aria-label={t("fit")}
            title={t("fit")}
          >
            <Maximize2 size={14} />
          </button>
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="focus-ring rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label={t("reload")} title={t("reload")}>
            <RefreshCw size={14} />
          </button>
        </span>
      </div>
      {banner}
      <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-1 text-[11px] text-stone-500">
        <span>{t("summary", { cards, pages, perPage: layout.slots.length })}</span>
        {data && data.total > cards && <span className="text-amber-700">· {t("truncated", { shown: cards, total: data.total })}</span>}
      </div>
      <div ref={box} className="relative min-h-0 flex-1 overflow-auto bg-stone-300/60">
        {html ? (
          <div className="mx-auto" style={{ width: pageW * scale, height: docH * scale, margin: `${PAD}px auto` }}>
            <PrintFrame html={html} title={t("title")} style={{ width: pageW, height: docH, transform: `scale(${scale})`, transformOrigin: "top left" }} />
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-stone-400">
            <Loader2 size={20} className="animate-spin" aria-label={t("rendering")} />
          </div>
        )}
      </div>
    </div>
  );
}
