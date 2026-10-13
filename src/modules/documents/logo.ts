import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { and, eq, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { restaurants } from "@/core/db/schema";
import { aiJson, type ContentPart } from "@/core/ai";
import { audit } from "@/core/audit";
import { saveMedia } from "@/core/storage/media";
import { getPageImages, readPageImage } from "./pages";
import { getSourceDocuments } from "./sources";

/** Logo / wordmark extraction from the restaurant's menu pages (vision bounding box → crop → trim). */

const LOGO_PAGES = 3;
const MIN_CONFIDENCE = 0.5;
/** Crops whose long edge is below this get upscaled (max ×3) so they stay sharp in headers and print. */
const MIN_LOGO_EDGE = 600;

function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]));
  return v;
}

/** Lenient number (some models quote numbers) – ranges are checked in code, not by a schema repair round trip. */
const num = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), z.number());

export const logoSchema = z.preprocess(
  stripNulls,
  z.object({
    found: z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean()),
    /** 1-based number of the image that contains the logo. */
    image: num.optional(),
    /** [ymin, xmin, ymax, xmax] normalised to 0–1000. */
    box: z.array(num).optional(),
    /** 0–1 (a 0–100 answer is rescaled). */
    confidence: num.optional(),
    /** true = the logo is only the restaurant name set in a distinctive typeface (no emblem). */
    wordmark: z.boolean().optional(),
    name: z.string().optional(),
  }),
);
export type LogoDetection = z.infer<typeof logoSchema>;

const SYSTEM_PROMPT = `You find the logo of a restaurant on scans of its printed menu.
The logo is the restaurant's brand mark: an emblem/icon together with the restaurant name when they form one lockup, or – if there is no emblem – the restaurant name set as a distinctive wordmark (usually large, at the top of the first page or on the cover).
NOT a logo: dish photos, decorative ornaments or dividers alone, category headings, QR codes, payment/partner/brewery/supplier logos (e.g. a beer brand), allergen icons.
Include a tagline such as "seit 1952" only when it is clearly part of the lockup. Prefer the largest, cleanest occurrence.
Return JSON: {"found":true,"image":1,"box":[ymin,xmin,ymax,xmax],"confidence":0.0-1.0,"wordmark":false,"name":"…"}
- image: number of the image (1-based) containing the logo.
- box: tight bounding box around the whole logo, coordinates normalised to 0–1000 relative to that image (y first).
- confidence: how sure you are that this is the restaurant's own logo.
- wordmark: true if the logo is only text (the name), false if it contains a graphic emblem.
If no logo is visible: {"found":false,"confidence":0}.`;

/** Normalises a model box to pixel coordinates (accepts 0–1000 and 0–1 scales), with padding. null = implausible. */
export function boxToRegion(box: number[], width: number, height: number, padRatio = 0.04) {
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) return null;
  const scale = box.every((n) => n >= 0 && n <= 1) ? 1 : 1000;
  let [y0, x0, y1, x1] = box.map((n) => Math.min(1, Math.max(0, n / scale)));
  if (y1 < y0) [y0, y1] = [y1, y0];
  if (x1 < x0) [x0, x1] = [x1, x0];
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw < 0.02 || bh < 0.01) return null; // too small to be a logo
  if (bw * bh > 0.6) return null; // (almost) the whole page – not a logo
  const pad = Math.max(bw, bh) * padRatio;
  const left = Math.max(0, Math.floor((x0 - pad) * width));
  const top = Math.max(0, Math.floor((y0 - pad) * height));
  const right = Math.min(width, Math.ceil((x1 + pad) * width));
  const bottom = Math.min(height, Math.ceil((y1 + pad) * height));
  if (right - left < 8 || bottom - top < 8) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/** Crops the region, trims the uniform background around it and upscales tiny results. */
export async function cropLogo(page: Buffer, region: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  const cropped = await sharp(page, { failOn: "none" }).rotate().extract(region).png().toBuffer();
  let trimmed = cropped;
  try {
    const t = await sharp(cropped).trim({ threshold: 18 }).png().toBuffer({ resolveWithObject: true });
    // Keep the trim only if it did not eat the logo (e.g. a logo on a full-bleed coloured box).
    if (t.info.width >= region.width * 0.2 && t.info.height >= region.height * 0.2) trimmed = t.data;
  } catch {
    trimmed = cropped; // uniform image → nothing to trim
  }
  const meta = await sharp(trimmed).metadata();
  const w = meta.width ?? region.width;
  const h = meta.height ?? region.height;
  // Small breathing space around the mark, in the background colour of the crop's corner.
  // (stats() looks at the input image, not the pipeline → extract the corner into its own buffer first)
  const corner = await sharp(cropped).removeAlpha().extract({ left: 0, top: 0, width: Math.min(4, region.width), height: Math.min(4, region.height) }).toBuffer();
  const { channels } = await sharp(corner).stats();
  const [r, g, b] = [0, 1, 2].map((c) => Math.round(channels[Math.min(c, channels.length - 1)].mean));
  const margin = Math.round(Math.max(w, h) * 0.04);
  let pipe = sharp(trimmed).extend({ top: margin, bottom: margin, left: margin, right: margin, background: { r, g, b, alpha: 1 } });
  const long = Math.max(w, h) + margin * 2;
  if (long < MIN_LOGO_EDGE) {
    const factor = Math.min(3, MIN_LOGO_EDGE / long);
    pipe = sharp(await pipe.png().toBuffer()).resize({ width: Math.round((w + margin * 2) * factor), kernel: "lanczos3" });
  }
  return pipe.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Finds the restaurant logo on the first pages (vision model bounding box), crops + trims it, stores it as media
 * and – when `apply` and no logo is set yet – writes settings.logoMediaId. Returns null if no logo is found.
 * `mediaIds` empty → the stored source documents are used.
 */
export async function extractLogo(opts: {
  restaurantId: string;
  userId: string;
  mediaIds: string[];
  apply?: boolean;
}): Promise<{ mediaId: string; applied: boolean; confidence: number } | null> {
  const { restaurantId, userId } = opts;
  const ids = opts.mediaIds.length ? opts.mediaIds : await getSourceDocuments(restaurantId);
  if (!ids.length) return null;
  const pages = await getPageImages(restaurantId, ids, { maxPages: LOGO_PAGES, userId });
  if (!pages.length) return null;

  const images = await Promise.all(pages.map((p) => readPageImage(restaurantId, p, { maxEdge: 1600 })));
  const parts: ContentPart[] = [{ type: "text", text: `Find the restaurant's logo in these ${images.length} menu page image(s).` }];
  images.forEach((img, i) => {
    parts.push({ type: "text", text: `Image ${i + 1}:` });
    parts.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.data.toString("base64")}` } });
  });
  const { data } = await aiJson(
    "theme_analyze",
    { messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: parts }], maxTokens: 600, timeoutMs: 90_000 },
    logoSchema,
    { restaurantId, userId, billAs: "logo_extract" },
    "logo",
  );
  const raw = data.confidence ?? 0;
  const confidence = Math.min(1, Math.max(0, raw > 1 ? raw / 100 : raw));
  if (!data.found || !data.box || confidence < MIN_CONFIDENCE) return null;
  const idx = Math.min(pages.length, Math.max(1, Math.round(data.image ?? 1))) - 1;
  const page = pages[idx];

  // Crop from the full-resolution page (normalised coordinates are resolution independent).
  const full = await readPageImage(restaurantId, page, { maxEdge: 4000, format: "png" });
  const region = boxToRegion(data.box, full.width, full.height, 0.06);
  if (!region) return null;
  const png = await cropLogo(full.data, region);
  const m = await saveMedia({ restaurantId, data: png, mime: "image/png", userId, kind: "upload", alt: "Logo", sourceMediaId: page.sourceMediaId });

  let applied = false;
  if (opts.apply) {
    const rows = await db
      .update(restaurants)
      .set({ settings: dsql`${restaurants.settings} || jsonb_build_object('logoMediaId', ${m.id}::text)`, updatedAt: new Date() })
      .where(and(eq(restaurants.id, restaurantId), dsql`coalesce(${restaurants.settings}->>'logoMediaId', '') = ''`))
      .returning({ id: restaurants.id });
    applied = rows.length > 0;
    if (applied)
      await audit({
        restaurantId,
        userId,
        action: "settings.logo.auto",
        entityType: "media",
        entityId: m.id,
        data: { sourceMediaId: page.sourceMediaId, pageIndex: page.pageIndex, confidence, wordmark: data.wordmark ?? null },
      });
  }
  return { mediaId: m.id, applied, confidence };
}
