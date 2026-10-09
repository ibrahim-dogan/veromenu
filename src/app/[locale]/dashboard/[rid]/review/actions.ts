"use server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { reviewTasks, translations } from "@/core/db/schema";
import { action, AppError } from "@/core/http/action";
import { ForbiddenError, getRestaurantContext, type RestaurantContext } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import { approveTranslations, saveHumanTranslation } from "@/modules/translations/service";
import { unitKey } from "@/modules/translations/source";

const ids = z.object({ restaurantId: z.string().uuid(), taskId: z.string().uuid() });

async function loadTask(restaurantId: string, taskId: string) {
  const [task] = await db
    .select()
    .from(reviewTasks)
    .where(and(eq(reviewTasks.id, taskId), eq(reviewTasks.restaurantId, restaurantId)))
    .limit(1);
  if (!task) throw new AppError("notFound");
  return task;
}

function canHandle(ctx: RestaurantContext, kind: string) {
  if (kind === "allergen") return ctx.can("allergens.review");
  if (kind === "translation") return ctx.can("translations.manage") || ctx.can("allergens.review");
  return ctx.can("allergens.review") || ctx.can("menu.edit");
}

async function guard(restaurantId: string, taskId: string) {
  const ctx = await getRestaurantContext(restaurantId);
  if (!ctx) throw new ForbiddenError();
  const task = await loadTask(restaurantId, taskId);
  if (!canHandle(ctx, task.kind)) throw new ForbiddenError();
  return { ctx, task };
}

async function close(taskId: string, status: "resolved" | "dismissed", userId: string) {
  await db.update(reviewTasks).set({ status, resolvedBy: userId, resolvedAt: new Date() }).where(eq(reviewTasks.id, taskId));
}

export const dismissReviewTask = action(ids, async (input) => {
  const { ctx, task } = await guard(input.restaurantId, input.taskId);
  await close(task.id, "dismissed", ctx.user.id);
  await audit({ restaurantId: input.restaurantId, userId: ctx.user.id, action: "review.dismiss", entityType: task.kind, entityId: task.id });
  return null;
});

export const resolveReviewTask = action(ids, async (input) => {
  const { ctx, task } = await guard(input.restaurantId, input.taskId);
  await close(task.id, "resolved", ctx.user.id);
  await audit({ restaurantId: input.restaurantId, userId: ctx.user.id, action: "review.resolve", entityType: task.kind, entityId: task.id });
  return null;
});

/** Translation task: accept as-is (approve) or with an edited text (human translation). */
export const acceptTranslationTask = action(ids.extend({ value: z.string().trim().min(1).max(4000) }), async (input) => {
  const { ctx, task } = await guard(input.restaurantId, input.taskId);
  if (task.kind !== "translation" || !ctx.can("translations.manage")) throw new ForbiddenError();
  const translationId = String(task.payload.translationId ?? "");
  const [row] = translationId
    ? await db
        .select()
        .from(translations)
        .where(and(eq(translations.id, translationId), eq(translations.restaurantId, input.restaurantId)))
        .limit(1)
    : [];
  if (!row) {
    await close(task.id, "dismissed", ctx.user.id);
    throw new AppError("notFound");
  }
  if (row.value.trim() === input.value) {
    await approveTranslations(input.restaurantId, [row.id], ctx.user.id);
  } else {
    await saveHumanTranslation(input.restaurantId, unitKey(row.entityType, row.entityId, row.field), row.locale, input.value, ctx.user.id);
  }
  await close(task.id, "resolved", ctx.user.id);
  await audit({
    restaurantId: input.restaurantId,
    userId: ctx.user.id,
    action: "translations.review_accept",
    entityType: row.entityType,
    entityId: row.entityId,
    data: { locale: row.locale, field: row.field, edited: row.value.trim() !== input.value },
  });
  return null;
});
