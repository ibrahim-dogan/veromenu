"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { bridgeMessageSchema } from "@/modules/theme-engine/bridge-schema";
import { useGuest } from "./runtime";
import { Sheet } from "./sheet";

/**
 * Host of a studio theme (theme engine v2): the theme runs in a full-viewport sandboxed iframe
 * (`sandbox="allow-scripts"` → opaque origin, no parent access). Its only channel is postMessage:
 * messages are accepted only from that iframe's window with origin "null", parsed with zod, ids checked
 * against the loaded menu and rate limited. Cart, item sheet, checkout, language and the legal info stay
 * platform UI (same rules as the built-in themes).
 */
export function StudioThemeHost({
  src,
  title,
  categoryIds,
  langHrefs,
  showLanguage,
  languageSwitcher,
  info,
  hostCartBar,
}: {
  src: string;
  title: string;
  categoryIds: string[];
  langHrefs: Record<string, string>;
  showLanguage: boolean;
  /** Server-rendered language switcher (host control). */
  languageSwitcher: ReactNode;
  /** Server-rendered legal info (imprint, prices, allergens, hours …). */
  info: ReactNode;
  /** Host renders the floating cart bar (else the theme has its own data-vm-cart button). */
  hostCartBar: boolean;
}) {
  const { t, items, cart, price, lineUnitPrice, openItem, addToCart, beacon, init, setCartOpen } = useGuest();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const cats = useMemo(() => new Set(categoryIds), [categoryIds]);
  const bucket = useRef({ tokens: 30, at: 0 });
  const loads = useRef({ count: 0, resets: 0, resetting: false });

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + lineUnitPrice(l) * l.qty, 0);

  const sendCart = useCallback(() => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    // opaque origin → "*" is the only possible targetOrigin; the payload is not sensitive
    win.postMessage({ type: "vm:cart", count, totalFormatted: price(total), insetBottom: hostCartBar && count > 0 ? 88 : 0 }, "*");
  }, [count, total, price, hostCartBar]);

  useEffect(() => {
    if (ready) sendCart();
  }, [ready, sendCart]);

  // the frame may finish loading before hydration (missed onLoad / vm:ready) → never stay invisible
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 3000);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    function allow() {
      // token bucket: 30 burst, refill 15/s
      const now = Date.now();
      const b = bucket.current;
      b.tokens = Math.min(30, b.tokens + ((now - b.at) / 1000) * 15);
      b.at = now;
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    }
    function onMessage(e: MessageEvent) {
      const win = frame.current?.contentWindow;
      if (!win || e.source !== win || e.origin !== "null") return;
      if (!allow()) return;
      const parsed = bridgeMessageSchema.safeParse(e.data);
      if (!parsed.success) return;
      const m = parsed.data;
      switch (m.type) {
        case "vm:ready":
          setReady(true);
          return;
        case "vm:openItem":
          if (items.has(m.itemId)) openItem(m.itemId);
          return;
        case "vm:addToCart": {
          const it = items.get(m.itemId);
          if (!it?.o) {
            if (it) openItem(it.id); // sold out / not orderable → details instead
            return;
          }
          const qty = Math.min(20, Math.max(1, m.quantity ?? 1));
          if (m.variantId) {
            if (!it.v.some((v) => v.id === m.variantId)) return;
            addToCart({ itemId: it.id, variantId: m.variantId, qty, note: null });
          } else if (it.v.length > 0 || it.p == null) openItem(it.id);
          else addToCart({ itemId: it.id, variantId: null, qty, note: null });
          return;
        }
        case "vm:setLanguage": {
          const href = langHrefs[m.code];
          if (!href) return;
          beacon("locale_switch", { locale: m.code });
          window.location.assign(href);
          return;
        }
        case "vm:openCart":
          if (init.ordering.enabled) setCartOpen(true);
          return;
        case "vm:openInfo":
          setInfoOpen(true);
          return;
        case "vm:track":
          if (m.event === "item_view" && items.has(m.id)) beacon("item_view", { itemId: m.id });
          if (m.event === "category_view" && cats.has(m.id)) beacon("category_view", { categoryId: m.id });
          return;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [items, cats, langHrefs, openItem, addToCart, beacon, init.ordering.enabled, setCartOpen]);

  // The theme must never navigate its frame away (links/forms are blocked by the bridge; this catches
  // script navigations): any further document load → reset to our frame URL.
  function onLoad() {
    const l = loads.current;
    l.count++;
    if (l.resetting) {
      l.resetting = false;
      return;
    }
    if (l.count > 1 && frame.current && l.resets < 3) {
      l.resets++;
      l.resetting = true;
      setReady(false);
      frame.current.src = src;
      return;
    }
    // no vm:ready (e.g. theme JS broke the bridge) → still show the document
    setTimeout(() => setReady(true), 1500);
  }

  const control = "bg-g-surface/90 text-g-text border-g-border pointer-events-auto grid h-11 min-w-11 place-items-center rounded-full border shadow-md backdrop-blur";

  return (
    <>
      <iframe
        ref={frame}
        id="vm-main"
        src={src}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; usb 'none'"
        onLoad={onLoad}
        className="fixed inset-0 block h-dvh w-full border-0 transition-opacity duration-300"
        style={{ opacity: ready ? 1 : 0 }}
      />
      {!ready && (
        <div aria-hidden className="pointer-events-none fixed inset-0 grid place-items-center">
          <span className="border-g-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      )}
      <div className="pointer-events-none fixed end-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex items-center gap-2">
        {showLanguage && <div className="pointer-events-auto">{languageSwitcher}</div>}
        <button type="button" onClick={() => setInfoOpen(true)} aria-label={t("info")} className={control}>
          <Info size={20} aria-hidden />
        </button>
      </div>
      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} label={t("info")} closeLabel={t("close")}>
        <div className="px-5 pt-5">
          <h2 className="font-g-display pe-12 text-2xl font-semibold">{t("info")}</h2>
          <div className="text-g-muted mt-3 space-y-1.5 text-sm">
            <p>{t("allergenNotice")}</p>
            <p>{t("aiImageNotice")}</p>
          </div>
        </div>
        <div className="px-5">{info}</div>
      </Sheet>
    </>
  );
}
