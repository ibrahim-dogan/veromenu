/** Shared (client + server) types of the AI menu import. */

export type DraftVariant = { name: string; priceCents: number };

export type DraftItem = {
  key: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  variants: DraftVariant[];
  /** Footnote marks exactly as printed ("A", "C", "1"). */
  marks: string[];
  /** Catalog codes (modules/allergens/catalog.ts) – suggestions only, never confirmed automatically. */
  allergenHints: string[];
  additiveHints: string[];
  tags: string[];
};

export type DraftCategory = { key: string; name: string; description: string | null; items: DraftItem[] };

export type DraftMenu = {
  key: string;
  name: string;
  /** null = create a new menu with `name`, otherwise id of an existing menu. */
  targetMenuId: string | null;
  categories: DraftCategory[];
};

export type ImportDraft = { menus: DraftMenu[]; notes: string | null; model: string | null };

export type ImportStatus = "processing" | "ready" | "applied" | "failed" | "discarded";

export type ImportDto = {
  id: string;
  status: ImportStatus;
  draft: ImportDraft | null;
  error: string | null;
  files: { id: string; mime: string; thumb: string | null; url: string }[];
  createdAt: string;
  appliedAt: string | null;
  itemCount: number;
};

export type ApplyImportResult = { menus: number; categories: number; items: number; reviewTasks: number };
