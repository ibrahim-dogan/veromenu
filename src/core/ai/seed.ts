import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/core/db";
import { aiProviders, aiTaskSettings } from "@/core/db/schema";
import { encryptSecret } from "@/core/crypto";
import { AI_TASKS, TASK_DEFAULTS } from "./tasks";

/** Seeds an OpenRouter provider (from OPENROUTER_API_KEY) and default task → model routing. Idempotent. */
export async function seedAiDefaults(): Promise<void> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return console.log("• OPENROUTER_API_KEY not set – skipping AI seed");
  let [provider] = await db.select().from(aiProviders).where(eq(aiProviders.name, "OpenRouter")).limit(1);
  if (!provider) {
    [provider] = await db
      .insert(aiProviders)
      .values({
        name: "OpenRouter",
        adapter: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKeyEnc: encryptSecret(key),
        extraHeaders: { "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000", "X-Title": "VeroMenu" },
      })
      .returning();
    console.log("✔ AI provider OpenRouter created");
  }
  for (const task of AI_TASKS) {
    const d = TASK_DEFAULTS[task];
    await db
      .insert(aiTaskSettings)
      .values({ task, providerId: provider.id, model: d.model, fallbackModel: d.fallbackModel ?? null, params: { temperature: d.temperature } })
      .onConflictDoNothing();
  }
  console.log("✔ AI task routing ensured");
}
