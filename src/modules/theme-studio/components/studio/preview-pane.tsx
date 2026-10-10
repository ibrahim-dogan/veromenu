"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Monitor, RefreshCw, Smartphone, Tablet } from "lucide-react";
import { cn } from "@/core/utils";
import { toast } from "@/components/ui/toast";
import { renderThemeDocument, type ThemeMediaRef } from "@/modules/theme-engine";
import type { BridgeMessage, ThemePackage, ThemeView } from "@/modules/theme-engine/types";
import { SandboxFrame } from "../sandbox-frame";

export type Device = "phone" | "tablet" | "desktop";
const SIZES: Record<Device, { w: number; h: number }> = { phone: { w: 390, h: 844 }, tablet: { w: 820, h: 1180 }, desktop: { w: 1280, h: 860 } };

/**
 * Client-side live preview: renders the working package with the theme engine (debounced) into a sandboxed
 * srcdoc iframe, scaled to fit the pane.
 */
export function PreviewPane({
  pkg,
  view,
  guestMessages,
  media,
  settings,
  locale,
  locales,
  onLocale,
  source,
  onSource,
  banner,
  onRenderErrors,
}: {
  pkg: ThemePackage | null;
  view: ThemeView | null;
  guestMessages: Record<string, string>;
  media: Record<string, ThemeMediaRef>;
  settings: Record<string, unknown>;
  locale: string;
  locales: { code: string; label: string }[];
  onLocale: (code: string) => void;
  source: "real" | "sample";
  onSource: (s: "real" | "sample") => void;
  banner?: React.ReactNode;
  onRenderErrors: (errors: string[]) => void;
}) {
  const t = useTranslations("themeStudio.preview");
  const [device, setDevice] = useState<Device>("phone");
  const [html, setHtml] = useState<string | null>(null);
  const [doneFor, setDoneFor] = useState<object | null>(null);
  const [nonce, setNonce] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState({ w: 400, h: 700 });
  const errCb = useRef(onRenderErrors);
  useEffect(() => {
    errCb.current = onRenderErrors;
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // identity of the current render inputs → "rendering" until the debounced render for them finished
  const inputs = useMemo(() => ({ pkg, view, guestMessages, media, settings, nonce }), [pkg, view, guestMessages, media, settings, nonce]);
  const rendering = !!pkg && !!view && doneFor !== inputs;

  useEffect(() => {
    if (!pkg || !view) return;
    let alive = true;
    const h = setTimeout(async () => {
      try {
        const res = await renderThemeDocument({ pkg, view: { ...view, settings, locale: view.locale, mode: "preview" }, assetBaseUrl: window.location.origin, guestMessages, media });
        if (!alive) return;
        setHtml(res.html);
        errCb.current(res.errors);
      } catch (e) {
        if (!alive) return;
        errCb.current([e instanceof Error ? e.message : String(e)]);
      } finally {
        if (alive) setDoneFor(inputs);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(h);
    };
  }, [inputs, pkg, view, guestMessages, media, settings]);

  function onBridge(m: BridgeMessage) {
    const itemName = (id: string) => view?.menus.flatMap((x) => x.categories.flatMap((c) => c.items)).find((i) => i.id === id)?.name ?? id;
    switch (m.type) {
      case "vm:setLanguage":
        if (locales.some((l) => l.code === m.code)) onLocale(m.code);
        return toast(t("bridge_setLanguage", { code: m.code }));
      case "vm:openItem":
        return toast(t("bridge_openItem", { name: itemName(m.itemId) }));
      case "vm:addToCart":
        return toast(t("bridge_addToCart", { name: itemName(m.itemId) }));
      case "vm:openCart":
        return toast(t("bridge_openCart"));
      case "vm:openInfo":
        return toast(t("bridge_openInfo"));
      default:
        return;
    }
  }

  const size = SIZES[device];
  const pad = 24;
  const scale = Math.min(1, (boxSize.w - pad) / size.w, device === "phone" ? (boxSize.h - pad) / size.h : 10);
  const frameH = device === "phone" ? size.h : Math.max(size.h, (boxSize.h - pad) / scale);

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-100">
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-200 bg-white px-2 py-1.5">
        <div className="flex rounded-lg bg-stone-100 p-0.5" role="radiogroup" aria-label={t("device")}>
          {(
            [
              ["phone", Smartphone],
              ["tablet", Tablet],
              ["desktop", Monitor],
            ] as const
          ).map(([d, Icon]) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={device === d}
              aria-label={t(`device_${d}`)}
              title={t(`device_${d}`)}
              onClick={() => setDevice(d)}
              className={cn("focus-ring rounded-md p-1.5", device === d ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
        <select value={locale} onChange={(e) => onLocale(e.target.value)} className="focus-ring h-8 rounded-md border border-stone-200 bg-white px-1.5 text-xs" aria-label={t("language")}>
          {locales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => onSource(e.target.value as "real" | "sample")} className="focus-ring h-8 rounded-md border border-stone-200 bg-white px-1.5 text-xs" aria-label={t("data")}>
          <option value="real">{t("dataReal")}</option>
          <option value="sample">{t("dataSample")}</option>
        </select>
        <span className="ml-auto flex items-center gap-1">
          {rendering && <Loader2 size={14} className="animate-spin text-stone-400" aria-label={t("rendering")} />}
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="focus-ring rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label={t("reload")} title={t("reload")}>
            <RefreshCw size={14} />
          </button>
        </span>
      </div>
      {banner}
      <div ref={box} className="relative min-h-0 flex-1 overflow-auto">
        {html ? (
          <div className="mx-auto" style={{ width: size.w * scale, height: frameH * scale, marginTop: pad / 2, marginBottom: pad / 2 }}>
            <div
              className={cn("overflow-hidden bg-white shadow-xl", device === "phone" ? "rounded-[2rem] ring-8 ring-stone-900" : "rounded-lg ring-1 ring-stone-300")}
              style={{ width: size.w, height: frameH, transform: `scale(${scale})`, transformOrigin: "top left" }}
            >
              <SandboxFrame html={html} title={t("title")} onBridge={onBridge} preserveScroll className="h-full w-full" />
            </div>
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
