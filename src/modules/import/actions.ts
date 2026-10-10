"use server";
import { z } from "zod";
import { getLocale } from "next-intl/server";
import sharp from "sharp";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { action, AppError } from "@/core/http/action";
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES, saveMedia } from "@/core/storage/media";
import { planHas } from "@/modules/billing/plans";
import { applyImport, createImport, discardImport, MAX_IMPORT_FILES, runExtraction } from "./service";

const rid = z.uuid();

/** Import needs AI + edit rights and the `ai_import` plan feature. */
async function importContext(restaurantId: string) {
  await assertRestaurantPermission(restaurantId, "ai.use");
  const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
  if (!planHas(ctx.restaurant.plan, "ai_import")) throw new AppError("featureNotInPlan");
  return ctx;
}

const IMPORT_MIME = ALLOWED_UPLOAD_MIME.filter((m) => m !== "image/avif");

/** Uploads one page (photo or PDF) of the paper menu. One call per file keeps requests small. */
export const uploadImportFile = action(z.object({ restaurantId: rid, file: z.instanceof(Blob) }), async ({ restaurantId, file }) => {
  const ctx = await importContext(restaurantId);
  const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!IMPORT_MIME.includes(mime)) throw new AppError("validation", "mime");
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) throw new AppError("validation", "size");
  const data = Buffer.from(await file.arrayBuffer());
  if (mime === "application/pdf") {
    if (data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AppError("validation", "pdf");
  } else {
    try {
      const meta = await sharp(data, { failOn: "error" }).metadata();
      if (!meta.width || !meta.height) throw new Error("no dimensions");
    } catch {
      throw new AppError("validation", "image");
    }
  }
  const name = file instanceof File ? file.name : null;
  const m = await saveMedia({ restaurantId, data, mime, userId: ctx.user.id, alt: name?.slice(0, 200) ?? null });
  return { mediaId: m.id };
});

export const startImport = action(
  z.object({ restaurantId: rid, mediaIds: z.array(z.uuid()).min(1).max(MAX_IMPORT_FILES) }),
  async ({ restaurantId, mediaIds }) => {
    const ctx = await importContext(restaurantId);
    return { importId: await createImport(restaurantId, ctx.user.id, mediaIds) };
  },
);

/** Runs the AI extraction – may take 30–90 s. */
export const runImport = action(z.object({ restaurantId: rid, importId: z.uuid() }), async ({ restaurantId, importId }) => {
  const ctx = await importContext(restaurantId);
  const dto = await runExtraction(restaurantId, ctx.user.id, importId, await getLocale());
  return { status: dto.status, error: dto.error, itemCount: dto.itemCount };
});

export const discardMenuImport = action(z.object({ restaurantId: rid, importId: z.uuid() }), async ({ restaurantId, importId }) => {
  await importContext(restaurantId);
  await discardImport(restaurantId, importId);
  return null;
});

const price = z.number().int().min(0).max(100_000);
const code = z.string().max(40);
const draftMenus = z
  .array(
    z.object({
      key: z.string().max(40),
      name: z.string().trim().max(200),
      targetMenuId: z.uuid().nullable(),
      categories: z
        .array(
          z.object({
            key: z.string().max(40),
            name: z.string().trim().max(200),
            description: z.string().trim().max(1000).nullable().transform((v) => v || null),
            items: z
              .array(
                z.object({
                  key: z.string().max(40),
                  name: z.string().trim().min(1).max(200),
                  description: z.string().trim().max(1000).nullable().transform((v) => v || null),
                  priceCents: price.nullable(),
                  variants: z.array(z.object({ name: z.string().trim().min(1).max(80), priceCents: price })).max(20),
                  marks: z.array(z.string().max(10)).max(30),
                  allergenHints: z.array(code).max(20),
                  additiveHints: z.array(code).max(20),
                  tags: z.array(code).max(20),
                }),
              )
              .max(1000),
          }),
        )
        .max(200),
    }),
  )
  .min(1)
  .max(20);

export const applyMenuImport = action(
  z.object({ restaurantId: rid, importId: z.uuid(), menus: draftMenus }),
  async ({ restaurantId, importId, menus }) => {
    const ctx = await importContext(restaurantId);
    return applyImport({ restaurantId, userId: ctx.user.id, importId, menus });
  },
);
