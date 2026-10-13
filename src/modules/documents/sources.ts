import "server-only";
import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { media, restaurants } from "@/core/db/schema";
import { AppError } from "@/core/http/errors";
import { mediaUrl } from "@/core/storage";
import { mediaSrc } from "@/core/storage/media";

/** The restaurant's own menu documents (PDF / photos), stored once in restaurants.settings.sources. */

export const MAX_SOURCE_DOCUMENTS = 10;
export const isSourceMime = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");

/** Media ids in settings.sources that still exist and belong to the restaurant (upload order). */
export async function getSourceDocuments(restaurantId: string): Promise<string[]> {
  const [r] = await db.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  const ids = r?.settings?.sources?.mediaIds ?? [];
  if (!ids.length) return [];
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(and(inArray(media.id, ids), eq(media.restaurantId, restaurantId)));
  const alive = new Set(rows.map((x) => x.id));
  return ids.filter((id) => alive.has(id));
}

/** Replaces/extends the stored source documents (validates ownership + mime, max 10). */
export async function setSourceDocuments(restaurantId: string, mediaIds: string[], mode: "replace" | "append" = "replace"): Promise<string[]> {
  const incoming = [...new Set(mediaIds)];
  if (incoming.length) {
    const rows = await db
      .select({ id: media.id, mime: media.mime })
      .from(media)
      .where(and(inArray(media.id, incoming), eq(media.restaurantId, restaurantId)));
    if (rows.length !== incoming.length) throw new AppError("notFound");
    if (rows.some((x) => !isSourceMime(x.mime))) throw new AppError("validation", "mime");
  }
  const next = mode === "append" ? [...new Set([...(await getSourceDocuments(restaurantId)), ...incoming])] : incoming;
  if (next.length > MAX_SOURCE_DOCUMENTS) throw new AppError("validation", "sources");
  const sources = { mediaIds: next, updatedAt: new Date().toISOString() };
  await db
    .update(restaurants)
    .set({ settings: dsql`${restaurants.settings} || jsonb_build_object('sources', ${JSON.stringify(sources)}::jsonb)`, updatedAt: new Date() })
    .where(eq(restaurants.id, restaurantId));
  return next;
}

export type SourceDocumentDto = { id: string; mime: string; name: string | null; url: string; thumb: string | null };

/** Stored source documents for UI lists (PDF thumbnail = cached render of page 1, if any). */
export async function listSourceDocuments(restaurantId: string): Promise<SourceDocumentDto[]> {
  const ids = await getSourceDocuments(restaurantId);
  if (!ids.length) return [];
  const [rows, firstPages] = await Promise.all([
    db.select().from(media).where(and(inArray(media.id, ids), eq(media.restaurantId, restaurantId))),
    db
      .select()
      .from(media)
      .where(and(eq(media.restaurantId, restaurantId), inArray(media.sourceMediaId, ids), eq(media.alt, "Seite 1"))),
  ]);
  const byId = new Map(rows.map((m) => [m.id, m]));
  const pageOne = new Map(firstPages.map((m) => [m.sourceMediaId!, m]));
  return ids
    .map((id) => byId.get(id))
    .filter((m) => !!m)
    .map((m) => ({
      id: m.id,
      mime: m.mime,
      name: m.alt,
      url: mediaUrl(m.storageKey)!,
      thumb: m.mime.startsWith("image/") ? mediaSrc(m, "sm") : pageOne.has(m.id) ? mediaSrc(pageOne.get(m.id), "sm") : null,
    }));
}
