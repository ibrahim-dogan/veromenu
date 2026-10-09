import { pgTable, uuid, text, timestamp, boolean, integer, real, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { restaurants } from "./tenancy";

/**
 * LLM providers. Every provider speaks the OpenAI-compatible Chat Completions API
 * (OpenRouter, NVIDIA NIM, OpenAI, Together, Groq, Mistral, Ollama, vLLM, LM Studio ...).
 */
export const aiProviders = pgTable("ai_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // "OpenRouter"
  /** Adapter id from core/ai/adapters (openai_compatible | openrouter | ...). */
  adapter: text("adapter").notNull().default("openai_compatible"),
  baseUrl: text("base_url").notNull(),
  /** AES-256-GCM encrypted with APP_SECRET (core/crypto). */
  apiKeyEnc: text("api_key_enc"),
  extraHeaders: jsonb("extra_headers").$type<Record<string, string>>().notNull().default({}),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Which provider + model handles which AI task. Switch models without code changes. */
export const aiTaskSettings = pgTable("ai_task_settings", {
  task: text("task").primaryKey(), // see core/ai/tasks.ts AI_TASKS
  providerId: uuid("provider_id")
    .notNull()
    .references(() => aiProviders.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  /** Optional fallback model on the same provider. */
  fallbackModel: text("fallback_model"),
  params: jsonb("params").$type<{ temperature?: number; maxTokens?: number }>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    task: text("task").notNull(),
    providerName: text("provider_name").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: real("cost_usd"),
    durationMs: integer("duration_ms"),
    ok: boolean("ok").notNull().default(true),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_restaurant_idx").on(t.restaurantId, t.createdAt)],
);

/**
 * AI agent change sets: the agent never writes directly.
 * It proposes operations → server validates & renders a diff (dry run) → user approves → applied in a transaction.
 * `inverse` stores undo operations.
 */
export const agentChangesets = pgTable(
  "agent_changesets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    input: text("input").notNull(), // prompt or transcript
    inputKind: text("input_kind", { enum: ["text", "voice"] }).notNull().default("text"),
    summary: text("summary"),
    operations: jsonb("operations").$type<unknown[]>().notNull().default([]),
    preview: jsonb("preview").$type<unknown>(),
    inverse: jsonb("inverse").$type<unknown[]>(),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    status: text("status", { enum: ["draft", "applied", "discarded", "failed", "reverted"] })
      .notNull()
      .default("draft"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [index("changesets_restaurant_idx").on(t.restaurantId, t.createdAt)],
);
