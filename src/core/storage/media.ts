import "server-only";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/core/db";
import { media } from "@/core/db/schema";
import { storage, mediaUrl } from "./index";

export type Media = typeof media.$inferSelect;

export const ALLOWED_UPLOAD_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/avif", "application/pdf"];
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/**
 * Stores a file. Images get auto-rotated + optimized webp variants (sm 480px, md 1200px).
 */
export async function saveMedia(opts: {
  restaurantId: string | null;
  data: Buffer;
  mime: string;
  userId?: string | null;
  kind?: "upload" | "ai_generated";
  alt?: string | null;
  aiPrompt?: string | null;
  aiModel?: string | null;
  sourceMediaId?: string | null;
}): Promise<Media> {
  if (!ALLOWED_UPLOAD_MIME.includes(opts.mime)) throw new Error(`unsupported mime ${opts.mime}`);
  if (opts.data.length > MAX_UPLOAD_BYTES) throw new Error("file too large");
  const base = `${opts.restaurantId ?? "platform"}/${new Date().toISOString().slice(0, 7)}/${nanoid(16)}`;
  const key = `${base}.${EXT[opts.mime] ?? "bin"}`;
  const variants: Record<string, string> = {};
  let width: number | null = null;
  let height: number | null = null;

  if (opts.mime.startsWith("image/")) {
    const img = sharp(opts.data, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
    for (const [name, size] of [
      ["sm", 480],
      ["md", 1200],
    ] as const) {
      const buf = await img.clone().resize({ width: size, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      variants[name] = `${base}_${name}.webp`;
      await storage().put(variants[name], buf, "image/webp");
    }
  }
  await storage().put(key, opts.data, opts.mime);

  const [row] = await db
    .insert(media)
    .values({
      restaurantId: opts.restaurantId,
      kind: opts.kind ?? "upload",
      storageKey: key,
      variants,
      mime: opts.mime,
      sizeBytes: opts.data.length,
      width,
      height,
      alt: opts.alt ?? null,
      aiPrompt: opts.aiPrompt ?? null,
      aiModel: opts.aiModel ?? null,
      sourceMediaId: opts.sourceMediaId ?? null,
      createdBy: opts.userId ?? null,
    })
    .returning();
  return row;
}

export async function getMedia(id: string | null | undefined) {
  if (!id) return null;
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  return row ?? null;
}

export async function readMediaBuffer(m: Media) {
  return storage().get(m.storageKey);
}

/** Best URL for a size; falls back to original. */
export function mediaSrc(m: Pick<Media, "storageKey" | "variants"> | null | undefined, size: "sm" | "md" | "orig" = "md") {
  if (!m) return null;
  return mediaUrl(size !== "orig" && m.variants?.[size] ? m.variants[size] : m.storageKey);
}
