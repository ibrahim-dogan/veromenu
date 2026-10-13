/**
 * Menu kit = ONE upload of the printed menu (PDF / photos) → background job (`jobs`, kind "menu_kit"):
 * source documents, page renders, menu import (preview), logo, design brief, menu theme, print design.
 * Shared (client + server) types.
 */

export const KIT_JOB_KIND = "menu_kit";

/** Execution order (also the display order of the progress list). */
export const KIT_STEPS = ["sources", "pages", "import", "logo", "brief", "theme", "print"] as const;
export type KitStepKey = (typeof KIT_STEPS)[number];

/** Steps every plan gets (AI import + logo); the rest needs the `theme_studio` plan feature (Starter / Pro). */
export const KIT_FREE_STEPS: KitStepKey[] = ["sources", "import", "logo"];

export type KitStepStatus = "pending" | "running" | "done" | "failed" | "skipped";
export type KitStepState = { status: KitStepStatus; error?: string; detail?: unknown; startedAt?: string; finishedAt?: string };
export type KitJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export const KIT_MAX_FILES = 10;
export const KIT_PRINT_FORMAT = "tent-a6";

export type KitStepDto = { key: KitStepKey; status: KitStepStatus; error: string | null; found?: boolean };

export type KitJobDto = {
  id: string;
  status: KitJobStatus;
  /** true while steps are still running (poll). */
  active: boolean;
  createdAt: string;
  /** start of the current run (a retry restarts the clock) */
  startedAt: string;
  finishedAt: string | null;
  steps: KitStepDto[];
  files: { id: string; mime: string; thumb: string | null; url: string | null }[];
  import: { id: string; status: string; itemCount: number; categoryCount: number; hintCount: number; applied: boolean } | null;
  logo: { mediaId: string; url: string | null; isCurrent: boolean } | null;
  /** settings.logoMediaId right now (may differ from the extracted logo when the owner chose another file). */
  currentLogo: { mediaId: string; url: string | null } | null;
  theme: { id: string; versionId: string | null; name: string; summary: string | null; active: boolean } | null;
  print: { id: string; versionId: string | null; name: string; summary: string | null; selected: boolean } | null;
  briefSummary: string | null;
};

/** Allergen handling when the import is applied from the kit review (mirrors the import preview's choice). */
export type KitAllergenMode = "suggest" | "confirm";

export type KitApplyPart = "import" | "theme" | "print";
export type KitApplyOutcome = { ok: true } | { ok: false; error: string };
export type KitApplyResult = Partial<Record<KitApplyPart, KitApplyOutcome>> & { importResult?: { items: number; categories: number; reviewTasks: number } };
