"use server";
import { z } from "zod";
import { and, eq, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { glossary, restaurants } from "@/core/db/schema";
import { action, AppError } from "@/core/http/action";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import { getAiCredits } from "@/core/ai";
import { CONTENT_LOCALE_CODES } from "@/core/i18n/locales";
import {
  approveAllWithScore,
  approveTranslations,
  BATCH_SIZE,
  planJob,
  reviewExisting,
  saveHumanTranslation,
  translateBatch,
} from "./service";

const rid = z.string().uuid();
const locale = z.string().min(2).max(8);
const key = z.string().regex(/^(menu|category|item|variant):[0-9a-f-]{36}:(name|description)$/i);
const PERM = "translations.manage" as const;

/** Plans a translation job; the client then calls runTranslationBatch for each batch (progress UI, no job queue). */
export const planTranslationJob = action(
  z.object({
    restaurantId: rid,
    locales: z.array(locale).optional(),
    mode: z.enum(["missing", "stale", "missing_stale", "keys"]),
    keys: z.array(key).max(2000).optional(),
  }),
  async (input) => {
    await assertRestaurantPermission(input.restaurantId, PERM);
    const plan = await planJob(input.restaurantId, input);
    const credits = await getAiCredits(input.restaurantId);
    // Two AI calls per batch: translate + independent review.
    return { ...plan, creditsNeeded: plan.batches.length * 2, creditsRemaining: credits.remaining };
  },
);

export const runTranslationBatch = action(
  z.object({ restaurantId: rid, locale, keys: z.array(key).min(1).max(BATCH_SIZE), force: z.boolean().optional() }),
  async (input) => {
    const ctx = await assertRestaurantPermission(input.restaurantId, PERM);
    const res = await translateBatch(input.restaurantId, input.locale, input.keys, { userId: ctx.user.id, force: input.force });
    await audit({
      restaurantId: input.restaurantId,
      userId: ctx.user.id,
      action: "translations.ai_translate",
      data: { locale: input.locale, ...res, force: !!input.force },
    });
    return res;
  },
);

export const runReviewOnly = action(
  z.object({ restaurantId: rid, locale, keys: z.array(key).min(1).max(BATCH_SIZE) }),
  async (input) => {
    const ctx = await assertRestaurantPermission(input.restaurantId, PERM);
    return reviewExisting(input.restaurantId, input.locale, input.keys, { userId: ctx.user.id });
  },
);

export const saveTranslation = action(
  z.object({ restaurantId: rid, locale, key, value: z.string().trim().min(1).max(4000) }),
  async (input) => {
    const ctx = await assertRestaurantPermission(input.restaurantId, PERM);
    const row = await saveHumanTranslation(input.restaurantId, input.key, input.locale, input.value, ctx.user.id);
    await audit({
      restaurantId: input.restaurantId,
      userId: ctx.user.id,
      action: "translations.edit",
      entityType: row.entityType,
      entityId: row.entityId,
      data: { locale: input.locale, field: row.field, value: row.value },
    });
    return { id: row.id };
  },
);

export const approveTranslation = action(
  z.object({ restaurantId: rid, ids: z.array(z.string().uuid()).min(1).max(500) }),
  async (input) => {
    const ctx = await assertRestaurantPermission(input.restaurantId, PERM);
    const n = await approveTranslations(input.restaurantId, input.ids, ctx.user.id);
    await audit({ restaurantId: input.restaurantId, userId: ctx.user.id, action: "translations.approve", data: { count: n } });
    return { count: n };
  },
);

export const bulkApproveByScore = action(
  z.object({ restaurantId: rid, locale, minScore: z.number().min(1).max(5) }),
  async (input) => {
    const ctx = await assertRestaurantPermission(input.restaurantId, PERM);
    const n = await approveAllWithScore(input.restaurantId, input.locale, input.minScore, ctx.user.id);
    await audit({
      restaurantId: input.restaurantId,
      userId: ctx.user.id,
      action: "translations.bulk_approve",
      data: { locale: input.locale, minScore: input.minScore, count: n },
    });
    return { count: n };
  },
);

export const addGlossaryTerm = action(
  z
    .object({
      restaurantId: rid,
      term: z.string().trim().min(1).max(120),
      locale: z.string().max(8).nullable(),
      translation: z.string().trim().max(200).nullable(),
      doNotTranslate: z.boolean(),
    })
    .refine((v) => v.doNotTranslate || !!v.translation, { path: ["translation"] }),
  async (input) => {
    const ctx = await assertRestaurantPermission(input.restaurantId, PERM);
    if (input.locale && !CONTENT_LOCALE_CODES.includes(input.locale)) throw new AppError("validation");
    const [g] = await db
      .insert(glossary)
      .values({
        restaurantId: input.restaurantId,
        term: input.term,
        locale: input.locale || null,
        translation: input.doNotTranslate ? null : input.translation,
        doNotTranslate: input.doNotTranslate,
      })
      .returning();
    await audit({ restaurantId: input.restaurantId, userId: ctx.user.id, action: "translations.glossary.add", data: { term: g.term } });
    return { id: g.id };
  },
);

export const deleteGlossaryTerm = action(z.object({ restaurantId: rid, id: z.string().uuid() }), async (input) => {
  const ctx = await assertRestaurantPermission(input.restaurantId, PERM);
  await db.delete(glossary).where(and(eq(glossary.id, input.id), eq(glossary.restaurantId, input.restaurantId)));
  await audit({ restaurantId: input.restaurantId, userId: ctx.user.id, action: "translations.glossary.delete", entityId: input.id });
  return null;
});

/** Quality policy: auto-approve threshold + whether guests see unreviewed machine translations. */
export const updateTranslationSettings = action(
  z.object({
    restaurantId: rid,
    guestsSeeOnlyApproved: z.boolean(),
    autoApproveThreshold: z.number().min(3.5).max(5).nullable(),
  }),
  async (input) => {
    const ctx = await assertRestaurantPermission(input.restaurantId, PERM);
    const value = { guestsSeeOnlyApproved: input.guestsSeeOnlyApproved, autoApproveThreshold: input.autoApproveThreshold };
    // jsonb_set touches only settings.translations – other settings may be edited concurrently.
    await db
      .update(restaurants)
      .set({ settings: dsql`jsonb_set(coalesce(${restaurants.settings}, '{}'::jsonb), '{translations}', ${JSON.stringify(value)}::jsonb)`, updatedAt: new Date() })
      .where(eq(restaurants.id, input.restaurantId));
    await audit({ restaurantId: input.restaurantId, userId: ctx.user.id, action: "translations.settings", data: value });
    return null;
  },
);
