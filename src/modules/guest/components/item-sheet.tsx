"use client";
import { useState } from "react";
import type { ClientItem } from "../types";
import { Minus, Plus, Info } from "lucide-react";
import { useGuest } from "./runtime";
import { Sheet } from "./sheet";

const TAG_ICON: Record<string, string> = {
  vegan: "🌱",
  vegetarian: "🥕",
  halal: "☪",
  gluten_free: "🌾",
  lactose_free: "🥛",
  spicy1: "🌶",
  spicy2: "🌶🌶",
  spicy3: "🌶🌶🌶",
  new: "✨",
  recommended: "★",
  alcohol: "🍷",
};

export function ItemSheet({ itemId, onClose }: { itemId: string | null; onClose: () => void }) {
  const { items, t } = useGuest();
  const it = itemId ? items.get(itemId) : undefined;
  if (!it) return <Sheet open={false} onClose={onClose} label="" closeLabel={t("close")}>{null}</Sheet>;
  // keyed by item → fresh variant/quantity/note state for every opened item
  return <OpenItemSheet key={it.id} it={it} onClose={onClose} />;
}

function OpenItemSheet({ it, onClose }: { it: ClientItem; onClose: () => void }) {
  const { t, price, init, addToCart } = useGuest();
  const [variantId, setVariantId] = useState<string | null>(it.v[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [added, setAdded] = useState(false);

  const unit = (variantId ? it.v.find((v) => v.id === variantId)?.priceCents : it.p) ?? null;
  const canAdd = it.o && unit != null;

  function add() {
    if (!canAdd) return;
    addToCart({ itemId: it.id, variantId, qty, note: note.trim() ? note.trim().slice(0, 200) : null });
    setAdded(true);
    setTimeout(onClose, 450);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      label={it.n}
      closeLabel={t("close")}
      footer={
        canAdd ? (
          <div className="flex items-center gap-3">
            <div className="border-g-border flex items-center rounded-full border">
              <button type="button" className="grid h-11 w-11 place-items-center disabled:opacity-40" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t("decrease")}>
                <Minus size={18} aria-hidden />
              </button>
              <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite" aria-label={t("quantity")}>
                {qty}
              </span>
              <button type="button" className="grid h-11 w-11 place-items-center disabled:opacity-40" onClick={() => setQty((q) => Math.min(99, q + 1))} disabled={qty >= 99} aria-label={t("increase")}>
                <Plus size={18} aria-hidden />
              </button>
            </div>
            <button
              type="button"
              onClick={add}
              className="bg-g-primary text-g-on-primary flex h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 font-semibold shadow-sm transition-transform active:scale-[0.98]"
            >
              {added ? t("added") : t("addToCartPrice", { price: price(unit * qty) })}
            </button>
          </div>
        ) : undefined
      }
    >
      {it.img && (
        <div className="relative aspect-[4/3] w-full bg-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={it.img} alt="" className="h-full w-full object-cover" decoding="async" />
          {it.ai && <span className="absolute start-3 bottom-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">{t("aiImage")}</span>}
        </div>
      )}
      <div className="space-y-4 px-5 pt-5 pb-6">
        <div className="pe-12">
          <h2 className="font-g-display text-2xl leading-tight font-semibold">{it.n}</h2>
          {(it.t.length > 0 || !it.av) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {!it.av && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">{t("soldOut")}</span>}
              {it.t.filter((tag) => TAG_ICON[tag]).map((tag) => (
                <span key={tag} className="border-g-border text-g-text rounded-full border px-2.5 py-0.5 text-xs">
                  <span aria-hidden>{TAG_ICON[tag]} </span>
                  {t(`tags.${tag}`)}
                </span>
              ))}
            </div>
          )}
        </div>
        {it.d && <p className="text-g-muted leading-relaxed whitespace-pre-line">{it.d}</p>}

        {it.v.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">{t("chooseVariant")}</legend>
            {it.v.map((v) => (
              <label
                key={v.id}
                className="border-g-border has-[:checked]:border-g-primary has-[:checked]:bg-g-primary/5 flex cursor-pointer items-center justify-between gap-3 rounded-[var(--g-radius)] border px-4 py-3"
              >
                <span className="flex items-center gap-3">
                  {it.o && <input type="radio" name="vm-variant" className="accent-[var(--g-primary)] h-4 w-4" checked={variantId === v.id} onChange={() => setVariantId(v.id)} />}
                  {v.name}
                </span>
                <span className="font-semibold tabular-nums">{price(v.priceCents)}</span>
              </label>
            ))}
          </fieldset>
        ) : it.p != null ? (
          <p className="text-xl font-semibold tabular-nums">{price(it.p)}</p>
        ) : (
          <p className="text-g-muted text-sm">{t("priceOnRequest")}</p>
        )}

        <section aria-labelledby="vm-sheet-allergens" className="bg-g-text/[0.04] rounded-[var(--g-radius)] p-4 text-sm">
          <h3 id="vm-sheet-allergens" className="mb-2 font-semibold">
            {t("allergens")}
          </h3>
          {it.ac ? (
            <>
              {it.al.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {it.al.map((a) => (
                    <li key={a.code} className="bg-g-surface border-g-border rounded-full border px-2.5 py-1">
                      <span aria-hidden>{a.icon} </span>
                      <b className="font-semibold">{a.letter}</b> {a.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-g-muted">{t("noAllergensDeclared")}</p>
              )}
              {it.ad.length > 0 && (
                <>
                  <h3 className="mt-4 mb-2 font-semibold">{t("additives")}</h3>
                  <ul className="text-g-muted space-y-1">
                    {it.ad.map((a) => (
                      <li key={a.code}>
                        <b className="text-g-text font-semibold">{a.letter}</b> {a.label}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="text-g-muted flex gap-2">
              <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
              {t("allergenNotice")}
            </p>
          )}
        </section>

        {canAdd && init.ordering.allowNotes && (
          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold">{t("itemNote")}</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder={t("itemNotePlaceholder")}
              className="border-g-border bg-g-surface h-11 w-full rounded-[var(--g-radius)] border px-3 text-base"
            />
          </label>
        )}
      </div>
    </Sheet>
  );
}
