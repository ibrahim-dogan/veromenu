import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/core/db";
import { media, translations, type TranslationStatus } from "@/core/db/schema";
import type { Restaurant } from "@/core/auth/guards";
import { toMediaDto } from "@/modules/media/service";
import { countUsage, getMenuTree, type MenuTree } from "./service";
import type { EditorMedia } from "./components/types";

/** Statuses a guest actually sees (see translation visibility contract). */
export function visibleStatuses(onlyApproved: boolean): TranslationStatus[] {
  return onlyApproved ? ["approved"] : ["approved", "machine"];
}

/**
 * For every item: the enabled guest locales (≠ source) in which at least one of its non-empty
 * texts (name, description) has no guest-visible translation.
 */
export async function itemTranslationGaps(restaurant: Restaurant, tree: MenuTree): Promise<Record<string, string[]>> {
  const locales = restaurant.enabledLocales.filter((l) => l !== restaurant.defaultLocale);
  const all = tree.flatMap((m) => m.categories.flatMap((c) => c.items));
  if (!locales.length || !all.length) return {};
  const rows = await db
    .select({ entityId: translations.entityId, field: translations.field, locale: translations.locale })
    .from(translations)
    .where(
      and(
        eq(translations.restaurantId, restaurant.id),
        eq(translations.entityType, "item"),
        inArray(translations.locale, locales),
        inArray(translations.status, visibleStatuses(!!restaurant.settings?.translations?.guestsSeeOnlyApproved)),
      ),
    );
  const have = new Set(rows.map((r) => `${r.entityId}|${r.field}|${r.locale}`));
  const out: Record<string, string[]> = {};
  for (const it of all) {
    const fields = ["name", ...(it.description?.trim() ? ["description"] : [])];
    const missing = locales.filter((l) => fields.some((f) => !have.has(`${it.id}|${f}|${l}`)));
    if (missing.length) out[it.id] = missing;
  }
  return out;
}

/** Everything the menu editor needs in one go. */
export async function loadEditorData(restaurant: Restaurant) {
  const tree = await getMenuTree(restaurant.id);
  const mediaIds = new Set<string>();
  for (const m of tree) {
    m.pdfMediaIds.forEach((id) => mediaIds.add(id));
    for (const c of m.categories) {
      if (c.imageMediaId) mediaIds.add(c.imageMediaId);
      for (const i of c.items) if (i.imageMediaId) mediaIds.add(i.imageMediaId);
    }
  }
  const [mediaRows, gaps, usage] = await Promise.all([
    mediaIds.size
      ? db
          .select()
          .from(media)
          .where(and(eq(media.restaurantId, restaurant.id), inArray(media.id, [...mediaIds])))
      : Promise.resolve([]),
    itemTranslationGaps(restaurant, tree),
    countUsage(restaurant.id),
  ]);
  const mediaMap: Record<string, EditorMedia> = {};
  for (const r of mediaRows) {
    const d = toMediaDto(r);
    mediaMap[r.id] = { id: d.id, thumb: d.thumb, url: d.url, mime: d.mime, alt: d.alt, kind: d.kind };
  }
  return { tree, mediaMap, gaps, usage };
}
