"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/core/utils";
import { useGuest } from "./runtime";
import { normalizeSearch } from "../t";

export type AllergenOption = { code: string; letter: string; icon: string; label: string };

/**
 * Search + diet / allergen filters. Works on the server-rendered rows (data-vm-row, see blocks.tsx)
 * by toggling `hidden` → no re-render of the menu, cheap on low-end phones.
 * Honest allergen filter: rows without CONFIRMED allergen info are never treated as "free of X" –
 * they stay visible with an "unknown – ask staff" marker.
 */
export function FilterBar({ allergens, className, inputClassName, chipClassName }: { allergens: AllergenOption[]; className?: string; inputClassName?: string; chipClassName?: string }) {
  const { t, items } = useGuest();
  const [q, setQ] = useState("");
  const [diet, setDiet] = useState<"vegan" | "vegetarian" | null>(null);
  const [without, setWithout] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const first = useRef(true);

  const hasTag = useMemo(() => {
    const all = new Set<string>();
    items.forEach((i) => i.t.forEach((x) => all.add(x)));
    return { vegan: all.has("vegan"), vegetarian: all.has("vegetarian") || all.has("vegan") };
  }, [items]);
  const anyUnconfirmed = useMemo(() => [...items.values()].some((i) => !i.ac), [items]);
  const active = !!q.trim() || !!diet || without.length > 0;
  const filterCount = (diet ? 1 : 0) + without.length;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const h = setTimeout(() => setCount(applyFilters({ q, diet, without })), 120);
    return () => clearTimeout(h);
  }, [q, diet, without]);

  const toggleWithout = (code: string) => setWithout((w) => (w.includes(code) ? w.filter((x) => x !== code) : [...w, code]));
  const chip = (on: boolean) =>
    cn(
      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
      on ? "bg-g-primary text-g-on-primary border-transparent" : "border-g-border bg-g-surface text-g-text",
      chipClassName,
    );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t("searchLabel")}</span>
          <Search size={18} className="text-g-muted pointer-events-none absolute start-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            enterKeyHint="search"
            className={cn("border-g-border bg-g-surface text-g-text placeholder:text-g-muted h-11 w-full rounded-full border ps-10 pe-10 text-base outline-none focus-visible:border-g-primary", inputClassName)}
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label={t("clearSearch")} className="text-g-muted absolute end-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full">
              <X size={16} aria-hidden />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="vm-filter-panel"
          className={cn(chip(filterCount > 0), "h-11 px-4")}
        >
          <SlidersHorizontal size={18} aria-hidden />
          <span className="sr-only sm:not-sr-only">{t("filters")}</span>
          {filterCount > 0 && <span className="tabular-nums">({filterCount})</span>}
        </button>
      </div>

      {open && (
        <div id="vm-filter-panel" className="border-g-border bg-g-surface space-y-3 rounded-[var(--g-radius)] border p-3">
          {(hasTag.vegan || hasTag.vegetarian) && (
            <div className="flex flex-wrap gap-2">
              {hasTag.vegan && (
                <button type="button" aria-pressed={diet === "vegan"} className={chip(diet === "vegan")} onClick={() => setDiet((d) => (d === "vegan" ? null : "vegan"))}>
                  <span aria-hidden>🌱</span> {t("filterVegan")}
                </button>
              )}
              {hasTag.vegetarian && (
                <button type="button" aria-pressed={diet === "vegetarian"} className={chip(diet === "vegetarian")} onClick={() => setDiet((d) => (d === "vegetarian" ? null : "vegetarian"))}>
                  <span aria-hidden>🥕</span> {t("filterVegetarian")}
                </button>
              )}
            </div>
          )}
          <fieldset>
            <legend className="text-g-muted mb-2 text-sm font-semibold">{t("filterWithout")}</legend>
            <div className="flex flex-wrap gap-2">
              {allergens.map((a) => (
                <button key={a.code} type="button" aria-pressed={without.includes(a.code)} className={chip(without.includes(a.code))} onClick={() => toggleWithout(a.code)}>
                  <span aria-hidden>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          </fieldset>
          {without.length > 0 && anyUnconfirmed && <p className="text-g-muted text-xs">{t("filterUnknownHint")}</p>}
          {filterCount > 0 && (
            <button type="button" className="text-g-primary text-sm font-semibold underline underline-offset-4" onClick={() => (setDiet(null), setWithout([]))}>
              {t("filterReset")}
            </button>
          )}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {active && count != null ? t("resultCount", { count }) : ""}
      </p>
    </div>
  );
}

function applyFilters({ q, diet, without }: { q: string; diet: "vegan" | "vegetarian" | null; without: string[] }): number {
  const query = normalizeSearch(q.trim());
  const active = !!query || !!diet || without.length > 0;
  let shown = 0;
  const visibleCats = new Set<string>();
  document.querySelectorAll<HTMLElement>("[data-vm-row]").forEach((row) => {
    const tags = (row.dataset.tags ?? "").split(" ");
    const confirmed = row.dataset.ac === "1";
    const al = (row.dataset.al ?? "").split(" ");
    let ok = !query || (row.dataset.q ?? "").includes(query);
    if (ok && diet === "vegan") ok = tags.includes("vegan");
    if (ok && diet === "vegetarian") ok = tags.includes("vegetarian") || tags.includes("vegan");
    if (ok && without.length && confirmed) ok = !without.some((w) => al.includes(w));
    row.hidden = !ok;
    if (ok && without.length && !confirmed) row.setAttribute("data-vm-unknown", "");
    else row.removeAttribute("data-vm-unknown");
    if (ok) {
      shown++;
      if (row.dataset.cat) visibleCats.add(row.dataset.cat);
    }
  });
  document.querySelectorAll<HTMLElement>("[data-vm-cat]").forEach((s) => (s.hidden = active && !visibleCats.has(s.dataset.vmCat!)));
  document.querySelectorAll<HTMLElement>("[data-vm-menu]").forEach((m) => (m.hidden = active && !m.querySelector("[data-vm-cat]:not([hidden])")));
  const none = document.getElementById("vm-noresults");
  if (none) none.hidden = !active || shown > 0;
  document.dispatchEvent(new CustomEvent("vm:filter", { detail: { visibleCats: active ? [...visibleCats] : null } }));
  return shown;
}
