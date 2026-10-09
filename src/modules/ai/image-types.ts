/** Shared (client + server) types for AI image generation. */
export const IMAGE_STYLES = ["bright", "rustic", "dark", "minimal"] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];

export type ImageTarget = { type: "item" | "category"; id: string };

export type AiImageContext =
  | { state: "plan" | "permission" }
  | { state: "ok"; subject: string; name: string; current: { id: string; thumb: string; kind: "upload" | "ai_generated" } | null };
