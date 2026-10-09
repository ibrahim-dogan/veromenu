import "server-only";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { aiImage } from "@/core/ai";
import { AppError } from "@/core/http/errors";
import { audit } from "@/core/audit";
import { storage, mediaUrl } from "@/core/storage";
import { getMedia, mediaSrc, readMediaBuffer, saveMedia } from "@/core/storage/media";
import * as menu from "@/modules/menu/service";
import { IMAGE_STYLES, type ImageStyle, type ImageTarget } from "./image-types";

/**
 * AI dish / category images. Generation results are kept as temporary drafts in storage
 * (tmp/ai-images/<restaurant>/<token>) until the user accepts one → saved as media kind "ai_generated"
 * with prompt + model + reference (EU AI Act Art. 50 transparency; the guest view labels these images).
 */

const STYLE_PROMPTS: Record<ImageStyle, string> = {
  bright: "bright and natural: soft daylight from a window, light neutral background, fresh and inviting colours",
  rustic: "rustic: served on a weathered wooden table, warm natural light, cosy restaurant atmosphere, subtle props like a linen napkin",
  dark: "dark and elegant: dark slate or black background, dramatic soft side light, fine-dining plating, moody but appetizing",
  minimal: "minimal: clean white background, soft even studio light, lots of negative space, modern and tidy",
};

export function buildImagePrompt(opts: { subject: string; style: ImageStyle; hasReference: boolean; targetType: "item" | "category" }) {
  const subject = opts.subject.trim().slice(0, 600);
  return [
    "Professional food photography for a restaurant's digital menu.",
    opts.targetType === "item"
      ? `Dish (description in German): "${subject}".`
      : `Header image for the menu section (in German): "${subject}". Show an appetizing, typical selection for this section.`,
    `Style: ${STYLE_PROMPTS[opts.style]}.`,
    "Photorealistic and appetizing, a realistic portion and plating as served in a real restaurant, sharp focus on the food, shallow depth of field, natural true-to-life colours, landscape 4:3 composition with the food centred.",
    "Strictly no text, no letters, no labels, no watermark, no logo, no menu cards, no people, no hands.",
    opts.hasReference
      ? "The attached photo is a reference showing the real dish: keep the same dish, ingredients, components, portion size and plate/glass; improve light, composition and background to match the style. Do not add ingredients that are not visible in the reference."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function loadImageTarget(restaurantId: string, target: ImageTarget) {
  if (target.type === "item") {
    const it = await menu.getItem(restaurantId, target.id);
    return { name: it.name, description: it.description, imageMediaId: it.imageMediaId };
  }
  const c = await menu.getCategory(restaurantId, target.id);
  return { name: c.name, description: c.description, imageMediaId: c.imageMediaId };
}

export function defaultSubject(t: { name: string; description: string | null }) {
  return t.description ? `${t.name} – ${t.description}` : t.name;
}

export async function currentImage(restaurantId: string, mediaId: string | null) {
  const m = await getMedia(mediaId);
  if (!m || m.restaurantId !== restaurantId || !m.mime.startsWith("image/")) return null;
  return { id: m.id, thumb: mediaSrc(m, "sm")!, kind: m.kind };
}

// ------------------------------------------------------------------ drafts

const TOKEN = /^[A-Za-z0-9_-]{21}$/;
const draftKey = (restaurantId: string, token: string, ext: "jpg" | "json") => {
  if (!TOKEN.test(token)) throw new AppError("validation", "token");
  return `tmp/ai-images/${restaurantId}/${token}.${ext}`;
};

type DraftMeta = { prompt: string; model: string; sourceMediaId: string | null; target: ImageTarget; createdAt: string };

export async function generateImageDraft(opts: {
  restaurantId: string;
  userId: string;
  target: ImageTarget;
  subject: string;
  style: ImageStyle;
  referenceMediaId: string | null;
}) {
  if (!IMAGE_STYLES.includes(opts.style)) throw new AppError("validation", "style");
  await loadImageTarget(opts.restaurantId, opts.target); // ownership check
  let reference: { data: Buffer; mime: string } | null = null;
  if (opts.referenceMediaId) {
    const m = await getMedia(opts.referenceMediaId);
    if (!m || m.restaurantId !== opts.restaurantId || !m.mime.startsWith("image/")) throw new AppError("notFound");
    const buf = await readMediaBuffer(m);
    if (!buf) throw new AppError("notFound");
    const data = await sharp(buf, { failOn: "none" }).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    reference = { data, mime: "image/jpeg" };
  }
  const prompt = buildImagePrompt({ subject: opts.subject, style: opts.style, hasReference: !!reference, targetType: opts.target.type });
  const res = await aiImage({ prompt, referenceImages: reference ? [reference] : undefined }, { restaurantId: opts.restaurantId, userId: opts.userId });
  const img = res.images[0];
  if (!img) throw new AppError("aiFailed", "no image");
  const jpeg = await sharp(img.data, { failOn: "none" }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();

  const token = nanoid(21);
  const meta: DraftMeta = { prompt, model: res.model, sourceMediaId: opts.referenceMediaId, target: opts.target, createdAt: new Date().toISOString() };
  await storage().put(draftKey(opts.restaurantId, token, "jpg"), jpeg, "image/jpeg");
  await storage().put(draftKey(opts.restaurantId, token, "json"), Buffer.from(JSON.stringify(meta)), "application/json");
  return { token, previewUrl: mediaUrl(draftKey(opts.restaurantId, token, "jpg"))!, model: res.model };
}

export async function discardImageDraft(restaurantId: string, token: string) {
  await Promise.all([storage().delete(draftKey(restaurantId, token, "jpg")), storage().delete(draftKey(restaurantId, token, "json"))]);
}

export async function acceptImageDraft(opts: { restaurantId: string; userId: string; target: ImageTarget; token: string }) {
  const { restaurantId, target, token } = opts;
  const [data, metaBuf] = await Promise.all([storage().get(draftKey(restaurantId, token, "jpg")), storage().get(draftKey(restaurantId, token, "json"))]);
  if (!data || !metaBuf) throw new AppError("notFound");
  const meta = JSON.parse(metaBuf.toString("utf8")) as DraftMeta;
  if (meta.target.type !== target.type || meta.target.id !== target.id) throw new AppError("validation", "target");
  const t = await loadImageTarget(restaurantId, target);

  const m = await saveMedia({
    restaurantId,
    data,
    mime: "image/jpeg",
    userId: opts.userId,
    kind: "ai_generated",
    alt: t.name,
    aiPrompt: meta.prompt,
    aiModel: meta.model,
    sourceMediaId: meta.sourceMediaId,
  });
  if (target.type === "item") await menu.updateItem(restaurantId, target.id, { imageMediaId: m.id });
  else await menu.updateCategory(restaurantId, target.id, { imageMediaId: m.id });
  await audit({
    restaurantId,
    userId: opts.userId,
    action: "ai.image.apply",
    entityType: target.type,
    entityId: target.id,
    data: { mediaId: m.id, model: meta.model, reference: meta.sourceMediaId },
  });
  await discardImageDraft(restaurantId, token).catch(() => undefined);
  return { mediaId: m.id };
}
