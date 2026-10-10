/**
 * GuestMenuData (src/modules/guest/load.ts) → ThemeView (snake_case Liquid data model). Isomorphic.
 */
import type { GuestCatalogLabel, GuestMenuData } from "@/modules/guest/types";
import type { ThemeLabel, ThemeManifest, ThemeView } from "./types";
import { makeMoney } from "./liquid";
import { resolveSettings } from "./settings";

const label = (l: GuestCatalogLabel): ThemeLabel => ({ code: l.code, letter: l.letter, label: l.label });

export function weekdayName(day: number, locale: string): string {
  const d = day === 0 ? 7 : day; // 1 = Monday … 7 = Sunday (0 = Sunday too)
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  } catch {
    fmt = new Intl.DateTimeFormat("de", { weekday: "long", timeZone: "UTC" });
  }
  return fmt.format(new Date(Date.UTC(2024, 0, d))); // 2024-01-01 was a Monday
}

export function buildThemeView(data: GuestMenuData, opts: { manifest?: Pick<ThemeManifest, "settings">; settings?: unknown; mode?: ThemeView["mode"] } = {}): ThemeView {
  const r = data.restaurant;
  const money = makeMoney(data.locale, r.currency);
  const address = [r.address?.street, [r.address?.zip, r.address?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const rawSettings = opts.settings ?? data.theme.config ?? {};
  return {
    restaurant: {
      name: r.name,
      slug: r.slug,
      cuisine: r.cuisine,
      logo_url: r.logo?.sm ?? null,
      cover_url: r.cover?.md ?? null,
      address: address || null,
      phone: r.phone,
      opening_hours: [...r.openingHours]
        .sort((a, b) => (a.day || 7) - (b.day || 7) || a.open.localeCompare(b.open))
        .map((h) => ({ day: h.day, day_name: weekdayName(h.day, data.locale), open: h.open, close: h.close })),
    },
    locale: data.locale,
    dir: data.dir,
    languages: data.availableLocales.map((l) => ({ code: l.code, name: l.native, flag: l.flag, active: l.code === data.locale })),
    table: data.table ? { label: data.table.label } : null,
    ordering: { enabled: data.ordering.enabled },
    menus: data.menus.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      active_now: !m.scheduled || m.activeNow,
      categories: m.categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        image_url: c.image?.md ?? null,
        items: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          price: i.priceCents,
          price_formatted: money(i.priceCents),
          image_url: i.image?.sm ?? null,
          image_url_large: i.image?.md ?? null,
          image_is_ai: !!i.image?.isAi,
          tags: i.tags,
          allergens_confirmed: i.allergensConfirmed,
          allergens: i.allergens.map(label),
          additives: i.additives.map(label),
          available: i.available,
          orderable: i.orderable,
          variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: v.priceCents, price_formatted: money(v.priceCents) })),
        })),
      })),
    })),
    settings: opts.manifest ? resolveSettings(opts.manifest, rawSettings) : ((rawSettings as Record<string, unknown>) ?? {}),
    mode: opts.mode ?? (data.preview ? "preview" : "live"),
    currency: r.currency,
    legend: { allergens: data.legend.allergens.map(label), additives: data.legend.additives.map(label) },
    has_unconfirmed_allergens: data.hasUnconfirmedAllergens,
    show_branding: data.showBranding,
  };
}
