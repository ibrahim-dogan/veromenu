import type { AiAdapter } from "../types";
import { createOpenAICompatibleAdapter } from "./openai-compatible";

/**
 * Adapter registry. Add a new adapter (e.g. native Anthropic, Google, Azure) by implementing AiAdapter
 * and registering it here – it then shows up in Admin → AI → providers.
 */
export const ADAPTERS: Record<string, { label: string; adapter: AiAdapter; defaultBaseUrl: string }> = {
  openrouter: { label: "OpenRouter", adapter: createOpenAICompatibleAdapter("openrouter"), defaultBaseUrl: "https://openrouter.ai/api/v1" },
  openai_compatible: {
    label: "OpenAI-compatible (NVIDIA NIM, OpenAI, Together, Groq, Mistral, Ollama, vLLM …)",
    adapter: createOpenAICompatibleAdapter("generic"),
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
  },
};

export function getAdapter(id: string): AiAdapter {
  return (ADAPTERS[id] ?? ADAPTERS.openai_compatible).adapter;
}
