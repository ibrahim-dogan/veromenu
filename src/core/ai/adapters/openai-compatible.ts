import { AiError, type AiAdapter, type ChatRequest, type ImageRequest, type ProviderConfig, type Usage } from "../types";

type OAResponse = {
  model?: string;
  choices?: { message?: { content?: string | null; images?: { image_url?: { url?: string } }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  data?: { b64_json?: string }[];
  error?: { message?: string; code?: number | string; metadata?: { raw?: unknown; provider_name?: string } };
};

/** OpenRouter wraps upstream failures as "Provider returned error" – append the upstream detail for debugging. */
function errorText(e: NonNullable<OAResponse["error"]>) {
  const raw = e.metadata?.raw;
  const detail = raw === undefined ? "" : typeof raw === "string" ? raw : JSON.stringify(raw);
  const provider = e.metadata?.provider_name ? ` [${e.metadata.provider_name}]` : "";
  return `${e.message ?? "error"}${provider}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
}

function headers(p: ProviderConfig) {
  return {
    "content-type": "application/json",
    ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}),
    ...p.extraHeaders,
  };
}

async function post(p: ProviderConfig, path: string, body: unknown, timeoutMs = 120_000): Promise<OAResponse> {
  const res = await fetch(`${p.baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: headers(p),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: OAResponse;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiError(`${p.name}: invalid response (${res.status}): ${text.slice(0, 200)}`, res.status);
  }
  if (!res.ok || json.error) throw new AiError(`${p.name}: ${json.error ? errorText(json.error) : res.statusText}`, res.status);
  return json;
}

const usageOf = (r: OAResponse): Usage => ({
  inputTokens: r.usage?.prompt_tokens ?? 0,
  outputTokens: r.usage?.completion_tokens ?? 0,
  costUsd: typeof r.usage?.cost === "number" ? r.usage.cost : null,
});

function dataUrlToBuffer(url: string): { mime: string; data: Buffer } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
  if (!m) return null;
  return { mime: m[1], data: Buffer.from(m[2], "base64") };
}

/**
 * Generic OpenAI Chat Completions adapter.
 * `openrouter` flavour adds usage accounting and image generation via `modalities`.
 */
export function createOpenAICompatibleAdapter(flavour: "generic" | "openrouter"): AiAdapter {
  return {
    async chat(p, model, req: ChatRequest) {
      const body: Record<string, unknown> = {
        model,
        messages: req.messages,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
      };
      if (req.json === true) body.response_format = { type: "json_object" };
      else if (req.json) body.response_format = { type: "json_schema", json_schema: { name: req.json.name, strict: false, schema: req.json.schema } };
      if (flavour === "openrouter") body.usage = { include: true };
      if (req.reasoning !== undefined) {
        if (flavour === "openrouter") body.reasoning = req.reasoning === false ? { enabled: false } : { effort: req.reasoning.effort, exclude: true };
        else if (req.reasoning) body.reasoning_effort = req.reasoning.effort;
      }
      const r = await post(p, "/chat/completions", body, req.timeoutMs);
      return { text: r.choices?.[0]?.message?.content ?? "", usage: usageOf(r), model: r.model ?? model };
    },

    async image(p, model, req: ImageRequest) {
      if (flavour === "openrouter") {
        const content = [
          { type: "text", text: req.prompt },
          ...(req.referenceImages ?? []).map((img) => ({
            type: "image_url",
            image_url: { url: `data:${img.mime};base64,${img.data.toString("base64")}` },
          })),
        ];
        const r = await post(
          p,
          "/chat/completions",
          { model, messages: [{ role: "user", content }], modalities: ["image", "text"], usage: { include: true } },
          180_000,
        );
        const msg = r.choices?.[0]?.message;
        const images = (msg?.images ?? []).map((i) => dataUrlToBuffer(i.image_url?.url ?? "")).filter((x) => x !== null);
        if (!images.length) throw new AiError(`${p.name}: model returned no image`);
        return { images, text: msg?.content ?? undefined, usage: usageOf(r), model: r.model ?? model };
      }
      // OpenAI Images API (reference images not supported on this path)
      const r = await post(p, "/images/generations", { model, prompt: req.prompt, n: 1, response_format: "b64_json" }, 180_000);
      const images = (r.data ?? []).filter((d) => d.b64_json).map((d) => ({ mime: "image/png", data: Buffer.from(d.b64_json!, "base64") }));
      if (!images.length) throw new AiError(`${p.name}: model returned no image`);
      return { images, usage: usageOf(r), model };
    },
  };
}
