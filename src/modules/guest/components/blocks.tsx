import type { ReactNode } from "react";
import { cn } from "@/core/utils";
import { encodeConfigParam } from "@/themes/config";
import type { ThemeConfig } from "@/themes/types";
import { ALLERGENS } from "@/modules/allergens/catalog";
import { guestCatalogLabel } from "../allergen-labels";
import { normalizeSearch, type GuestT } from "../t";
import type { GuestImage, GuestItem, GuestMenu, GuestMenuData } from "../types";

/**
 * Server-rendered building blocks shared by all themes. Interactive behaviour is attached by the
 * client runtime via data attributes, so themes stay plain server components (fast, no hydration).
 */

// ---------------------------------------------------------------- links

/** Guest URL that keeps table token, language and (for authorized previews) the preview params. */
export function guestHref(data: GuestMenuData, opts: { lang?: string; path?: string } = {}) {
  const p = new URLSearchParams();
  if (data.tableToken) p.set("t", data.tableToken);
  p.set("lang", opts.lang ?? data.locale);
  if (data.preview) {
    p.set("preview", "1");
    p.set("theme", data.theme.id);
    p.set("config", encodeConfigParam(data.theme.config as ThemeConfig));
  }
  return `/m/${data.restaurant.slug}${opts.path ?? ""}?${p.toString()}`;
}

// ---------------------------------------------------------------- data attributes

/** Put on every item row: drives search/filters (FilterBar) and the "unknown allergens" marker. */
export function itemAttrs(item: GuestItem) {
  return {
    "data-vm-row": "",
    "data-cat": item.categoryId,
    "data-tags": item.tags.join(" "),
    "data-ac": item.allergensConfirmed ? "1" : "0",
    "data-al": item.allergens.map((a) => a.code).join(" "),
    "data-q": normalizeSearch(`${item.name} ${item.description ?? ""}`),
  } as const;
}

/** Put on every category section (scrollspy + filter). */
export function categoryAttrs(categoryId: string) {
  return { id: `cat-${categoryId}`, "data-vm-cat": categoryId } as const;
}

// ---------------------------------------------------------------- item pieces

/** Opens the detail sheet; stretches over the whole row (row needs `relative`). */
export function ItemOpenButton({ item, className, children }: { item: GuestItem; className?: string; children: ReactNode }) {
  return (
    <button type="button" data-vm-item={item.id} aria-haspopup="dialog" className={cn("text-start after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--g-primary)] focus-visible:after:rounded-[var(--g-radius)]", className)}>
      {children}
    </button>
  );
}

export function QuickAddButton({ item, t, className }: { item: GuestItem; t: GuestT; className?: string }) {
  if (!item.orderable) return null;
  return (
    <button
      type="button"
      data-vm-add={item.id}
      aria-label={t("quickAdd", { name: item.name })}
      className={cn(
        "vm-add bg-g-primary text-g-on-primary relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full shadow-sm transition-transform active:scale-90",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
        <path className="vm-add-plus" d="M12 5v14M5 12h14" />
        <path className="vm-add-check" d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>
  );
}

export function priceLabel(item: GuestItem, price: (c: number | null) => string, t: GuestT): string {
  if (item.priceCents != null) return price(item.priceCents);
  if (item.variants.length === 1) return price(item.variants[0].priceCents);
  if (item.variants.length > 1) return t("from", { price: price(Math.min(...item.variants.map((v) => v.priceCents))) });
  return "";
}

/** Variants as "0,3 l 3,50 € · 0,5 l 4,90 €" (when few), else nothing (sheet shows them). */
export function VariantLine({ item, price, className }: { item: GuestItem; price: (c: number | null) => string; className?: string }) {
  if (item.variants.length < 2 || item.variants.length > 4) return null;
  return (
    <p className={cn("text-g-muted text-sm tabular-nums", className)}>
      {item.variants.map((v, i) => (
        <span key={v.id}>
          {i > 0 && <span aria-hidden> · </span>}
          {v.name} <span className="text-g-text font-medium">{price(v.priceCents)}</span>
        </span>
      ))}
    </p>
  );
}

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

/** Small diet / feature badges. `compact` = icons only (label as tooltip + sr text). */
export function TagBadges({ item, t, className, badgeClassName, compact }: { item: GuestItem; t: GuestT; className?: string; badgeClassName?: string; compact?: boolean }) {
  const tags = item.tags.filter((x) => TAG_ICON[x]);
  if (!tags.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1 align-middle", className)}>
      {tags.map((tag) => (
        <span key={tag} title={t(`tags.${tag}`)} className={cn("inline-flex items-center gap-1 text-xs", !compact && "rounded-full border border-current/20 px-2 py-0.5", badgeClassName)}>
          <span aria-hidden>{TAG_ICON[tag]}</span>
          <span className={compact ? "sr-only" : undefined}>{t(`tags.${tag}`)}</span>
        </span>
      ))}
    </span>
  );
}

/** German-style footnote marks: allergen letters + additive numbers (only when confirmed). */
export function AllergenMarks({ item, t, className }: { item: GuestItem; t: GuestT; className?: string }) {
  if (!item.allergensConfirmed || (!item.allergens.length && !item.additives.length)) return null;
  const marks = [...item.additives.map((a) => a.letter), ...item.allergens.map((a) => a.letter)].join(",");
  const full = [...item.allergens, ...item.additives].map((a) => a.label).join(", ");
  return (
    <sup className={cn("text-g-muted ms-1 text-[0.65em] font-normal tracking-wide", className)} title={full}>
      <span aria-hidden>{marks}</span>
      <span className="sr-only">
        {t("allergens")}: {full}
      </span>
    </sup>
  );
}

export function SoldOutBadge({ item, t, className }: { item: GuestItem; t: GuestT; className?: string }) {
  if (item.available) return null;
  return <span className={cn("inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase", className)}>{t("soldOut")}</span>;
}

/** Hidden unless an allergen filter is active and this row has no confirmed allergen info. */
export function UnknownAllergenNote({ item, t, className }: { item: GuestItem; t: GuestT; className?: string }) {
  if (item.allergensConfirmed) return null;
  return (
    <span className={cn("vm-unknown items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900", className)}>
      <span aria-hidden>⚠</span> {t("allergenUnknown")}
    </span>
  );
}

export function AiLabel({ t, className }: { t: GuestT; className?: string }) {
  return <span className={cn("pointer-events-none absolute start-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] leading-tight font-medium text-white", className)}>{t("aiImage")}</span>;
}

/** Image with fixed aspect box (no layout shift), lazy + async decoding, AI label (EU AI Act). */
export function ItemImage({
  image,
  t,
  className,
  size = "sm",
  sizes,
  eager,
  labelClassName,
}: {
  image: GuestImage;
  t: GuestT;
  className?: string;
  size?: "sm" | "md";
  sizes?: string;
  eager?: boolean;
  labelClassName?: string;
}) {
  return (
    <span className={cn("relative block overflow-hidden bg-black/5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={size === "md" ? image.md : image.sm}
        srcSet={`${image.sm} 480w, ${image.md} 1200w`}
        sizes={sizes ?? "(min-width: 640px) 240px, 33vw"}
        alt={image.alt ?? ""}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {image.isAi && <AiLabel t={t} className={labelClassName} />}
    </span>
  );
}

// ---------------------------------------------------------------- menus / notices

const SCHEDULE_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** "Mo–Fr 11:30–14:30" in the guest language. */
export function formatSchedule(schedule: GuestMenu["schedule"], locale: string) {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  } catch {
    fmt = new Intl.DateTimeFormat("de", { weekday: "short", timeZone: "UTC" });
  }
  // 2024-01-01 was a Monday
  const dayName = (d: number) => fmt.format(new Date(Date.UTC(2024, 0, d === 0 ? 7 : d)));
  return schedule
    .map((w) => {
      const days = SCHEDULE_DAYS.filter((d) => !w.days?.length || w.days.includes(d) || (d === 7 && w.days.includes(0)));
      const ranges: string[] = [];
      for (let i = 0; i < days.length; ) {
        let j = i;
        while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
        ranges.push(j - i >= 2 ? `${dayName(days[i])}–${dayName(days[j])}` : days.slice(i, j + 1).map(dayName).join(", "));
        i = j + 1;
      }
      return `${days.length === 7 ? "" : ranges.join(", ") + " "}${w.from}–${w.to}`;
    })
    .join(" · ");
}

export function ScheduleNote({ menu, t, locale, className }: { menu: GuestMenu; t: GuestT; locale: string; className?: string }) {
  if (!menu.scheduled) return null;
  return (
    <p className={cn("text-g-muted text-sm", className)}>
      {!menu.activeNow && <strong className="font-semibold">{t("notAvailableNow")} · </strong>}
      {t("availableTimes", { times: formatSchedule(menu.schedule, locale) })}
    </p>
  );
}

export function NoResults({ t, className }: { t: GuestT; className?: string }) {
  return (
    <p id="vm-noresults" hidden role="status" className={cn("text-g-muted py-16 text-center", className)}>
      {t("noResults")}
    </p>
  );
}

/** Table label or "scan your table's QR to order" hint. */
export function OrderingNotice({ data, t, className }: { data: GuestMenuData; t: GuestT; className?: string }) {
  if (data.table)
    return <p className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium", className)}>🪑 {t("table", { label: data.table.label })}</p>;
  if (data.ordering.needsTable) return <p className={cn("rounded-[var(--g-radius)] px-3 py-2 text-sm", className)}>{t("orderAtTableHint")}</p>;
  return null;
}

/** All categories of all menus for the nav. */
export const navCategories = (data: GuestMenuData) => data.menus.flatMap((m) => m.categories.map((c) => ({ id: c.id, name: c.name })));

/** Allergen options for the filter (all EU-14, localized). */
export const allergenFilterOptions = (locale: string) =>
  ALLERGENS.map((a) => ({ code: a.code, letter: a.letter, icon: a.icon, label: guestCatalogLabel(a, locale) }));
