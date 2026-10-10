"use server";
/**
 * Theme AI actions. Menu themes: permission `theme.manage` + `ai.use`; print designs (QR table cards):
 * `tables.manage` (or `theme.manage`) + `ai.use`. Always plan feature `theme_studio` + AI credits.
 * They never activate a design – they create a theme / propose changes; the studio shows a preview + diff
 * and the user publishes ("Als Druckdesign verwenden" for print).
 */
import { z } from "zod";
import { getLocale } from "next-intl/server";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import { action, AppError } from "@/core/http/action";
import { UI_LOCALES, type UiLocale } from "@/core/i18n/locales";
import { planHas } from "@/modules/billing/plans";
import { designAiContext } from "@/modules/theme-studio/access";
import type { PrintFormat } from "@/modules/theme-engine/types";
import { analyzeDesignFiles, generatePrintTheme, generateTheme, mediaToParts, proposeEdit } from "./service";

const rid = z.string().uuid();
const printFormat = z.enum(["a6", "a6-landscape", "a5", "a5-landscape", "a4", "a4-landscape", "tent-a6"] satisfies [PrintFormat, ...PrintFormat[]]);

/** theme.manage + ai.use + plan feature theme_studio. */
async function themeAiContext(restaurantId: string) {
  await assertRestaurantPermission(restaurantId, "ai.use");
  const ctx = await assertRestaurantPermission(restaurantId, "theme.manage");
  if (!planHas(ctx.restaurant.plan, "theme_studio")) throw new AppError("featureNotInPlan");
  return ctx;
}

/** Summaries / brief are written in the owner's dashboard language. */
async function uiLocale() {
  const l = await getLocale();
  return (UI_LOCALES as readonly string[]).includes(l) ? (l as UiLocale) : "de";
}

/** Description (text or voice transcript) [+ reference images] → new theme (draft). */
export const generateThemeFromPrompt = action(
  z.object({ restaurantId: rid, prompt: z.string().min(3).max(4000), referenceMediaIds: z.array(z.string().uuid()).max(4).optional() }),
  async ({ restaurantId, prompt, referenceMediaIds }): Promise<{ themeId: string; versionId: string; summary: string }> => {
    const ctx = await themeAiContext(restaurantId);
    const locale = await uiLocale();
    // Ownership check happens inside mediaToParts (only this restaurant's media); images only (no PDFs here).
    const refs = referenceMediaIds?.length ? await mediaToParts(restaurantId, referenceMediaIds, { allowPdf: false }) : null;
    const res = await generateTheme({ restaurantId, userId: ctx.user.id, locale, prompt, referenceImages: refs?.imageParts, origin: "ai_prompt" });
    await audit({
      restaurantId,
      userId: ctx.user.id,
      action: "theme.ai.generate",
      entityType: "theme",
      entityId: res.themeId,
      data: { origin: "ai_prompt", model: res.model, repaired: res.repaired, bytes: res.bytes, references: referenceMediaIds?.length ?? 0, warnings: res.warnings.slice(0, 10) },
    });
    return { themeId: res.themeId, versionId: res.versionId, summary: res.summary };
  },
);

/** PDF / photos of a printed menu or brand material → design brief → new theme (draft). */
export const generateThemeFromFiles = action(
  z.object({ restaurantId: rid, mediaIds: z.array(z.string().uuid()).min(1).max(6), notes: z.string().max(2000).optional() }),
  async ({ restaurantId, mediaIds, notes }): Promise<{ themeId: string; versionId: string; summary: string; brief: unknown }> => {
    const ctx = await themeAiContext(restaurantId);
    const locale = await uiLocale();
    const files = await mediaToParts(restaurantId, mediaIds, { allowPdf: true });
    const { brief, model: analyzeModel } = await analyzeDesignFiles({ restaurantId, userId: ctx.user.id, mediaIds, notes, locale, files });
    const res = await generateTheme({
      restaurantId,
      userId: ctx.user.id,
      locale,
      brief,
      notes,
      // Photos also go to the code model (fidelity); PDFs are represented by the brief only.
      referenceImages: files.imageParts.slice(0, 3),
      origin: "ai_file",
    });
    await audit({
      restaurantId,
      userId: ctx.user.id,
      action: "theme.ai.generate",
      entityType: "theme",
      entityId: res.themeId,
      data: { origin: "ai_file", files: mediaIds.length, analyzeModel, model: res.model, repaired: res.repaired, bytes: res.bytes, warnings: res.warnings.slice(0, 10) },
    });
    return { themeId: res.themeId, versionId: res.versionId, summary: res.summary, brief };
  },
);

/** Chat edit: instruction → changed files only (NOT saved). The studio shows a diff; applying = saveThemeVersion. */
export const proposeThemeEdit = action(
  z.object({ restaurantId: rid, themeId: z.string().uuid(), versionId: z.string().uuid(), instruction: z.string().min(2).max(4000) }),
  async ({ restaurantId, themeId, versionId, instruction }): Promise<{ changedFiles: Record<string, string>; deletedFiles: string[]; manifest?: unknown; summary: string }> => {
    // Menu themes need theme.manage; print designs also tables.manage (kind looked up only when needed).
    const ctx = await designAiContext(restaurantId, { themeId });
    const locale = await uiLocale();
    // getThemeWithPackage enforces restaurant scoping (own + library themes).
    const p = await proposeEdit({ restaurantId, userId: ctx.user.id, themeId, versionId, instruction, locale });
    await audit({
      restaurantId,
      userId: ctx.user.id,
      action: "theme.ai.edit",
      entityType: "theme",
      entityId: themeId,
      data: { versionId, model: p.model, changed: Object.keys(p.changedFiles), deleted: p.deletedFiles, manifest: !!p.manifest, instruction: instruction.slice(0, 300) },
    });
    return { changedFiles: p.changedFiles, deletedFiles: p.deletedFiles, ...(p.manifest ? { manifest: p.manifest } : {}), summary: p.summary };
  },
);

// ------------------------------------------------------------------ print designs (QR table cards / tents / posters)

/** Description (text or voice transcript) [+ reference images] → new print design (kind "print", not yet used). */
export const generatePrintFromPrompt = action(
  z.object({ restaurantId: rid, prompt: z.string().min(3).max(4000), format: printFormat, referenceMediaIds: z.array(z.string().uuid()).max(4).optional() }),
  async ({ restaurantId, prompt, format, referenceMediaIds }): Promise<{ themeId: string; versionId: string; summary: string }> => {
    const ctx = await designAiContext(restaurantId, "print");
    const locale = await uiLocale();
    const refs = referenceMediaIds?.length ? await mediaToParts(restaurantId, referenceMediaIds, { allowPdf: false }) : null;
    const res = await generatePrintTheme({ restaurantId, userId: ctx.user.id, locale, format, prompt, referenceImages: refs?.imageParts, origin: "ai_prompt" });
    await audit({
      restaurantId,
      userId: ctx.user.id,
      action: "theme.ai.generate",
      entityType: "theme",
      entityId: res.themeId,
      data: { kind: "print", format, origin: "ai_prompt", model: res.model, repaired: res.repaired, bytes: res.bytes, references: referenceMediaIds?.length ?? 0, warnings: res.warnings.slice(0, 10) },
    });
    return { themeId: res.themeId, versionId: res.versionId, summary: res.summary };
  },
);

/** PDF / photo of a menu, flyer, existing table card or brand material → design brief → new print design. */
export const generatePrintFromFiles = action(
  z.object({ restaurantId: rid, mediaIds: z.array(z.string().uuid()).min(1).max(6), format: printFormat, notes: z.string().max(2000).optional() }),
  async ({ restaurantId, mediaIds, format, notes }): Promise<{ themeId: string; versionId: string; summary: string; brief: unknown }> => {
    const ctx = await designAiContext(restaurantId, "print");
    const locale = await uiLocale();
    const files = await mediaToParts(restaurantId, mediaIds, { allowPdf: true });
    const { brief, model: analyzeModel } = await analyzeDesignFiles({ restaurantId, userId: ctx.user.id, mediaIds, notes, locale, files, kind: "print" });
    const res = await generatePrintTheme({ restaurantId, userId: ctx.user.id, locale, format, brief, notes, referenceImages: files.imageParts.slice(0, 3), origin: "ai_file" });
    await audit({
      restaurantId,
      userId: ctx.user.id,
      action: "theme.ai.generate",
      entityType: "theme",
      entityId: res.themeId,
      data: { kind: "print", format, origin: "ai_file", files: mediaIds.length, analyzeModel, model: res.model, repaired: res.repaired, bytes: res.bytes, warnings: res.warnings.slice(0, 10) },
    });
    return { themeId: res.themeId, versionId: res.versionId, summary: res.summary, brief };
  },
);
