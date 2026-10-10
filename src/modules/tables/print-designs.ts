import "server-only";
/**
 * QR print designs (theme packages of kind "print") – server helpers for the tables page and the print route:
 * builds the PrintView data model from the restaurant + its tables. Rendering is done by the theme engine
 * (renderPrintDocument, isomorphic), printing by the browser.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { media, type tables } from "@/core/db/schema";
import { mediaSrc } from "@/core/storage/media";
import { localeInfo } from "@/core/i18n/locales";
import { planHas } from "@/modules/billing/plans";
import { printStrings, printTableNumber } from "@/modules/theme-engine/print";
import type { PrintView } from "@/modules/theme-engine/types";
import { guestMenuUrl } from "./service";

type TableRow = typeof tables.$inferSelect;
type RestaurantLike = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  defaultLocale: string;
  enabledLocales: string[];
  settings: {
    cuisine?: string;
    phone?: string;
    website?: string;
    address?: { street?: string; zip?: string; city?: string };
    logoMediaId?: string | null;
    ordering?: { enabled?: boolean };
  } | null;
};

/** Restaurant-level part of every card (name, logo, languages, ordering). */
export async function printRestaurantData(r: RestaurantLike): Promise<Pick<PrintView, "restaurant" | "languages" | "ordering">> {
  const s = r.settings ?? {};
  let logo: string | null = null;
  if (s.logoMediaId && /^[0-9a-f-]{36}$/i.test(s.logoMediaId)) {
    const [m] = await db
      .select({ storageKey: media.storageKey, variants: media.variants, mime: media.mime })
      .from(media)
      .where(and(eq(media.id, s.logoMediaId), eq(media.restaurantId, r.id)))
      .limit(1);
    if (m?.mime.startsWith("image/")) logo = mediaSrc(m, "md");
  }
  const address = [s.address?.street, [s.address?.zip, s.address?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const website = s.website?.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "") || null;
  const codes = Array.from(new Set([r.defaultLocale, ...(r.enabledLocales ?? [])])).filter((c) => localeInfo(c));
  return {
    restaurant: {
      name: r.name,
      slug: r.slug,
      cuisine: s.cuisine ?? null,
      logo_url: logo,
      address: address || null,
      phone: s.phone ?? null,
      website,
    },
    languages: codes.map((code) => {
      const l = localeInfo(code)!;
      return { code, name: l.native, flag: l.flag, scan_text: printStrings(code).scanMenu };
    }),
    ordering: { enabled: !!s.ordering?.enabled && planHas(r.plan, "ordering") },
  };
}

/**
 * One view per card: optional generic restaurant card first, then the tables (in the given order).
 * qr_svg is left empty – the engine generates it from table.url with the design's QR colours.
 */
export async function buildPrintViews(
  r: RestaurantLike,
  opts: { tables: TableRow[]; generic: boolean; settings: Record<string, unknown>; mode?: PrintView["mode"] },
): Promise<PrintView[]> {
  const base = await printRestaurantData(r);
  const cards: PrintView["table"][] = [];
  if (opts.generic) cards.push({ label: null, area: null, number: null, is_generic: true, url: guestMenuUrl(r.slug), qr_svg: "" });
  for (const t of opts.tables)
    cards.push({ label: t.label, area: t.area, number: printTableNumber(t.label), is_generic: false, url: guestMenuUrl(r.slug, t.token), qr_svg: "" });
  return cards.map((table, i) => ({
    ...base,
    table,
    card: { index: i + 1, total: cards.length, face: "front" },
    settings: opts.settings,
    mode: opts.mode ?? "print",
  }));
}
