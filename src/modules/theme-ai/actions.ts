"use server";
/**
 * CONTRACT (implemented by the theme-ai engineer). All actions: permission `theme.manage` + `ai.use`,
 * plan feature `theme_studio`, AI credits. They never activate a theme for guests – they create a theme /
 * propose changes; the studio shows a preview + diff and the user publishes.
 */
import { z } from "zod";
import { action, AppError } from "@/core/http/action";

const rid = z.string().uuid();

/** Description (text or voice transcript) [+ reference images] → new theme (draft). */
export const generateThemeFromPrompt = action(
  z.object({ restaurantId: rid, prompt: z.string().min(3).max(4000), referenceMediaIds: z.array(z.string().uuid()).max(4).optional() }),
  async (): Promise<{ themeId: string; versionId: string; summary: string }> => {
    throw new AppError("unexpected", "not implemented yet");
  },
);

/** PDF / photos of a printed menu or brand material → design brief → new theme (draft). */
export const generateThemeFromFiles = action(
  z.object({ restaurantId: rid, mediaIds: z.array(z.string().uuid()).min(1).max(6), notes: z.string().max(2000).optional() }),
  async (): Promise<{ themeId: string; versionId: string; summary: string; brief: unknown }> => {
    throw new AppError("unexpected", "not implemented yet");
  },
);

/** Chat edit: instruction → changed files only (NOT saved). The studio shows a diff; applying = saveThemeVersion. */
export const proposeThemeEdit = action(
  z.object({ restaurantId: rid, themeId: z.string().uuid(), versionId: z.string().uuid(), instruction: z.string().min(2).max(4000) }),
  async (): Promise<{ changedFiles: Record<string, string>; deletedFiles: string[]; manifest?: unknown; summary: string }> => {
    throw new AppError("unexpected", "not implemented yet");
  },
);
