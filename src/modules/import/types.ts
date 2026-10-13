/** Shared (client + server) types of the AI menu import. */
import type { LegendEntry, MarkScheme } from "./marks";

export type { LegendEntry, MarkScheme };

export type DraftVariant = { name: string; priceCents: number };

export type DraftItem = {
  key: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  variants: DraftVariant[];
  /** Footnote marks exactly as printed ("A", "C", "1"). */
  marks: string[];
  /**
   * Catalog codes (modules/allergens/catalog.ts) derived from the printed marks (legend or German standard
   * scheme, see marks.ts). Editable in the preview; confirmed only when the owner ticks "wir haben sie geprüft".
   */
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

export type ImportDraft = {
  menus: DraftMenu[];
  notes: string | null;
  model: string | null;
  /** Printed key of the footnote marks (absent in drafts created before 2026-10). */
  legend?: LegendEntry[];
  /** How the marks were mapped to codes: printed legend, German standard scheme, or not at all (ambiguous). */
  markScheme?: MarkScheme;
};

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

export type ApplyImportResult = {
  menus: number;
  categories: number;
  items: number;
  reviewTasks: number;
  /** Items whose allergens/additives were taken over as confirmed (owner ticked "wir haben sie geprüft"). */
  allergensConfirmed: number;
};

/** A stored menu source document (restaurants.settings.sources) offered for re-import. */
export type SourceFile = { id: string; mime: string; name: string | null; url: string; thumb: string | null };
