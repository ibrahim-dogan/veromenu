/** OpenAI-compatible message format (works with OpenRouter, NVIDIA NIM, OpenAI, vLLM, Ollama ...). */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } } // https:// or data:image/...;base64,
  | { type: "input_audio"; input_audio: { data: string; format: "wav" | "mp3" } } // base64
  | { type: "file"; file: { filename: string; file_data: string } }; // data:application/pdf;base64,

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

export type ChatRequest = {
  messages: ChatMessage[];
  /** Ask for a JSON object. With a schema the adapter uses structured outputs when supported. */
  json?: { name: string; schema: Record<string, unknown> } | true;
  temperature?: number;
  maxTokens?: number;
  /** Reasoning budget for "thinking" models (OpenRouter `reasoning`, OpenAI `reasoning_effort`). false = off. */
  reasoning?: { effort: "low" | "medium" | "high" } | false;
  /** Per-request timeout (default 120 s). Long code generations need more. */
  timeoutMs?: number;
};

export type Usage = { inputTokens: number; outputTokens: number; costUsd: number | null };

export type ChatResult = { text: string; usage: Usage; model: string };

export type ImageRequest = { prompt: string; referenceImages?: { data: Buffer; mime: string }[] };
export type ImageResult = { images: { data: Buffer; mime: string }[]; text?: string; usage: Usage; model: string };

export type ProviderConfig = {
  id: string | null;
  name: string;
  adapter: string;
  baseUrl: string;
  apiKey: string | null;
  extraHeaders: Record<string, string>;
};

export interface AiAdapter {
  chat(p: ProviderConfig, model: string, req: ChatRequest): Promise<ChatResult>;
  image(p: ProviderConfig, model: string, req: ImageRequest): Promise<ImageResult>;
}

export class AiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}
