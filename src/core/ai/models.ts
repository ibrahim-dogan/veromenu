import "server-only";
import type { ProviderConfig } from "./types";

/**
 * Model catalogue of a provider via its OpenAI-compatible `GET {baseUrl}/models`.
 * OpenRouter returns pricing + modalities; plain OpenAI-compatible providers (NVIDIA NIM, Groq, Ollama …)
 * usually return ids only → capabilities are "unknown" and not enforced.
 */
export type ModelInfo = {
  id: string;
  name: string | null;
  contextLength: number | null;
  /** USD per 1M tokens */
  promptPerM: number | null;
  completionPerM: number | null;
  /** null = unknown */
  input: string[] | null;
  output: string[] | null;
  supportsStructured: boolean | null;
};

type RawModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: { input_modalities?: string[]; output_modalities?: string[]; modality?: string };
  supported_parameters?: string[];
};

const cache = new Map<string, { at: number; models: ModelInfo[] }>();
const TTL = 10 * 60_000;

const perM = (v: string | number | undefined) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000 * 1000) / 1000 : null;
};

function normalise(m: RawModel): ModelInfo {
  let input = m.architecture?.input_modalities ?? null;
  let output = m.architecture?.output_modalities ?? null;
  if ((!input || !output) && m.architecture?.modality?.includes("->")) {
    const [i, o] = m.architecture.modality.split("->");
    input ??= i.split("+");
    output ??= o.split("+");
  }
  return {
    id: m.id,
    name: m.name ?? null,
    contextLength: m.context_length ?? null,
    promptPerM: perM(m.pricing?.prompt),
    completionPerM: perM(m.pricing?.completion),
    input,
    output,
    supportsStructured: m.supported_parameters
      ? m.supported_parameters.includes("response_format") || m.supported_parameters.includes("structured_outputs")
      : null,
  };
}

export async function fetchProviderModels(p: ProviderConfig, opts: { fresh?: boolean } = {}): Promise<ModelInfo[]> {
  const cacheKey = `${p.id ?? p.name}|${p.baseUrl}`;
  const hit = cache.get(cacheKey);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL) return hit.models;
  const res = await fetch(`${p.baseUrl.replace(/\/$/, "")}/models`, {
    headers: { ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}), ...p.extraHeaders },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data?: RawModel[] } | RawModel[];
  const list = Array.isArray(json) ? json : (json.data ?? []);
  const models = list.filter((m) => m && typeof m.id === "string").map(normalise).sort((a, b) => a.id.localeCompare(b.id));
  cache.set(cacheKey, { at: Date.now(), models });
  return models;
}

export function invalidateModelCache() {
  cache.clear();
}

export type CapabilityCheck = "ok" | "missing" | "unknown";

/** Checks a model against TASK_DEFAULTS[task].capability ("text", "text+json", "vision+pdf", "image-output", "audio-input"). */
export function checkCapability(capability: string, m: ModelInfo | undefined): { result: CapabilityCheck; missing: string[] } {
  if (!m || !m.input || !m.output) return { result: "unknown", missing: [] };
  const missing: string[] = [];
  for (const need of capability.split("+")) {
    switch (need) {
      case "text":
        if (!m.output.includes("text")) missing.push("text output");
        break;
      case "json":
        if (m.supportsStructured === false) missing.push("structured output");
        break;
      case "vision":
        if (!m.input.includes("image")) missing.push("image input");
        break;
      case "pdf":
        if (!m.input.includes("file") && !m.input.includes("image")) missing.push("file input");
        break;
      case "image-output":
        if (!m.output.includes("image")) missing.push("image output");
        break;
      case "audio-input":
        if (!m.input.includes("audio")) missing.push("audio input");
        break;
    }
  }
  return { result: missing.length ? "missing" : "ok", missing };
}
