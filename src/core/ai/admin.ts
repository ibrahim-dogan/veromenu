import "server-only";
import { and, desc, eq, gte, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { aiProviders, aiTaskSettings, aiUsage, restaurants } from "@/core/db/schema";
import { decryptSecret, encryptSecret, maskSecret } from "@/core/crypto";
import { AppError } from "@/core/http/errors";
import { ADAPTERS } from "./adapters";
import { aiChat, invalidateAiConfigCache, type AiContext } from "./index";
import { fetchProviderModels, invalidateModelCache, type ModelInfo } from "./models";
import { AI_TASKS, TASK_DEFAULTS, type AiTask } from "./tasks";
import type { ProviderConfig } from "./types";

/** Platform-admin service for Admin → AI. API keys never leave the server unmasked. */

type ProviderRow = typeof aiProviders.$inferSelect;

function safeDecrypt(enc: string | null) {
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}

export function providerConfig(row: ProviderRow): ProviderConfig {
  return { id: row.id, name: row.name, adapter: row.adapter, baseUrl: row.baseUrl, apiKey: safeDecrypt(row.apiKeyEnc), extraHeaders: row.extraHeaders };
}

export type ProviderView = {
  id: string;
  name: string;
  adapter: string;
  baseUrl: string;
  keyMasked: string;
  keyBroken: boolean;
  extraHeaders: Record<string, string>;
  isEnabled: boolean;
  taskCount: number;
};

export async function listProviders(): Promise<ProviderView[]> {
  const rows = await db.select().from(aiProviders).orderBy(aiProviders.createdAt);
  const counts = await db.select({ id: aiTaskSettings.providerId, n: dsql<number>`count(*)::int` }).from(aiTaskSettings).groupBy(aiTaskSettings.providerId);
  return rows.map((r) => {
    const key = safeDecrypt(r.apiKeyEnc);
    return {
      id: r.id,
      name: r.name,
      adapter: r.adapter,
      baseUrl: r.baseUrl,
      keyMasked: maskSecret(key),
      keyBroken: !!r.apiKeyEnc && key === null,
      extraHeaders: r.extraHeaders,
      isEnabled: r.isEnabled,
      taskCount: counts.find((c) => c.id === r.id)?.n ?? 0,
    };
  });
}

export type ProviderInput = {
  name: string;
  adapter: string;
  baseUrl: string;
  /** undefined/empty = keep existing key; null = remove key */
  apiKey?: string | null;
  extraHeaders: Record<string, string>;
  isEnabled: boolean;
};

function validate(input: ProviderInput) {
  if (!ADAPTERS[input.adapter]) throw new AppError("validation", "unknown adapter");
  try {
    const u = new URL(input.baseUrl);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    throw new AppError("validation", "baseUrl");
  }
}

export async function createProvider(input: ProviderInput) {
  validate(input);
  const [row] = await db
    .insert(aiProviders)
    .values({
      name: input.name,
      adapter: input.adapter,
      baseUrl: input.baseUrl.replace(/\/$/, ""),
      apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : null,
      extraHeaders: input.extraHeaders,
      isEnabled: input.isEnabled,
    })
    .returning();
  afterChange();
  return row;
}

export async function updateProvider(id: string, input: ProviderInput) {
  validate(input);
  const patch: Partial<typeof aiProviders.$inferInsert> = {
    name: input.name,
    adapter: input.adapter,
    baseUrl: input.baseUrl.replace(/\/$/, ""),
    extraHeaders: input.extraHeaders,
    isEnabled: input.isEnabled,
  };
  if (input.apiKey === null) patch.apiKeyEnc = null;
  else if (input.apiKey) patch.apiKeyEnc = encryptSecret(input.apiKey);
  const [row] = await db.update(aiProviders).set(patch).where(eq(aiProviders.id, id)).returning();
  if (!row) throw new AppError("notFound");
  afterChange();
  return row;
}

export async function deleteProvider(id: string) {
  await db.delete(aiProviders).where(eq(aiProviders.id, id));
  afterChange();
}

function afterChange() {
  invalidateAiConfigCache();
  invalidateModelCache();
}

async function getProviderRow(id: string) {
  const [row] = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

export async function testProvider(id: string): Promise<{ ok: true; models: number; ms: number } | { ok: false; error: string }> {
  const row = await getProviderRow(id);
  const started = Date.now();
  try {
    const models = await fetchProviderModels(providerConfig(row), { fresh: true });
    return { ok: true, models: models.length, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listModels(providerId: string): Promise<ModelInfo[]> {
  return fetchProviderModels(providerConfig(await getProviderRow(providerId)));
}

/** OpenRouter only: remaining credit of the key (helps the owner keep an eye on the budget). */
export async function providerBalance(id: string): Promise<{ limit: number | null; remaining: number | null; usage: number | null } | null> {
  const row = await getProviderRow(id);
  if (row.adapter !== "openrouter") return null;
  const p = providerConfig(row);
  try {
    const res = await fetch(`${p.baseUrl}/key`, { headers: { authorization: `Bearer ${p.apiKey}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data?: { limit?: number | null; limit_remaining?: number | null; usage?: number | null } };
    return { limit: data?.limit ?? null, remaining: data?.limit_remaining ?? null, usage: data?.usage ?? null };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ task routing

export type TaskSettingView = {
  task: AiTask;
  providerId: string | null;
  model: string;
  fallbackModel: string | null;
  temperature: number | null;
  maxTokens: number | null;
  capability: string;
  isDefault: boolean;
};

export async function listTaskSettings(): Promise<TaskSettingView[]> {
  const rows = await db.select().from(aiTaskSettings);
  return AI_TASKS.map((task) => {
    const r = rows.find((x) => x.task === task);
    const d = TASK_DEFAULTS[task];
    return {
      task,
      providerId: r?.providerId ?? null,
      model: r?.model ?? d.model,
      fallbackModel: r ? r.fallbackModel : (d.fallbackModel ?? null),
      temperature: r ? (r.params.temperature ?? null) : (d.temperature ?? null),
      maxTokens: r?.params.maxTokens ?? null,
      capability: d.capability,
      isDefault: !r,
    };
  });
}

export async function saveTaskSetting(input: {
  task: AiTask;
  providerId: string;
  model: string;
  fallbackModel: string | null;
  temperature: number | null;
  maxTokens: number | null;
}) {
  await getProviderRow(input.providerId);
  const params: { temperature?: number; maxTokens?: number } = {};
  if (input.temperature != null) params.temperature = input.temperature;
  if (input.maxTokens != null) params.maxTokens = input.maxTokens;
  const values = {
    task: input.task,
    providerId: input.providerId,
    model: input.model,
    fallbackModel: input.fallbackModel || null,
    params,
    updatedAt: new Date(),
  };
  await db.insert(aiTaskSettings).values(values).onConflictDoUpdate({ target: aiTaskSettings.task, set: values });
  invalidateAiConfigCache();
}

/** Sends a tiny prompt through the configured route (incl. fallback). Image tasks are not executed (cost). */
export async function testTask(task: AiTask, ctx: AiContext) {
  const started = Date.now();
  const res = await aiChat(
    task,
    { messages: [{ role: "user", content: 'Reply with exactly the word "OK".' }], maxTokens: 20, temperature: 0 },
    ctx,
  );
  return { text: res.text.trim().slice(0, 120), model: res.model, ms: Date.now() - started, costUsd: res.usage.costUsd };
}

// ------------------------------------------------------------------ usage

export async function usageStats(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const where = gte(aiUsage.createdAt, since);
  const agg = {
    calls: dsql<number>`count(*)::int`,
    errors: dsql<number>`count(*) filter (where not ${aiUsage.ok})::int`,
    cost: dsql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float8`,
    tokensIn: dsql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
    tokensOut: dsql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
    avgMs: dsql<number>`coalesce(avg(${aiUsage.durationMs}) filter (where ${aiUsage.ok}), 0)::int`,
  };
  const [totals, byTask, byModel, byRestaurant, recentErrors, daily] = await Promise.all([
    db.select(agg).from(aiUsage).where(where),
    db.select({ key: aiUsage.task, ...agg }).from(aiUsage).where(where).groupBy(aiUsage.task).orderBy(desc(agg.cost)),
    db
      .select({ key: aiUsage.model, provider: aiUsage.providerName, ...agg })
      .from(aiUsage)
      .where(where)
      .groupBy(aiUsage.model, aiUsage.providerName)
      .orderBy(desc(agg.cost)),
    db
      .select({ key: dsql<string>`coalesce(${restaurants.name}, '—')`, restaurantId: aiUsage.restaurantId, ...agg })
      .from(aiUsage)
      .leftJoin(restaurants, eq(restaurants.id, aiUsage.restaurantId))
      .where(where)
      .groupBy(aiUsage.restaurantId, restaurants.name)
      .orderBy(desc(agg.cost))
      .limit(25),
    db
      .select({
        id: aiUsage.id,
        createdAt: aiUsage.createdAt,
        task: aiUsage.task,
        model: aiUsage.model,
        provider: aiUsage.providerName,
        error: aiUsage.error,
        restaurant: restaurants.name,
      })
      .from(aiUsage)
      .leftJoin(restaurants, eq(restaurants.id, aiUsage.restaurantId))
      .where(and(where, eq(aiUsage.ok, false)))
      .orderBy(desc(aiUsage.createdAt))
      .limit(20),
    db
      .select({ day: dsql<string>`to_char(date_trunc('day', ${aiUsage.createdAt}), 'YYYY-MM-DD')`, cost: agg.cost, calls: agg.calls })
      .from(aiUsage)
      .where(where)
      .groupBy(dsql`date_trunc('day', ${aiUsage.createdAt})`)
      .orderBy(dsql`date_trunc('day', ${aiUsage.createdAt})`),
  ]);
  return { totals: totals[0], byTask, byModel, byRestaurant, recentErrors, daily };
}
