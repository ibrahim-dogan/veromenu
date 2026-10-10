import "server-only";
import { z } from "zod";
import { and, eq, gte, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { aiProviders, aiTaskSettings, aiUsage, restaurants } from "@/core/db/schema";
import { decryptSecret } from "@/core/crypto";
import { env } from "@/core/env";
import { AppError } from "@/core/http/errors";
import { AI_CREDIT_COST, getPlan } from "@/modules/billing/plans";
import { getAdapter } from "./adapters";
import { TASK_DEFAULTS, type AiTask } from "./tasks";
import { AiError, type ChatRequest, type ChatResult, type ImageRequest, type ImageResult, type ProviderConfig } from "./types";

export * from "./types";
export { AI_TASKS, TASK_DEFAULTS, type AiTask } from "./tasks";

/** Who triggered the call – used for usage logging + credit accounting. restaurantId null = platform. */
export type AiContext = {
  restaurantId: string | null;
  userId?: string | null;
  /** Log + bill this call under another credit key (e.g. "theme_repair" is cheaper than "theme_generate"). */
  billAs?: string;
};

type Resolved = { provider: ProviderConfig; model: string; fallbackModel: string | null; params: { temperature?: number; maxTokens?: number } };

const cache = new Map<string, { at: number; value: Resolved }>();
export function invalidateAiConfigCache() {
  cache.clear();
}

/** Resolves task → provider + model from DB (Admin → AI), falling back to OPENROUTER_API_KEY + TASK_DEFAULTS. */
export async function resolveTask(task: AiTask): Promise<Resolved> {
  const hit = cache.get(task);
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const [row] = await db
    .select({ s: aiTaskSettings, p: aiProviders })
    .from(aiTaskSettings)
    .innerJoin(aiProviders, eq(aiProviders.id, aiTaskSettings.providerId))
    .where(and(eq(aiTaskSettings.task, task), eq(aiProviders.isEnabled, true)))
    .limit(1);
  let value: Resolved;
  if (row) {
    value = {
      provider: {
        id: row.p.id,
        name: row.p.name,
        adapter: row.p.adapter,
        baseUrl: row.p.baseUrl,
        apiKey: row.p.apiKeyEnc ? decryptSecret(row.p.apiKeyEnc) : null,
        extraHeaders: row.p.extraHeaders,
      },
      model: row.s.model,
      fallbackModel: row.s.fallbackModel,
      params: row.s.params,
    };
  } else {
    const key = env().OPENROUTER_API_KEY;
    if (!key) throw new AppError("aiNotConfigured");
    const d = TASK_DEFAULTS[task];
    value = {
      provider: { id: null, name: "OpenRouter (env)", adapter: "openrouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: key, extraHeaders: openRouterHeaders() },
      model: d.model,
      fallbackModel: d.fallbackModel ?? null,
      params: { temperature: d.temperature },
    };
  }
  cache.set(task, { at: Date.now(), value });
  return value;
}

export const openRouterHeaders = () => ({ "HTTP-Referer": env().APP_URL, "X-Title": "VeroMenu" });

// ---------------------------------------------------------------- credits

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

export async function getAiCreditsUsed(restaurantId: string) {
  const rows = await db
    .select({ task: aiUsage.task, n: dsql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.restaurantId, restaurantId), eq(aiUsage.ok, true), gte(aiUsage.createdAt, monthStart())))
    .groupBy(aiUsage.task);
  return rows.reduce((sum, r) => sum + r.n * (AI_CREDIT_COST[r.task] ?? 1), 0);
}

export async function getAiCredits(restaurantId: string) {
  const [r] = await db.select({ plan: restaurants.plan }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  const limit = getPlan(r?.plan).limits.aiCredits;
  const used = await getAiCreditsUsed(restaurantId);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

async function assertCredits(task: AiTask, ctx: AiContext) {
  if (!ctx.restaurantId) return;
  const { remaining } = await getAiCredits(ctx.restaurantId);
  if (remaining < (AI_CREDIT_COST[ctx.billAs ?? task] ?? 1)) throw new AppError("aiCreditsExhausted");
}

async function logUsage(task: AiTask, ctx: AiContext, provider: string, model: string, started: number, res: { usage?: ChatResult["usage"] } | null, error?: string) {
  await db.insert(aiUsage).values({
    restaurantId: ctx.restaurantId,
    userId: ctx.userId ?? null,
    task: ctx.billAs ?? task,
    providerName: provider,
    model,
    inputTokens: res?.usage?.inputTokens ?? 0,
    outputTokens: res?.usage?.outputTokens ?? 0,
    costUsd: res?.usage?.costUsd ?? null,
    durationMs: Date.now() - started,
    ok: !error,
    error: error?.slice(0, 500),
  });
}

async function withFallback<T extends { usage: ChatResult["usage"] }>(
  task: AiTask,
  ctx: AiContext,
  call: (r: Resolved, model: string) => Promise<T>,
): Promise<T & { model: string }> {
  await assertCredits(task, ctx);
  const r = await resolveTask(task);
  const models = [r.model, ...(r.fallbackModel ? [r.fallbackModel] : [])];
  let lastErr: unknown;
  for (const model of models) {
    const started = Date.now();
    try {
      const res = await call(r, model);
      await logUsage(task, ctx, r.provider.name, model, started, res);
      return { ...res, model };
    } catch (e) {
      lastErr = e;
      await logUsage(task, ctx, r.provider.name, model, started, null, e instanceof Error ? e.message : String(e));
      console.warn(`[ai] ${task} ${model} failed:`, e instanceof Error ? e.message : e);
    }
  }
  throw new AppError("aiFailed", lastErr instanceof Error ? lastErr.message : String(lastErr));
}

// ---------------------------------------------------------------- public API

/** Plain chat completion for a task. */
export async function aiChat(task: AiTask, req: ChatRequest, ctx: AiContext): Promise<ChatResult> {
  return withFallback(task, ctx, (r, model) =>
    getAdapter(r.provider.adapter).chat(r.provider, model, {
      ...req,
      temperature: req.temperature ?? r.params.temperature,
      maxTokens: req.maxTokens ?? r.params.maxTokens,
    }),
  );
}

/** Extracts the first JSON object/array from model output (handles ```json fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new AiError("model did not return JSON");
  }
}

/**
 * Structured output validated with zod. The JSON schema is derived from the zod schema and sent as
 * `response_format`; on validation failure the model gets one repair attempt with the error list.
 */
export async function aiJson<S extends z.ZodType>(
  task: AiTask,
  req: Omit<ChatRequest, "json">,
  schema: S,
  ctx: AiContext,
  name = "result",
): Promise<{ data: z.infer<S>; model: string; usage: ChatResult["usage"] }> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  const res = await aiChat(task, { ...req, json: { name, schema: jsonSchema } }, ctx);
  let parsed = schema.safeParse(safeExtract(res.text));
  if (parsed.success) return { data: parsed.data, model: res.model, usage: res.usage };

  const repair = await aiChat(
    task,
    {
      ...req,
      json: { name, schema: jsonSchema },
      messages: [
        ...req.messages,
        { role: "assistant", content: res.text },
        {
          role: "user",
          content: `Your JSON did not match the required schema. Errors:\n${parsed.error.issues
            .slice(0, 15)
            .map((i) => `- ${i.path.join(".")}: ${i.message}`)
            .join("\n")}\nReturn ONLY the corrected JSON.`,
        },
      ],
    },
    ctx,
  );
  parsed = schema.safeParse(safeExtract(repair.text));
  if (!parsed.success) throw new AppError("aiFailed", "invalid JSON from model");
  return { data: parsed.data, model: repair.model, usage: repair.usage };
}

function safeExtract(text: string) {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}

/** Image generation (optionally guided by reference images). */
export async function aiImage(req: ImageRequest, ctx: AiContext): Promise<ImageResult> {
  return withFallback("image_generate", ctx, (r, model) => getAdapter(r.provider.adapter).image(r.provider, model, req));
}

/** Speech → text using an audio-capable chat model. `wav` is base64 WAV (16 kHz mono recommended). */
export async function aiTranscribe(wavBase64: string, ctx: AiContext, languageHint = "de"): Promise<string> {
  const res = await aiChat(
    "transcribe",
    {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Transcribe this audio exactly (language hint: ${languageHint}). Output only the transcript text, nothing else.`,
            },
            { type: "input_audio", input_audio: { data: wavBase64, format: "wav" } },
          ],
        },
      ],
    },
    ctx,
  );
  return res.text.trim();
}
