"use server";
/**
 * Menu kit actions. Start / retry: `menu.edit` + `ai.use` (plan feature `ai_import`, every plan). The design steps
 * (brief, menu theme, print design) run only with the plan feature `theme_studio` and the matching permissions.
 * Apply checks the permission of each part: import = menu.edit + ai.use, theme = theme.manage, print = theme.manage
 * or tables.manage (both plan feature theme_studio).
 */
import { z } from "zod";
import { getLocale } from "next-intl/server";
import { assertRestaurantPermission, getRestaurantContext } from "@/core/auth/guards";
import { action, AppError, ForbiddenError } from "@/core/http/action";
import { UI_LOCALES, type UiLocale } from "@/core/i18n/locales";
import { planHas } from "@/modules/billing/plans";
import { canManageKind, designAiContext } from "@/modules/theme-studio/access";
import { retryKitJob, startKitJob } from "./runner";
import { activateKitTheme, applyKitImport, generateFromStoredSources, getKitDto, getStoredSources, selectKitPrint, setKitLogo } from "./service";
import { kitStepsFor } from "./plan";
import { KIT_MAX_FILES, KIT_STEPS, type KitApplyPart, type KitApplyResult } from "./types";

const rid = z.uuid();
const stepKey = z.enum(KIT_STEPS);
const printFormat = z.enum(["a6", "a6-landscape", "a5", "a5-landscape", "a4", "a4-landscape", "tent-a6"]);

async function kitContext(restaurantId: string) {
  await assertRestaurantPermission(restaurantId, "ai.use");
  const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
  if (!planHas(ctx.restaurant.plan, "ai_import")) throw new AppError("featureNotInPlan");
  return ctx;
}

async function uiLocale() {
  const l = await getLocale();
  return (UI_LOCALES as readonly string[]).includes(l) ? (l as UiLocale) : "de";
}

/** One upload → background job. `mediaIds` omitted → the stored source documents of the restaurant. */
export const startMenuKit = action(
  z.object({ restaurantId: rid, mediaIds: z.array(z.uuid()).min(1).max(KIT_MAX_FILES).optional() }),
  async ({ restaurantId, mediaIds }) => {
    const ctx = await kitContext(restaurantId);
    return startKitJob({ restaurantId, userId: ctx.user.id, mediaIds, locale: await uiLocale(), steps: kitStepsFor(ctx) });
  },
);

/** Re-runs one failed step (or all failed steps when `step` is omitted). */
export const retryKitStep = action(z.object({ restaurantId: rid, jobId: z.uuid(), step: stepKey.optional() }), async ({ restaurantId, jobId, step }) => {
  const ctx = await kitContext(restaurantId);
  await retryKitJob({ restaurantId, userId: ctx.user.id, jobId, step });
  return getKitDto(restaurantId, jobId);
});

/**
 * "Alles übernehmen" (or a single part): apply the import preview, activate the menu theme, use the print design.
 * Parts are independent – one failing part does not undo the others; the result lists each outcome.
 */
export const applyKit = action(
  z.object({
    restaurantId: rid,
    jobId: z.uuid(),
    parts: z.array(z.enum(["import", "theme", "print"])).min(1).max(3),
    allergenMode: z.enum(["suggest", "confirm"]).optional(),
  }),
  async ({ restaurantId, jobId, parts, allergenMode }): Promise<KitApplyResult> => {
    const ctx = await getRestaurantContext(restaurantId);
    if (!ctx) throw new ForbiddenError("no access");
    const out: KitApplyResult = {};
    const run = async (part: KitApplyPart, fn: () => Promise<unknown>) => {
      try {
        const r = await fn();
        out[part] = { ok: true };
        if (part === "import" && r && typeof r === "object") out.importResult = r as KitApplyResult["importResult"];
      } catch (e) {
        if (!(e instanceof AppError) && !(e instanceof ForbiddenError)) console.error("[kit] apply", part, e);
        out[part] = { ok: false, error: e instanceof ForbiddenError ? "forbidden" : e instanceof AppError ? e.code : "unexpected" };
      }
    };
    // import first: the theme preview then shows the real dishes
    if (parts.includes("import")) await run("import", async () => (await kitContext(restaurantId), applyKitImport({ restaurantId, userId: ctx.user.id, jobId, allergenMode })));
    if (parts.includes("theme")) await run("theme", async () => (await designPermission(restaurantId, "menu"), activateKitTheme({ restaurantId, userId: ctx.user.id, jobId })));
    if (parts.includes("print")) await run("print", async () => (await designPermission(restaurantId, "print"), selectKitPrint({ restaurantId, userId: ctx.user.id, jobId })));
    return out;
  },
);

/** Activating / selecting a design needs no AI permission – only the design permission + plan feature. */
async function designPermission(restaurantId: string, kind: "menu" | "print") {
  const ctx = await getRestaurantContext(restaurantId);
  if (!ctx || !canManageKind(ctx, kind)) throw new ForbiddenError("missing design permission");
  if (!planHas(ctx.restaurant.plan, "theme_studio")) throw new AppError("featureNotInPlan");
  return ctx;
}

/** Logo from the review screen ("Andere Datei wählen"); null removes it. */
export const setKitLogoAction = action(z.object({ restaurantId: rid, mediaId: z.uuid().nullable() }), async ({ restaurantId, mediaId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "settings.manage");
  await setKitLogo({ restaurantId, userId: ctx.user.id, mediaId });
  return null;
});

/** Thumbnails of the stored menu + whether its design brief can be reused (theme / print dialogs). */
export const getStoredSourcesAction = action(z.object({ restaurantId: rid, kind: z.enum(["menu", "print"]) }), async ({ restaurantId, kind }) => {
  await designAiContext(restaurantId, kind);
  return getStoredSources(restaurantId);
});

/** "Gespeicherte Speisekarte verwenden": new menu theme / print design from the stored sources (draft). */
export const generateFromStoredSourcesAction = action(
  z.object({ restaurantId: rid, kind: z.enum(["menu", "print"]), format: printFormat.optional(), notes: z.string().max(2000).optional() }),
  async ({ restaurantId, kind, format, notes }): Promise<{ themeId: string; versionId: string; summary: string; briefReused: boolean }> => {
    const ctx = await designAiContext(restaurantId, kind);
    const res = await generateFromStoredSources({ restaurantId, userId: ctx.user.id, locale: await uiLocale(), kind, format, notes: notes?.trim() || undefined });
    return { themeId: res.themeId, versionId: res.versionId, summary: res.summary, briefReused: res.briefReused };
  },
);
