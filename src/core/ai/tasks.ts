/**
 * AI tasks. Each task is routed to a provider + model via Admin → AI (table ai_task_settings).
 * Defaults below are used by the seed and as fallback when a task has no row yet.
 * Change models any time without code changes – every provider is OpenAI-compatible.
 */
export const AI_TASKS = [
  "translate",
  "translate_review",
  "allergens",
  "menu_extract",
  "image_generate",
  "agent",
  "transcribe",
] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const TASK_DEFAULTS: Record<AiTask, { model: string; fallbackModel?: string; temperature?: number; capability: string }> = {
  translate: { model: "anthropic/claude-haiku-5.5", fallbackModel: "openai/gpt-5.6-luna", temperature: 0.2, capability: "text" },
  // Deliberately a different model family than `translate` → independent second opinion.
  translate_review: { model: "openai/gpt-5.6-luna", fallbackModel: "anthropic/claude-haiku-5.5", temperature: 0, capability: "text" },
  allergens: { model: "anthropic/claude-haiku-5.5", fallbackModel: "openai/gpt-5.6-luna", temperature: 0, capability: "text" },
  menu_extract: { model: "google/gemini-3.5-flash-lite", fallbackModel: "anthropic/claude-haiku-5.5", temperature: 0, capability: "vision+pdf" },
  image_generate: { model: "google/gemini-3.1-flash-image", fallbackModel: "google/gemini-3.1-flash-lite-image", capability: "image-output" },
  agent: { model: "anthropic/claude-haiku-5.5", fallbackModel: "openai/gpt-5.6-luna", temperature: 0.1, capability: "text+json" },
  transcribe: { model: "google/gemini-3.5-flash-lite", fallbackModel: "qwen/qwen3.8-omni-flash", temperature: 0, capability: "audio-input" },
};
