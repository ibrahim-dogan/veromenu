import "server-only";
import { cache } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/core/db";
import { categories, itemVariants, items, media, menus, restaurants, tables, translations } from "@/core/db/schema";
import { getRestaurantContext } from "@/core/auth/guards";
import { mediaSrc } from "@/core/storage/media";
import { ADDITIVES, ALLERGENS } from "@/modules/allergens/catalog";
import { planHas } from "@/modules/billing/plans";
import { isVisibleToGuests } from "@/modules/translations/visibility";
import { hashSource } from "@/modules/translations/source";
import { ADDITIVE_BY_CODE, ALLERGEN_BY_CODE, guestCatalogLabel } from "./allergen-labels";
import { guestLocaleOptions, resolveGuestLocale } from "./locale";
import { isScheduleActive } from "./schedule";
import type { GuestCatalogLabel, GuestImage, GuestItem, GuestMenu, GuestMenuData, GuestPdfPage } from "./types";

export type GuestLoadResult =
  | { status: "ok"; data: GuestMenuData }
  | { status: "not_found" }
  | { status: "suspended"; name: string; locale: string; availableLocales: GuestMenuData["availableLocales"] };

export type GuestLoadOptions = {
  lang?: string | null;
  tableToken?: string | null;
  acceptLanguage?: string | null;
  /** Theme preview from the design page – only honored for users with theme.manage on this restaurant. */
  preview?: { themeId?: string | null; config?: unknown } | null;
};

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TOKEN = /^[A-Za-z0-9_-]{4,128}$/;

type MediaRow = Pick<typeof media.$inferSelect, "id" | "kind" | "storageKey" | "variants" | "mime" | "alt" | "width" | "height">;

function toImage(m: MediaRow | undefined): GuestImage | null {
  if (!m || !m.mime.startsWith("image/")) return null;
  return {
    sm: mediaSrc(m, "sm")!,
    md: mediaSrc(m, "md")!,
    alt: m.alt,
    isAi: m.kind === "ai_generated",
    width: m.width,
    height: m.height,
  };
}

/** Restaurant basics by slug (cached per request). Also used by the order status + imprint pages. */
export const getGuestRestaurantRow = cache(async (slug: string) => {
  if (!SLUG.test(slug)) return null;
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
  return r ?? null;
});

const loadCached = cache(
  async (slug: string, lang: string, tableToken: string, acceptLanguage: string, previewTheme: string, previewConfig: string): Promise<GuestLoadResult> => {
    const tokenValid = TOKEN.test(tableToken);
    const [r, tableRow] = await Promise.all([
      getGuestRestaurantRow(slug),
      tokenValid
        ? db
            .select({ id: tables.id, label: tables.label, restaurantId: tables.restaurantId, isActive: tables.isActive })
            .from(tables)
            .where(eq(tables.token, tableToken))
            .limit(1)
            .then((x) => x[0])
        : Promise.resolve(undefined),
    ]);
    if (!r) return { status: "not_found" };

    const availableLocales = guestLocaleOptions(r.enabledLocales, r.defaultLocale);
    const locale = resolveGuestLocale({ enabled: r.enabledLocales, defaultLocale: r.defaultLocale, lang, acceptLanguage });
    if (r.status !== "active") return { status: "suspended", name: r.name, locale, availableLocales };

    const settings = r.settings ?? {};
    const translate = locale !== r.defaultLocale;

    const [menuRows, catRows, itemRows, variantRows, trRows] = await Promise.all([
      db
        .select()
        .from(menus)
        .where(and(eq(menus.restaurantId, r.id), eq(menus.isActive, true)))
        .orderBy(asc(menus.sort), asc(menus.createdAt)),
      db
        .select()
        .from(categories)
        .where(and(eq(categories.restaurantId, r.id), eq(categories.isVisible, true)))
        .orderBy(asc(categories.sort), asc(categories.createdAt)),
      db
        .select()
        .from(items)
        .where(and(eq(items.restaurantId, r.id), eq(items.isVisible, true)))
        .orderBy(asc(items.sort), asc(items.createdAt)),
      db
        .select({ id: itemVariants.id, itemId: itemVariants.itemId, name: itemVariants.name, priceCents: itemVariants.priceCents })
        .from(itemVariants)
        .innerJoin(items, eq(items.id, itemVariants.itemId))
        .where(and(eq(items.restaurantId, r.id), eq(items.isVisible, true)))
        .orderBy(asc(itemVariants.sort)),
      translate
        ? db
            .select({
              entityType: translations.entityType,
              entityId: translations.entityId,
              field: translations.field,
              value: translations.value,
              status: translations.status,
              sourceHash: translations.sourceHash,
            })
            .from(translations)
            .where(
              and(
                eq(translations.restaurantId, r.id),
                eq(translations.locale, locale),
                inArray(translations.status, ["approved", "machine"]),
                inArray(translations.entityType, ["menu", "category", "item", "variant"]),
              ),
            )
        : Promise.resolve([]),
    ]);

    // Translation lookup (translations module contract): approved always, machine unless "only approved",
    // needs_review / stale never; a row whose sourceHash no longer matches the source text counts as stale.
    // Anything not visible falls back to the source text (default locale).
    const tr = new Map(trRows.filter((x) => isVisibleToGuests(x.status, settings)).map((x) => [`${x.entityType}:${x.entityId}:${x.field}`, x]));
    const L = (type: string, id: string, field: string, source: string | null) => {
      if (!translate || source == null || !source.trim()) return source;
      const row = tr.get(`${type}:${id}:${field}`);
      return row && row.sourceHash === hashSource(source) ? row.value : source;
    };

    const menuMode = settings.menuMode === "pdf" ? "pdf" : "digital";
    const menuIds = new Set(menuRows.map((m) => m.id));
    const cats = catRows.filter((c) => menuIds.has(c.menuId));
    const catIds = new Set(cats.map((c) => c.id));
    const its = itemRows.filter((i) => catIds.has(i.categoryId));

    // ---- media (one query for all images + pdf pages)
    const pdfIds = menuMode === "pdf" ? menuRows.flatMap((m) => m.pdfMediaIds ?? []) : [];
    const mediaIds = new Set<string>(
      [settings.logoMediaId, settings.coverMediaId, ...cats.map((c) => c.imageMediaId), ...its.map((i) => i.imageMediaId), ...pdfIds].filter(
        (x): x is string => !!x,
      ),
    );
    const mediaRows: MediaRow[] = mediaIds.size
      ? await db
          .select({
            id: media.id,
            kind: media.kind,
            storageKey: media.storageKey,
            variants: media.variants,
            mime: media.mime,
            alt: media.alt,
            width: media.width,
            height: media.height,
            restaurantId: media.restaurantId,
          })
          .from(media)
          .where(inArray(media.id, [...mediaIds]))
          .then((rows) => rows.filter((m) => m.restaurantId === r.id || m.restaurantId === null))
      : [];
    const mediaById = new Map(mediaRows.map((m) => [m.id, m]));
    const img = (id: string | null | undefined) => (id ? toImage(mediaById.get(id)) : null);

    // ---- ordering rules
    const ord = settings.ordering;
    const table = tableRow && tableRow.restaurantId === r.id && tableRow.isActive ? { id: tableRow.id, label: tableRow.label } : null;
    const orderingFeature = !!ord?.enabled && planHas(r.plan, "ordering");
    const orderingEnabled = orderingFeature && (!!table || !ord?.requireTable);

    // ---- items
    const variantsByItem = new Map<string, { id: string; name: string; priceCents: number }[]>();
    for (const v of variantRows) {
      const list = variantsByItem.get(v.itemId) ?? [];
      list.push({ id: v.id, name: L("variant", v.id, "name", v.name) ?? v.name, priceCents: v.priceCents });
      variantsByItem.set(v.itemId, list);
    }
    const usedAllergens = new Set<string>();
    const usedAdditives = new Set<string>();
    let hasUnconfirmed = false;
    const label = (code: string, kind: "allergen" | "additive"): GuestCatalogLabel | null => {
      const e = (kind === "allergen" ? ALLERGEN_BY_CODE : ADDITIVE_BY_CODE).get(code);
      return e ? { code: e.code, letter: e.letter, icon: e.icon, label: guestCatalogLabel(e, locale) } : null;
    };

    const itemsByCat = new Map<string, GuestItem[]>();
    for (const i of its) {
      const confirmed = i.allergenStatus === "confirmed";
      if (!confirmed) hasUnconfirmed = true;
      const allergens = confirmed ? i.allergens.map((c) => label(c, "allergen")).filter((x): x is GuestCatalogLabel => !!x) : [];
      const additives = confirmed ? i.additives.map((c) => label(c, "additive")).filter((x): x is GuestCatalogLabel => !!x) : [];
      allergens.forEach((a) => usedAllergens.add(a.code));
      additives.forEach((a) => usedAdditives.add(a.code));
      const variants = variantsByItem.get(i.id) ?? [];
      const item: GuestItem = {
        id: i.id,
        categoryId: i.categoryId,
        name: L("item", i.id, "name", i.name) ?? i.name,
        description: L("item", i.id, "description", i.description),
        priceCents: i.priceCents,
        variants,
        image: img(i.imageMediaId),
        tags: i.tags,
        allergensConfirmed: confirmed,
        allergens,
        additives,
        available: i.isAvailable,
        orderable: orderingEnabled && i.isAvailable && (i.priceCents != null || variants.length > 0),
      };
      const list = itemsByCat.get(i.categoryId) ?? [];
      list.push(item);
      itemsByCat.set(i.categoryId, list);
    }

    // ---- menus: currently active scheduled menus first, then unscheduled, then scheduled-but-closed
    const now = new Date();
    const guestMenus: GuestMenu[] = menuRows
      .map((m) => {
        const schedule = m.schedule ?? [];
        return {
          id: m.id,
          name: L("menu", m.id, "name", m.name) ?? m.name,
          description: L("menu", m.id, "description", m.description),
          scheduled: schedule.length > 0,
          activeNow: isScheduleActive(schedule, r.timezone, now),
          schedule,
          categories: cats
            .filter((c) => c.menuId === m.id)
            .map((c) => ({
              id: c.id,
              menuId: c.menuId,
              name: L("category", c.id, "name", c.name) ?? c.name,
              description: L("category", c.id, "description", c.description),
              image: img(c.imageMediaId),
              items: itemsByCat.get(c.id) ?? [],
            }))
            .filter((c) => c.items.length > 0),
        };
      })
      .filter((m) => m.categories.length > 0)
      .map((m, idx) => ({ m, rank: m.scheduled && m.activeNow ? 0 : !m.scheduled ? 1 : 2, idx }))
      .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
      .map((x) => x.m);

    const pdfPages: GuestPdfPage[] = pdfIds
      .map((id) => mediaById.get(id))
      .filter((m): m is MediaRow => !!m)
      .map((m) => ({ id: m.id, url: mediaSrc(m, "orig")!, mime: m.mime, image: toImage(m) }));

    // ---- theme (preview override only for authorized dashboard users)
    let theme = { id: r.themeId, config: r.themeConfig ?? {} };
    let preview = false;
    if (previewTheme || previewConfig) {
      const ctx = await getRestaurantContext(r.id).catch(() => null);
      if (ctx?.can("theme.manage")) {
        preview = true;
        const id = previewTheme || r.themeId;
        theme = {
          id,
          // A theme other than the active one previews with its own defaults – the saved config belongs to the active theme.
          config: previewConfig ? ((JSON.parse(previewConfig) as Record<string, unknown> | null) ?? {}) : id === r.themeId ? r.themeConfig : {},
        };
      }
    }

    const data: GuestMenuData = {
      restaurant: {
        id: r.id,
        slug: r.slug,
        name: r.name,
        cuisine: settings.cuisine ?? null,
        address: settings.address ?? null,
        phone: settings.phone ?? null,
        email: settings.email ?? null,
        website: settings.website ?? null,
        logo: img(settings.logoMediaId),
        cover: img(settings.coverMediaId),
        openingHours: settings.openingHours ?? [],
        legal: settings.legal ?? {},
        currency: r.currency,
        timezone: r.timezone,
      },
      locale,
      defaultLocale: r.defaultLocale,
      dir: availableLocales.find((l) => l.code === locale)?.rtl ? "rtl" : "ltr",
      availableLocales,
      menuMode,
      menus: guestMenus,
      pdfPages,
      table,
      tableToken: table ? tableToken : null,
      ordering: { enabled: orderingEnabled, needsTable: orderingFeature && !orderingEnabled, allowNotes: ord?.allowNotes ?? true },
      showBranding: !planHas(r.plan, "custom_branding"),
      legend: {
        allergens: ALLERGENS.filter((a) => usedAllergens.has(a.code)).map((a) => label(a.code, "allergen")!),
        additives: ADDITIVES.filter((a) => usedAdditives.has(a.code)).map((a) => label(a.code, "additive")!),
      },
      hasUnconfirmedAllergens: hasUnconfirmed,
      theme,
      preview,
    };
    return { status: "ok", data };
  },
);

/** Loads everything the guest menu needs in 3 round trips (restaurant+table → content → media). */
export function loadGuestMenu(slug: string, opts: GuestLoadOptions = {}): Promise<GuestLoadResult> {
  let previewConfig = "";
  if (opts.preview?.config != null) {
    try {
      previewConfig = JSON.stringify(opts.preview.config);
    } catch {
      previewConfig = "";
    }
  }
  return loadCached(
    slug,
    opts.lang ?? "",
    opts.tableToken ?? "",
    opts.acceptLanguage ?? "",
    opts.preview?.themeId ?? "",
    previewConfig,
  );
}
