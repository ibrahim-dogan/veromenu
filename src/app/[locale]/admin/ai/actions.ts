"use server";
import { z } from "zod";
import { action } from "@/core/http/action";
import { ForbiddenError } from "@/core/http/errors";
import { getCurrentUser } from "@/core/auth/session";
import { audit } from "@/core/audit";
import { AI_TASKS, TASK_DEFAULTS } from "@/core/ai";
import {
  createProvider,
  deleteProvider,
  listModels,
  providerBalance,
  saveTaskSetting,
  testProvider,
  testTask,
  updateProvider,
} from "@/core/ai/admin";

async function admin() {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) throw new ForbiddenError();
  return user;
}

const providerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  adapter: z.string().min(1).max(40),
  baseUrl: z.string().trim().url().max(300),
  apiKey: z.string().trim().max(500).nullable().optional(),
  extraHeaders: z.record(z.string().max(100), z.string().max(500)).default({}),
  isEnabled: z.boolean(),
});

export const saveProvider = action(providerSchema.extend({ id: z.string().uuid().optional() }), async ({ id, ...input }) => {
  const user = await admin();
  const row = id ? await updateProvider(id, input) : await createProvider(input);
  await audit({
    userId: user.id,
    action: id ? "admin.ai.provider.update" : "admin.ai.provider.create",
    entityType: "ai_provider",
    entityId: row.id,
    data: { name: row.name, baseUrl: row.baseUrl, keyChanged: input.apiKey !== undefined && input.apiKey !== "" },
  });
  return { id: row.id };
});

export const removeProvider = action(z.object({ id: z.string().uuid() }), async ({ id }) => {
  const user = await admin();
  await deleteProvider(id);
  await audit({ userId: user.id, action: "admin.ai.provider.delete", entityType: "ai_provider", entityId: id });
  return null;
});

export const testProviderConnection = action(z.object({ id: z.string().uuid() }), async ({ id }) => {
  await admin();
  const [res, balance] = await Promise.all([testProvider(id), providerBalance(id)]);
  return { ...res, balance };
});

export const fetchModels = action(z.object({ providerId: z.string().uuid() }), async ({ providerId }) => {
  await admin();
  try {
    return { models: await listModels(providerId), error: null as string | null };
  } catch (e) {
    return { models: [], error: e instanceof Error ? e.message : String(e) };
  }
});

const task = z.enum(AI_TASKS);

export const saveTaskRoute = action(
  z.object({
    task,
    providerId: z.string().uuid(),
    model: z.string().trim().min(1).max(200),
    fallbackModel: z.string().trim().max(200).nullable(),
    temperature: z.number().min(0).max(2).nullable(),
    maxTokens: z.number().int().min(16).max(200_000).nullable(),
  }),
  async (input) => {
    const user = await admin();
    await saveTaskSetting(input);
    await audit({ userId: user.id, action: "admin.ai.task.update", entityType: "ai_task", entityId: input.task, data: input });
    return null;
  },
);

export const runTaskTest = action(z.object({ task }), async ({ task }) => {
  const user = await admin();
  if (TASK_DEFAULTS[task].capability === "image-output") return { skipped: true as const };
  try {
    return { skipped: false as const, ok: true as const, ...(await testTask(task, { restaurantId: null, userId: user.id })) };
  } catch (e) {
    const detail = e && typeof e === "object" && "detail" in e ? String((e as { detail?: string }).detail ?? "") : "";
    return { skipped: false as const, ok: false as const, error: detail || (e instanceof Error ? e.message : String(e)) };
  }
});
