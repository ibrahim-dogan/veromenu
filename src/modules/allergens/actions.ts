"use server";
import { z } from "zod";
import { assertRestaurantPermission, ForbiddenError, getRestaurantContext } from "@/core/auth/guards";
import { action } from "@/core/http/action";
import { confirmItem, detectAllergens, getAllergenState, ITEMS_PER_CALL } from "./service";

const rid = z.string().uuid();
const id = z.string().uuid();

/** Detection may be run by menu editors and reviewers; only reviewers may confirm. */
async function assertCanDetect(restaurantId: string) {
  const ctx = await getRestaurantContext(restaurantId);
  if (!ctx || !(ctx.can("allergens.review") || ctx.can("menu.edit"))) throw new ForbiddenError();
  return ctx;
}

export const loadAllergenState = action(z.object({ restaurantId: rid, itemId: id }), async (input) => {
  const ctx = await assertCanDetect(input.restaurantId);
  const state = await getAllergenState(input.restaurantId, input.itemId);
  return { ...state, canConfirm: ctx.can("allergens.review") };
});

export const detectItemAllergens = action(z.object({ restaurantId: rid, itemId: id }), async (input) => {
  const ctx = await assertCanDetect(input.restaurantId);
  await detectAllergens(input.restaurantId, [input.itemId], ctx.user.id);
  const state = await getAllergenState(input.restaurantId, input.itemId);
  return { ...state, canConfirm: ctx.can("allergens.review") };
});

/** Bulk: the client loops over chunks of ITEMS_PER_CALL ids (progress UI, no job queue). */
export const detectAllergensChunk = action(
  z.object({ restaurantId: rid, itemIds: z.array(id).min(1).max(ITEMS_PER_CALL) }),
  async (input) => {
    const ctx = await assertRestaurantPermission(input.restaurantId, "allergens.review");
    const res = await detectAllergens(input.restaurantId, input.itemIds, ctx.user.id);
    const values = Object.values(res);
    return { done: values.length, needsReview: values.filter((s) => s.status === "needs_review").length };
  },
);

export const confirmItemAllergens = action(
  z.object({ restaurantId: rid, itemId: id, allergens: z.array(z.string()).max(14), additives: z.array(z.string()).max(20) }),
  async (input) => {
    const ctx = await assertRestaurantPermission(input.restaurantId, "allergens.review");
    await confirmItem(input.restaurantId, input.itemId, input, ctx.user.id);
    return null;
  },
);
