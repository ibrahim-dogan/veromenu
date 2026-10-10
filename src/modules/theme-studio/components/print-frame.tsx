"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/core/utils";
import { printLayout, renderPrintDocument, type ThemeMediaRef } from "@/modules/theme-engine";
import type { PrintView, ThemePackage } from "@/modules/theme-engine/types";

/** CSS px per mm at 96 dpi (what the browser uses for mm in the iframe). */
export const PX_PER_MM = 96 / 25.4;
/** Gap between sheets in the engine's preview mode (html[data-mode="preview"] body { gap: 12px }). */
export const SHEET_GAP_PX = 12;

/**
 * Print documents are static HTML (no theme JavaScript at all) → shown in a srcdoc iframe with `sandbox=""`:
 * no scripts, opaque origin, no forms, no navigation. Never add allow-scripts / allow-same-origin here.
 */
export function PrintFrame({ html, title, className, style }: { html: string; title: string; className?: string; style?: React.CSSProperties }) {
  return <iframe title={title} srcDoc={html} sandbox="" referrerPolicy="no-referrer" tabIndex={-1} className={className} style={{ border: 0, background: "transparent", ...style }} />;
}

/** Package variant for previews: one card per page (no A4 imposition) – keeps card thumbnails crisp. */
export function singleCardPackage(pkg: ThemePackage): ThemePackage {
  return { ...pkg, manifest: { ...pkg.manifest, print: { ...(pkg.manifest.print ?? { format: "a6", sheet: "card" }), sheet: "card" } } };
}

/**
 * Client-rendered thumbnail of ONE print card (first view, tent: both faces as printed). Scales the card to the
 * container width. Used for template pickers and design cards.
 */
export function PrintCardPreview({
  pkg,
  view,
  settings,
  guestMessages,
  media,
  locale = "de",
  title,
  className,
}: {
  pkg: ThemePackage;
  view: PrintView | null;
  settings?: Record<string, unknown>;
  guestMessages?: Record<string, string>;
  media?: Record<string, ThemeMediaRef>;
  locale?: string;
  title: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  const single = useMemo(() => singleCardPackage(pkg), [pkg]);
  const layout = useMemo(() => printLayout(single.manifest.print), [single]);
  const pageW = layout.page.w * PX_PER_MM;
  const pageH = layout.page.h * PX_PER_MM;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!visible || !view) return;
    let alive = true;
    renderPrintDocument({
      pkg: single,
      views: [{ ...view, settings: settings ?? {}, mode: "preview" }],
      assetBaseUrl: window.location.origin,
      guestMessages: guestMessages ?? {},
      media,
      mode: "preview",
      locale,
    })
      .then((r) => alive && setHtml(r.ok ? r.html : null))
      .catch(() => alive && setHtml(null));
    return () => {
      alive = false;
    };
  }, [visible, single, view, settings, guestMessages, media, locale]);

  const scale = width ? width / pageW : 0;
  return (
    <div ref={box} className={cn("relative overflow-hidden bg-stone-100", className)} style={{ aspectRatio: `${pageW} / ${pageH}` }}>
      {html && scale > 0 ? (
        <PrintFrame
          html={html}
          title={title}
          style={{ position: "absolute", inset: 0, width: pageW, height: pageH, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
        />
      ) : html === null ? (
        <div className="absolute inset-0 grid place-items-center text-stone-400">
          <ImageOff size={22} aria-hidden />
        </div>
      ) : (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-stone-100 to-stone-200" />
      )}
    </div>
  );
}
