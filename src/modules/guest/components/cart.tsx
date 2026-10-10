"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingBag, AlertCircle } from "lucide-react";
import { useGuest } from "./runtime";
import { Sheet } from "./sheet";

const statusHref = (init: { slug: string; locale: string; tableToken: string | null }, publicId: string) =>
  `/m/${init.slug}/order/${encodeURIComponent(publicId)}?lang=${init.locale}${init.tableToken ? `&t=${encodeURIComponent(init.tableToken)}` : ""}`;

const KNOWN_ERRORS = ["ordering_disabled", "table_required", "item_unavailable", "invalid", "rate_limited"] as const;

/** Sticky cart bar + cart/checkout sheet. Only mounted when ordering is enabled. */
export function CartBar() {
  const { cart, t, price, lineUnitPrice, init, cartOpen: open, setCartOpen: setOpen } = useGuest();
  const showButton = init.hostCartButton !== false;
  const [lastOrder, setLastOrder] = useState<{ publicId: string; number?: number } | null>(null);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + lineUnitPrice(l) * l.qty, 0);

  // keep the last menu entries reachable above the fixed bar
  useEffect(() => {
    document.body.style.paddingBottom = (count && showButton) || lastOrder ? "5.5rem" : "";
    return () => void (document.body.style.paddingBottom = "");
  }, [count, lastOrder, showButton]);

  // a recent order (last 4 h) stays reachable from the menu
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(`vm_last_order_${init.restaurantId}`) ?? "null") as { publicId?: string; number?: number; at?: number } | null;
      // localStorage only exists in the browser → read after hydration
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw?.publicId && raw.at && Date.now() - raw.at < 4 * 3600e3) setLastOrder({ publicId: raw.publicId, number: raw.number });
    } catch {}
  }, [init.restaurantId]);

  return (
    <>
      {count === 0 && lastOrder && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <a
            href={statusHref(init, lastOrder.publicId)}
            className="bg-g-surface text-g-text border-g-border pointer-events-auto flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-semibold shadow-lg"
          >
            <ShoppingBag size={18} aria-hidden />
            {lastOrder.number ? t("yourOrderNumber", { number: lastOrder.number }) : t("yourOrder")}
          </a>
        </div>
      )}
      {count > 0 && showButton && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="bg-g-primary text-g-on-primary pointer-events-auto mx-auto flex h-14 w-full max-w-xl items-center gap-3 rounded-full px-5 shadow-[0_8px_30px_rgb(0_0_0/0.25)] transition-transform active:scale-[0.99]"
          >
            <span className="relative">
              <ShoppingBag size={22} aria-hidden />
              <span className="bg-g-accent text-g-on-accent absolute -end-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold tabular-nums">
                {count}
              </span>
            </span>
            <span className="flex-1 text-start font-semibold">{t("viewCart")}</span>
            <span className="font-semibold tabular-nums">{price(total)}</span>
          </button>
        </div>
      )}
      <CartSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function CartSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cart, items, t, price, lineUnitPrice, setQty, clearCart, init } = useGuest();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = cart.reduce((s, l) => s + lineUnitPrice(l) * l.qty, 0);

  const close = () => {
    setError(null);
    onClose();
  };

  async function submit() {
    if (!cart.length || busy) return;
    if (init.preview) return setError("preview");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: init.slug,
          tableToken: init.tableToken ?? undefined,
          locale: init.locale,
          note: init.ordering.allowNotes && note.trim() ? note.trim().slice(0, 500) : undefined,
          items: cart.map((l) => ({ itemId: l.itemId, variantId: l.variantId ?? undefined, quantity: l.qty, note: l.note ?? undefined })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { publicId?: string; number?: number; error?: string };
      if (res.status === 201 && body.publicId) {
        try {
          localStorage.setItem(`vm_last_order_${init.restaurantId}`, JSON.stringify({ publicId: body.publicId, number: body.number, at: Date.now() }));
        } catch {}
        clearCart();
        close();
        router.push(statusHref(init, body.publicId));
        return;
      }
      setError(KNOWN_ERRORS.includes(body.error as (typeof KNOWN_ERRORS)[number]) ? body.error! : "unknown");
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      label={t("cart")}
      closeLabel={t("close")}
      footer={
        cart.length > 0 ? (
          <div className="space-y-3">
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-[var(--g-radius)] bg-red-50 px-3 py-2 text-sm text-red-800">
                <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                {error === "preview" ? t("previewNoOrders") : t(`orderErrors.${error}`)}
              </p>
            )}
            <div className="flex items-baseline justify-between text-lg font-semibold">
              <span>{t("total")}</span>
              <span className="tabular-nums">{price(total)}</span>
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="bg-g-primary text-g-on-primary flex h-12 w-full items-center justify-center gap-2 rounded-full font-semibold shadow-sm disabled:opacity-60"
            >
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
              {busy ? t("submitting") : t("submitOrder")}
            </button>
            <p className="text-g-muted text-center text-xs">{t("pricesInclVat")}</p>
          </div>
        ) : undefined
      }
    >
      <div className="px-5 pt-5 pb-4">
        <h2 className="font-g-display pe-12 text-2xl font-semibold">{t("cart")}</h2>
        {init.tableLabel && <p className="text-g-muted mt-1 text-sm">{t("table", { label: init.tableLabel })}</p>}
        {cart.length === 0 ? (
          <p className="text-g-muted py-10 text-center">{t("emptyCart")}</p>
        ) : (
          <ul className="divide-g-border mt-4 divide-y">
            {cart.map((l) => {
              const it = items.get(l.itemId);
              if (!it) return null;
              const variant = l.variantId ? it.v.find((v) => v.id === l.variantId) : null;
              return (
                <li key={l.key} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{it.n}</p>
                    {(variant || l.note) && <p className="text-g-muted truncate text-sm">{[variant?.name, l.note].filter(Boolean).join(" · ")}</p>}
                    <p className="text-sm tabular-nums">{price(lineUnitPrice(l) * l.qty)}</p>
                  </div>
                  <div className="border-g-border flex shrink-0 items-center rounded-full border">
                    <button type="button" className="grid h-10 w-10 place-items-center" onClick={() => setQty(l.key, l.qty - 1)} aria-label={l.qty === 1 ? t("remove") : t("decrease")}>
                      <Minus size={16} aria-hidden />
                    </button>
                    <span className="w-6 text-center font-semibold tabular-nums">{l.qty}</span>
                    <button type="button" className="grid h-10 w-10 place-items-center" onClick={() => setQty(l.key, l.qty + 1)} aria-label={t("increase")}>
                      <Plus size={16} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {cart.length > 0 && init.ordering.allowNotes && (
          <label className="mt-4 block text-sm">
            <span className="mb-1.5 block font-semibold">{t("orderNote")}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={t("orderNotePlaceholder")}
              className="border-g-border bg-g-surface w-full rounded-[var(--g-radius)] border px-3 py-2 text-base"
            />
          </label>
        )}
      </div>
    </Sheet>
  );
}
