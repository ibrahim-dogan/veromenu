import "server-only";
import { and, desc, eq, inArray, sql as dsql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/core/db";
import { categories, items, media, menus, restaurants } from "@/core/db/schema";
import { AppError } from "@/core/http/errors";
import { storage, mediaUrl } from "@/core/storage";
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES, mediaSrc, saveMedia, type Media } from "@/core/storage/media";

/**
 * Media library service (restaurant-scoped). Upload storage itself lives in core/storage/media.ts.
 */

export type MediaDto = {
  id: string;
  kind: "upload" | "ai_generated";
  mime: string;
  url: string;
  thumb: string;
  variants: Record<string, string>;
  alt: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  aiPrompt: string | null;
  aiModel: string | null;
  createdAt: string;
};

export function toMediaDto(m: Media): MediaDto {
  return {
    id: m.id,
    kind: m.kind,
    mime: m.mime,
    url: mediaUrl(m.storageKey)!,
    thumb: mediaSrc(m, "sm")!,
    variants: Object.fromEntries(Object.entries(m.variants ?? {}).map(([k, v]) => [k, mediaUrl(v)!])),
    alt: m.alt,
    width: m.width,
    height: m.height,
    sizeBytes: m.sizeBytes,
    aiPrompt: m.aiPrompt,
    aiModel: m.aiModel,
    createdAt: m.createdAt.toISOString(),
  };
}

export type MediaFilter = "image" | "pdf" | "any";

export async function listMedia(restaurantId: string, opts: { type?: MediaFilter; kind?: "upload" | "ai_generated"; limit?: number } = {}) {
  const conds = [eq(media.restaurantId, restaurantId)];
  if (opts.type === "image") conds.push(dsql`${media.mime} like 'image/%'`);
  if (opts.type === "pdf") conds.push(eq(media.mime, "application/pdf"));
  if (opts.kind) conds.push(eq(media.kind, opts.kind));
  return db
    .select()
    .from(media)
    .where(and(...conds))
    .orderBy(desc(media.createdAt))
    .limit(opts.limit ?? 500);
}

export async function getOwnMedia(restaurantId: string, id: string) {
  const [row] = await db.select().from(media).where(and(eq(media.id, id), eq(media.restaurantId, restaurantId))).limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

/** Ensures all ids belong to the restaurant (used before storing references). */
export async function assertOwnMediaIds(restaurantId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(and(inArray(media.id, unique), eq(media.restaurantId, restaurantId)));
  if (rows.length !== unique.length) throw new AppError("notFound");
}

export type MediaUsage = { items: number; categories: number; menus: number; branding: number };

/** Where a media item is referenced (items, categories, PDF menus, logo/cover). */
export async function mediaUsage(restaurantId: string, ids: string[]): Promise<Map<string, MediaUsage>> {
  const out = new Map<string, MediaUsage>(ids.map((id) => [id, { items: 0, categories: 0, menus: 0, branding: 0 }]));
  if (!ids.length) return out;
  const [is, cs, ms, [r]] = await Promise.all([
    db
      .select({ id: items.imageMediaId, n: dsql<number>`count(*)::int` })
      .from(items)
      .where(and(eq(items.restaurantId, restaurantId), inArray(items.imageMediaId, ids)))
      .groupBy(items.imageMediaId),
    db
      .select({ id: categories.imageMediaId, n: dsql<number>`count(*)::int` })
      .from(categories)
      .where(and(eq(categories.restaurantId, restaurantId), inArray(categories.imageMediaId, ids)))
      .groupBy(categories.imageMediaId),
    db.select({ ids: menus.pdfMediaIds }).from(menus).where(eq(menus.restaurantId, restaurantId)),
    db.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1),
  ]);
  for (const row of is) if (row.id && out.has(row.id)) out.get(row.id)!.items = row.n;
  for (const row of cs) if (row.id && out.has(row.id)) out.get(row.id)!.categories = row.n;
  for (const m of ms) for (const id of m.ids) if (out.has(id)) out.get(id)!.menus++;
  for (const id of [r?.settings?.logoMediaId, r?.settings?.coverMediaId]) if (id && out.has(id)) out.get(id)!.branding++;
  return out;
}

export const usageTotal = (u: MediaUsage | undefined) => (u ? u.items + u.categories + u.menus + u.branding : 0);

export async function updateMediaAlt(restaurantId: string, id: string, alt: string | null) {
  await getOwnMedia(restaurantId, id);
  const [row] = await db.update(media).set({ alt }).where(eq(media.id, id)).returning();
  return row;
}

/**
 * Deletes a media item + its files. References are cleaned up: item/category images are set to null
 * by the FK, PDF-menu lists and logo/cover settings are cleaned here.
 */
export async function deleteMedia(restaurantId: string, id: string) {
  const m = await getOwnMedia(restaurantId, id);
  await db.transaction(async (tx) => {
    await tx
      .update(menus)
      .set({ pdfMediaIds: dsql`array_remove(${menus.pdfMediaIds}, ${id}::uuid)` })
      .where(and(eq(menus.restaurantId, restaurantId), dsql`${id}::uuid = any(${menus.pdfMediaIds})`));
    await tx
      .update(restaurants)
      .set({
        settings: dsql`${restaurants.settings}
          || (case when ${restaurants.settings}->>'logoMediaId' = ${id} then '{"logoMediaId": null}'::jsonb else '{}'::jsonb end)
          || (case when ${restaurants.settings}->>'coverMediaId' = ${id} then '{"coverMediaId": null}'::jsonb else '{}'::jsonb end)`,
      })
      .where(eq(restaurants.id, restaurantId));
    await tx.delete(media).where(eq(media.id, id));
  });
  const keys = [m.storageKey, ...Object.values(m.variants ?? {})];
  await Promise.all(keys.map((k) => storage().delete(k).catch(() => undefined)));
  return m;
}

// ------------------------------------------------------------------ upload validation

export const UPLOAD_ACCEPT = ALLOWED_UPLOAD_MIME;
export { MAX_UPLOAD_BYTES };

/**
 * Validates an uploaded file by content (not only by the declared mime) and stores it.
 * Throws AppError("validation") for unsupported / broken files.
 */
export async function storeUpload(opts: { restaurantId: string; userId: string; data: Buffer; mime: string; alt?: string | null }) {
  const mime = opts.mime === "image/jpg" ? "image/jpeg" : opts.mime;
  if (!ALLOWED_UPLOAD_MIME.includes(mime)) throw new AppError("validation", "mime");
  if (opts.data.length === 0 || opts.data.length > MAX_UPLOAD_BYTES) throw new AppError("validation", "size");
  if (mime === "application/pdf") {
    if (opts.data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AppError("validation", "pdf");
  } else {
    try {
      const meta = await sharp(opts.data, { failOn: "error" }).metadata();
      if (!meta.width || !meta.height) throw new Error("no dimensions");
    } catch {
      throw new AppError("validation", "image");
    }
  }
  try {
    return await saveMedia({ restaurantId: opts.restaurantId, data: opts.data, mime, userId: opts.userId, alt: opts.alt ?? null });
  } catch (e) {
    console.error("[media] save failed", e);
    throw new AppError("validation", "image");
  }
}
