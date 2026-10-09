"use server";
import { z } from "zod";
import { assertRestaurantPermission, getRestaurantContext } from "@/core/auth/guards";
import { action, AppError } from "@/core/http/action";
import { planHas } from "@/modules/billing/plans";
import { acceptImageDraft, currentImage, defaultSubject, discardImageDraft, generateImageDraft, loadImageTarget } from "./image-service";
import { IMAGE_STYLES, type AiImageContext } from "./image-types";

const rid = z.uuid();
const target = z.object({ type: z.enum(["item", "category"]), id: z.uuid() });
const token = z.string().regex(/^[A-Za-z0-9_-]{21}$/);

/** AI images need ai.use + media.manage and the `ai_images` plan feature. */
async function imageContext(restaurantId: string) {
  await assertRestaurantPermission(restaurantId, "ai.use");
  const ctx = await assertRestaurantPermission(restaurantId, "media.manage");
  if (!planHas(ctx.restaurant.plan, "ai_images")) throw new AppError("featureNotInPlan");
  return ctx;
}

/** Dialog bootstrap: returns a state instead of throwing so the dialog can explain what's missing. */
export const getAiImageContext = action(z.object({ restaurantId: rid, target }), async ({ restaurantId, target }): Promise<AiImageContext> => {
  const ctx = await getRestaurantContext(restaurantId);
  if (!ctx || !ctx.can("ai.use") || !ctx.can("media.manage")) return { state: "permission" };
  if (!planHas(ctx.restaurant.plan, "ai_images")) return { state: "plan" };
  const t = await loadImageTarget(restaurantId, target);
  return { state: "ok", subject: defaultSubject(t), name: t.name, current: await currentImage(restaurantId, t.imageMediaId) };
});

export const generateAiImage = action(
  z.object({
    restaurantId: rid,
    target,
    subject: z.string().trim().min(2).max(600),
    style: z.enum(IMAGE_STYLES),
    referenceMediaId: z.uuid().nullable(),
    discardToken: token.nullable().optional(),
  }),
  async ({ restaurantId, target, subject, style, referenceMediaId, discardToken }) => {
    const ctx = await imageContext(restaurantId);
    if (discardToken) await discardImageDraft(restaurantId, discardToken).catch(() => undefined);
    return generateImageDraft({ restaurantId, userId: ctx.user.id, target, subject, style, referenceMediaId });
  },
);

export const acceptAiImage = action(z.object({ restaurantId: rid, target, token }), async ({ restaurantId, target, token }) => {
  const ctx = await imageContext(restaurantId);
  return acceptImageDraft({ restaurantId, userId: ctx.user.id, target, token });
});

export const discardAiImage = action(z.object({ restaurantId: rid, token }), async ({ restaurantId, token }) => {
  await imageContext(restaurantId);
  await discardImageDraft(restaurantId, token);
  return null;
});
