"use server";
import { z } from "zod";
import { getLocale } from "next-intl/server";
import { aiTranscribe } from "@/core/ai";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { action, AppError } from "@/core/http/action";
import { planHas } from "@/modules/billing/plans";
import { applyChangeset, discardChangeset, planChangeset, undoChangeset } from "./service";

const rid = z.uuid();

async function agentContext(restaurantId: string, perm: "ai.use" | "menu.edit") {
  const ctx = await assertRestaurantPermission(restaurantId, perm);
  if (!planHas(ctx.restaurant.plan, "ai_agent")) throw new AppError("featureNotInPlan");
  return ctx;
}

/** ~60 s of 16 kHz mono 16-bit WAV ≈ 1.9 MB → ≈ 2.6 MB base64. */
const MAX_WAV_BASE64 = 3_400_000;

export const transcribeVoice = action(
  z.object({ restaurantId: rid, wavBase64: z.string().min(100).max(MAX_WAV_BASE64), uiLocale: z.string().max(5).optional() }),
  async ({ restaurantId, wavBase64, uiLocale }) => {
    const ctx = await agentContext(restaurantId, "ai.use");
    const hint = [...new Set([ctx.restaurant.defaultLocale, uiLocale ?? "de", "de", "en", "tr"])].join(", ");
    const text = await aiTranscribe(wavBase64, { restaurantId, userId: ctx.user.id }, hint);
    return { text: text.slice(0, 4000) };
  },
);

export const planChanges = action(
  z.object({ restaurantId: rid, input: z.string().trim().min(2).max(4000), inputKind: z.enum(["text", "voice"]).default("text") }),
  async ({ restaurantId, input, inputKind }) => {
    const ctx = await agentContext(restaurantId, "ai.use");
    return planChangeset({ restaurantId, userId: ctx.user.id, input, inputKind, replyLocale: await getLocale() });
  },
);

export const applyChanges = action(
  z.object({ restaurantId: rid, changesetId: z.uuid(), keys: z.array(z.string().max(20)).min(1).max(2000), confirmDestructive: z.boolean() }),
  async ({ restaurantId, changesetId, keys, confirmDestructive }) => {
    const ctx = await agentContext(restaurantId, "menu.edit");
    return applyChangeset({ restaurantId, userId: ctx.user.id, changesetId, keys, confirmDestructive });
  },
);

export const undoChanges = action(z.object({ restaurantId: rid, changesetId: z.uuid() }), async ({ restaurantId, changesetId }) => {
  const ctx = await agentContext(restaurantId, "menu.edit");
  return undoChangeset({ restaurantId, userId: ctx.user.id, changesetId });
});

export const discardChanges = action(z.object({ restaurantId: rid, changesetId: z.uuid() }), async ({ restaurantId, changesetId }) => {
  await agentContext(restaurantId, "ai.use");
  await discardChangeset(restaurantId, changesetId);
  return null;
});
