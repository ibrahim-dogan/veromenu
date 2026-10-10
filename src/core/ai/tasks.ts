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
  "theme_analyze",
  "theme_generate",
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
  // PDF / photo of a printed menu or brand material → structured design brief (palette, fonts, layout).
  theme_analyze: { model: "google/gemini-3.8-flash", fallbackModel: "anthropic/claude-haiku-5.5", temperature: 0.2, capability: "vision+pdf" },
  // Writes theme code (Liquid/CSS/JS). Chosen by a bake-off (2026-10-10, same prompt, 4 cheap coders):
  // gpt-6-luna: valid first try, 37 s, ~0.004 $, cleanest result; haiku-5.5 as fallback (other model family).
  theme_generate: { model: "openai/gpt-6-luna", fallbackModel: "anthropic/claude-haiku-5.5", temperature: 0.4, capability: "text" },
};
