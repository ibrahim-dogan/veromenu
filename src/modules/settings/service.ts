import "server-only";
import { and, eq, ne, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { restaurants, translations } from "@/core/db/schema";
import type { RestaurantSettings } from "@/core/db/schema";
import { AppError } from "@/core/http/errors";
import { CONTENT_LOCALE_CODES } from "@/core/i18n/locales";
import { getPlan } from "@/modules/billing/plans";
import { getMenuTree } from "@/modules/menu/service";

/**
 * Restaurant profile & settings. `settings` is a shared JSON document (menu engineer writes `menuMode`,
 * design writes theme columns) → every write MERGES top-level keys atomically, never replaces the document.
 */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
const RESERVED_SLUGS = new Set(["admin", "api", "dashboard", "login", "register", "m", "media", "www", "app", "help", "support"]);

export async function getRestaurant(restaurantId: string) {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) throw new AppError("notFound");
  return r;
}

/**
 * Atomic shallow merge of top-level settings keys (`settings || patch`).
 * Keys present in `patch` with value `undefined` are removed from the document.
 */
export async function patchSettings(restaurantId: string, patch: Partial<RestaurantSettings>, extra: Partial<typeof restaurants.$inferInsert> = {}) {
  const remove = Object.entries(patch)
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  let expr = dsql`(${restaurants.settings} || ${JSON.stringify(patch)}::jsonb)`;
  for (const k of remove) expr = dsql`(${expr} - ${k}::text)`;
  const [r] = await db
    .update(restaurants)
    .set({
      ...extra,
      settings: expr,
      updatedAt: new Date(),
    })
    .where(eq(restaurants.id, restaurantId))
    .returning();
  if (!r) throw new AppError("notFound");
  return r;
}

export async function slugAvailability(restaurantId: string, slug: string) {
  if (!SLUG_RE.test(slug) || RESERVED_SLUGS.has(slug)) return { valid: false, available: false };
  const [hit] = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(and(eq(restaurants.slug, slug), ne(restaurants.id, restaurantId)))
    .limit(1);
  return { valid: true, available: !hit };
}

export async function changeSlug(restaurantId: string, slug: string) {
  const a = await slugAvailability(restaurantId, slug);
  if (!a.valid) throw new AppError("validation", "slugInvalid");
  if (!a.available) throw new AppError("slugTaken");
  try {
    const [r] = await db.update(restaurants).set({ slug, updatedAt: new Date() }).where(eq(restaurants.id, restaurantId)).returning();
    return r;
  } catch (e) {
    // unique index race
    if (String((e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code) === "23505") throw new AppError("slugTaken");
    throw e;
  }
}

/** Guest languages. The source language is always included; plan limit counts it. */
export async function setEnabledLocales(restaurantId: string, locales: string[]) {
  const r = await getRestaurant(restaurantId);
  const set = Array.from(new Set([r.defaultLocale, ...locales.filter((l) => CONTENT_LOCALE_CODES.includes(l))]));
  const limit = getPlan(r.plan).limits.locales;
  if (set.length > limit) throw new AppError("planLimit", `${set.length}/${limit}`);
  // keep catalog order (source first)
  const ordered = [r.defaultLocale, ...CONTENT_LOCALE_CODES.filter((c) => c !== r.defaultLocale && set.includes(c))];
  const [u] = await db.update(restaurants).set({ enabledLocales: ordered, updatedAt: new Date() }).where(eq(restaurants.id, restaurantId)).returning();
  return u;
}

/** Full menu export incl. translations (DSGVO data portability / backup). */
export async function exportMenu(restaurantId: string) {
  const r = await getRestaurant(restaurantId);
  const [tree, trs] = await Promise.all([
    getMenuTree(restaurantId),
    db
      .select({
        entityType: translations.entityType,
        entityId: translations.entityId,
        field: translations.field,
        locale: translations.locale,
        value: translations.value,
        status: translations.status,
      })
      .from(translations)
      .where(eq(translations.restaurantId, restaurantId)),
  ]);
  return {
    format: "veromenu.menu-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    restaurant: {
      name: r.name,
      slug: r.slug,
      defaultLocale: r.defaultLocale,
      enabledLocales: r.enabledLocales,
      currency: r.currency,
      timezone: r.timezone,
      settings: r.settings,
    },
    menus: tree.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      isActive: m.isActive,
      schedule: m.schedule,
      categories: m.categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        isVisible: c.isVisible,
        items: c.items.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          ingredients: i.ingredients,
          priceCents: i.priceCents,
          isVisible: i.isVisible,
          isAvailable: i.isAvailable,
          tags: i.tags,
          allergens: i.allergens,
          additives: i.additives,
          allergenStatus: i.allergenStatus,
          variants: i.variants.map((v) => ({ id: v.id, name: v.name, priceCents: v.priceCents })),
        })),
      })),
    })),
    translations: trs,
  };
}
