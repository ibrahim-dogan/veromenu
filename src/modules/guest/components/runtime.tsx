"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createGuestT, makePriceFormatter, type GuestMessages, type GuestT } from "../t";
import type { ClientItem, GuestOrdering } from "../types";
import { ItemSheet } from "./item-sheet";
import { CartBar } from "./cart";

/**
 * Guest client runtime: one small client island around the server-rendered menu.
 * - delegated clicks: [data-vm-item] opens the detail sheet, [data-vm-add] quick-adds, a[data-vm-locale] is tracked
 * - cart (localStorage per restaurant – "strictly necessary" for the requested ordering service, no tracking)
 * - cookie-less analytics beacons (navigator.sendBeacon → /api/public/events)
 */
export type RuntimeInit = {
  slug: string;
  restaurantId: string;
  locale: string;
  currency: string;
  tableToken: string | null;
  tableLabel: string | null;
  ordering: GuestOrdering;
  preview: boolean;
  /** Send analytics beacons (false in preview). */
  track: boolean;
  items: ClientItem[];
  messages: GuestMessages;
  /** Studio themes with controls.cartButton = "theme" render their own cart button (default true). */
  hostCartButton?: boolean;
};

export type CartLine = { key: string; itemId: string; variantId: string | null; qty: number; note: string | null };
export type BeaconType = "item_view" | "category_view" | "locale_switch" | "cart_add";

type Ctx = {
  init: RuntimeInit;
  t: GuestT;
  price: (cents: number | null | undefined) => string;
  items: Map<string, ClientItem>;
  cart: CartLine[];
  addToCart: (l: Omit<CartLine, "key">) => void;
  setQty: (key: string, qty: number) => void;
  clearCart: () => void;
  lineUnitPrice: (l: CartLine) => number;
  openItem: (id: string | null) => void;
  beacon: (type: BeaconType, extra?: { itemId?: string; categoryId?: string; locale?: string }) => void;
  /** Cart/checkout sheet (opened by the cart bar or a studio theme's data-vm-cart). */
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
};

const GuestCtx = createContext<Ctx | null>(null);
export function useGuest() {
  const c = useContext(GuestCtx);
  if (!c) throw new Error("useGuest outside GuestRuntime");
  return c;
}

const lineKey = (itemId: string, variantId: string | null, note: string | null) => `${itemId}|${variantId ?? ""}|${note ?? ""}`;

export function GuestRuntime({ init, children }: { init: RuntimeInit; children: ReactNode }) {
  const t = useMemo(() => createGuestT(init.messages), [init.messages]);
  const price = useMemo(() => makePriceFormatter(init.locale, init.currency), [init.locale, init.currency]);
  const items = useMemo(() => new Map(init.items.map((i) => [i.id, i])), [init.items]);
  const storageKey = `vm_cart_${init.restaurantId}`;

  const [cart, setCart] = useState<CartLine[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const loaded = useRef(false);

  // ---- beacons (cookie-less; server hashes ip+ua with a daily salt)
  const beacon = useCallback<Ctx["beacon"]>(
    (type, extra = {}) => {
      if (!init.track) return;
      const body = JSON.stringify({ slug: init.slug, type, locale: init.locale, tableToken: init.tableToken ?? undefined, ...extra });
      try {
        if (navigator.sendBeacon?.("/api/public/events", new Blob([body], { type: "application/json" }))) return;
      } catch {}
      fetch("/api/public/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    },
    [init.track, init.slug, init.locale, init.tableToken],
  );

  // ---- cart persistence
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as CartLine[];
      const valid = Array.isArray(raw)
        ? raw.filter((l) => {
            const it = items.get(l?.itemId);
            if (!it?.o || !(l.qty > 0)) return false;
            if (l.variantId) return it.v.some((v) => v.id === l.variantId);
            return it.p != null;
          })
        : [];
      // localStorage only exists in the browser → restore after hydration (no SSR mismatch)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCart(valid.map((l) => ({ ...l, qty: Math.min(99, Math.round(l.qty)), key: lineKey(l.itemId, l.variantId, l.note) })));
    } catch {}
    loaded.current = true;
  }, [storageKey, items]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (cart.length) localStorage.setItem(storageKey, JSON.stringify(cart));
      else localStorage.removeItem(storageKey);
    } catch {}
  }, [cart, storageKey]);

  const addToCart = useCallback<Ctx["addToCart"]>(
    (l) => {
      const key = lineKey(l.itemId, l.variantId, l.note);
      setCart((prev) => {
        const hit = prev.find((x) => x.key === key);
        if (hit) return prev.map((x) => (x.key === key ? { ...x, qty: Math.min(99, x.qty + l.qty) } : x));
        return [...prev, { ...l, key }];
      });
      beacon("cart_add", { itemId: l.itemId });
    },
    [beacon],
  );
  const setQty = useCallback((key: string, qty: number) => {
    setCart((prev) => (qty <= 0 ? prev.filter((x) => x.key !== key) : prev.map((x) => (x.key === key ? { ...x, qty: Math.min(99, qty) } : x))));
  }, []);
  const clearCart = useCallback(() => setCart([]), []);
  const lineUnitPrice = useCallback(
    (l: CartLine) => {
      const it = items.get(l.itemId);
      if (!it) return 0;
      return (l.variantId ? it.v.find((v) => v.id === l.variantId)?.priceCents : it.p) ?? 0;
    },
    [items],
  );

  const openItem = useCallback(
    (id: string | null) => {
      setOpenId(id);
      if (id) beacon("item_view", { itemId: id });
    },
    [beacon],
  );

  // ---- delegated interactions on the server-rendered menu
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest) return;
      const add = target.closest<HTMLElement>("[data-vm-add]");
      if (add) {
        e.preventDefault();
        const it = items.get(add.dataset.vmAdd ?? "");
        if (!it?.o) return;
        if (it.v.length > 0 || it.p == null) return openItem(it.id);
        addToCart({ itemId: it.id, variantId: null, qty: 1, note: null });
        add.dataset.vmAdded = "1";
        setTimeout(() => delete add.dataset.vmAdded, 900);
        return;
      }
      const open = target.closest<HTMLElement>("[data-vm-item]");
      if (open) {
        e.preventDefault();
        return openItem(open.dataset.vmItem ?? null);
      }
      const lang = target.closest<HTMLAnchorElement>("a[data-vm-locale]");
      if (lang) beacon("locale_switch", { locale: lang.dataset.vmLocale });
      // close open <details> popovers (language switcher) on outside click
      document.querySelectorAll<HTMLDetailsElement>("details[data-vm-popover][open]").forEach((d) => {
        if (!d.contains(target)) d.open = false;
      });
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [items, addToCart, openItem, beacon]);

  const value = useMemo<Ctx>(
    () => ({ init, t, price, items, cart, addToCart, setQty, clearCart, lineUnitPrice, openItem, beacon, cartOpen, setCartOpen }),
    [init, t, price, items, cart, addToCart, setQty, clearCart, lineUnitPrice, openItem, beacon, cartOpen],
  );

  return (
    <GuestCtx.Provider value={value}>
      {children}
      <ItemSheet itemId={openId} onClose={() => setOpenId(null)} />
      {init.ordering.enabled && <CartBar />}
    </GuestCtx.Provider>
  );
}
