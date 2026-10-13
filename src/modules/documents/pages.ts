import "server-only";
import sharp from "sharp";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/core/db";
import { media } from "@/core/db/schema";
import { AppError } from "@/core/http/errors";
import { readMediaBuffer, saveMedia, type Media } from "@/core/storage/media";
import { renderPdfPages } from "./pdf";
import { isSourceMime } from "./sources";

export type PageImage = { sourceMediaId: string; pageIndex: number; mediaId: string; width: number; height: number };

export const DEFAULT_MAX_PAGES = 6;
const HARD_MAX_PAGES = 20;

/** Render rows are recognised by sourceMediaId + alt "Seite n" (n = 1-based page number). */
const pageAlt = (pageIndex: number) => `Seite ${pageIndex + 1}`;
const PAGE_ALT_RE = /^Seite (\d{1,3})$/;

/** Page counts of PDFs seen in this process (saves re-opening a PDF when all needed renders are cached). */
const pageCounts = new Map<string, number>();
/** Serialises renders per source document – parallel kit steps must not render the same PDF twice. */
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}

async function cachedRenders(restaurantId: string, sourceId: string) {
  const rows = await db
    .select()
    .from(media)
    .where(and(eq(media.restaurantId, restaurantId), eq(media.sourceMediaId, sourceId)));
  const byPage = new Map<number, Media>();
  for (const r of rows) {
    const m = r.alt ? PAGE_ALT_RE.exec(r.alt) : null;
    if (!m || !r.mime.startsWith("image/")) continue;
    const idx = Number(m[1]) - 1;
    if (!byPage.has(idx)) byPage.set(idx, r);
  }
  return byPage;
}

const toPage = (sourceId: string, pageIndex: number, m: Pick<Media, "id" | "width" | "height">): PageImage => ({
  sourceMediaId: sourceId,
  pageIndex,
  mediaId: m.id,
  width: m.width ?? 0,
  height: m.height ?? 0,
});

async function pdfPages(doc: Media, maxPages: number, userId: string | null): Promise<PageImage[]> {
  return withLock(doc.id, async () => {
    const restaurantId = doc.restaurantId!;
    const cached = await cachedRenders(restaurantId, doc.id);
    const known = pageCounts.get(doc.id);
    const wanted = Array.from({ length: Math.min(maxPages, known ?? maxPages) }, (_, i) => i);
    const missing = wanted.filter((i) => !cached.has(i));
    if (missing.length) {
      const buf = await readMediaBuffer(doc);
      if (!buf) throw new AppError("notFound", "file missing");
      let rendered: Awaited<ReturnType<typeof renderPdfPages>>;
      try {
        rendered = await renderPdfPages(buf, missing);
      } catch (e) {
        console.error("[documents] pdf render failed", doc.id, e);
        throw new AppError("validation", "pdf");
      }
      pageCounts.set(doc.id, rendered.numPages);
      for (const p of rendered.pages) {
        const m = await saveMedia({
          restaurantId,
          data: p.png,
          mime: "image/png",
          userId,
          kind: "upload",
          alt: pageAlt(p.pageIndex),
          sourceMediaId: doc.id,
        });
        cached.set(p.pageIndex, m);
      }
    }
    const count = pageCounts.get(doc.id);
    return wanted
      .filter((i) => cached.has(i) && (count == null || i < count))
      .map((i) => toPage(doc.id, i, cached.get(i)!));
  });
}

/** Photos are used as they are; EXIF-rotated photos get an upright copy (cached like a PDF page render). */
async function imagePage(img: Media, userId: string | null): Promise<PageImage> {
  return withLock(img.id, async () => {
    const buf = await readMediaBuffer(img);
    if (!buf) throw new AppError("notFound", "file missing");
    let orientation: number | undefined;
    try {
      orientation = (await sharp(buf, { failOn: "none" }).metadata()).orientation;
    } catch {
      orientation = undefined; // e.g. HEIC without decoder → hand it on unchanged
    }
    if (!orientation || orientation === 1) return toPage(img.id, 0, img);
    const cached = (await cachedRenders(img.restaurantId!, img.id)).get(0);
    if (cached) return toPage(img.id, 0, cached);
    const upright = await sharp(buf, { failOn: "none" }).rotate().png().toBuffer();
    const m = await saveMedia({
      restaurantId: img.restaurantId,
      data: upright,
      mime: "image/png",
      userId,
      kind: "upload",
      alt: pageAlt(0),
      sourceMediaId: img.id,
    });
    return toPage(img.id, 0, m);
  });
}

/**
 * Page images (≤ maxPages in total, in document order) for the given source documents: PDFs are rendered
 * to PNG (~1600 px wide) once and cached as media rows (sourceMediaId = PDF), photos are returned upright.
 */
export async function getPageImages(
  restaurantId: string,
  mediaIds: string[],
  opts?: { maxPages?: number; userId?: string | null },
): Promise<PageImage[]> {
  const ids = [...new Set(mediaIds)];
  if (!ids.length) return [];
  const budgetStart = Math.max(1, Math.min(HARD_MAX_PAGES, Math.floor(opts?.maxPages ?? DEFAULT_MAX_PAGES)));
  const rows = await db
    .select()
    .from(media)
    .where(and(inArray(media.id, ids), eq(media.restaurantId, restaurantId)));
  if (rows.length !== ids.length) throw new AppError("notFound");
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: PageImage[] = [];
  let budget = budgetStart;
  for (const id of ids) {
    if (budget <= 0) break;
    const m = byId.get(id)!;
    if (!isSourceMime(m.mime)) throw new AppError("validation", "mime");
    const pages = m.mime === "application/pdf" ? await pdfPages(m, budget, opts?.userId ?? null) : [await imagePage(m, opts?.userId ?? null)];
    out.push(...pages);
    budget -= pages.length;
  }
  return out;
}

/** Reads a page image as an upright JPEG/PNG buffer, downscaled to ≤ maxEdge (for vision prompts). */
export async function readPageImage(
  restaurantId: string,
  page: PageImage,
  opts: { maxEdge?: number; format?: "jpeg" | "png" } = {},
): Promise<{ data: Buffer; mime: "image/jpeg" | "image/png"; width: number; height: number }> {
  const [m] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, page.mediaId), eq(media.restaurantId, restaurantId)))
    .limit(1);
  if (!m) throw new AppError("notFound");
  const buf = await readMediaBuffer(m);
  if (!buf) throw new AppError("notFound", "file missing");
  const edge = opts.maxEdge ?? 1600;
  let pipe = sharp(buf, { failOn: "none" }).rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
  pipe = opts.format === "png" ? pipe.png() : pipe.flatten({ background: "#ffffff" }).jpeg({ quality: 85 });
  const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
  return { data, mime: opts.format === "png" ? "image/png" : "image/jpeg", width: info.width, height: info.height };
}
