import type { MenuTree } from "../service";

export type EditorMenu = MenuTree[number];
export type EditorCategory = EditorMenu["categories"][number];
export type EditorItem = EditorCategory["items"][number];
export type EditorVariant = EditorItem["variants"][number];

export type EditorMedia = {
  id: string;
  thumb: string;
  url: string;
  mime: string;
  alt: string | null;
  kind: "upload" | "ai_generated";
};

export type EditorPerms = {
  /** menu.edit – full editing */
  edit: boolean;
  /** menu.availability (or edit) – toggle sold-out */
  availability: boolean;
  /** allergens.review – confirm allergens */
  allergens: boolean;
  /** ai.use – AI buttons */
  ai: boolean;
  /** translations.manage */
  translations: boolean;
};

export type EditorContext = {
  restaurantId: string;
  perms: EditorPerms;
  mediaMap: Record<string, EditorMedia>;
  gaps: Record<string, string[]>;
  currency: string;
  /** plan feature ai_images */
  aiImages: boolean;
};
