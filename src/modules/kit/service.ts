import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/core/db";
import { media, menuImports, restaurants, themes } from "@/core/db/schema";
import { audit } from "@/core/audit";
import { AppError } from "@/core/http/errors";
import { mediaSrc } from "@/core/storage/media";
import { getPlan } from "@/modules/billing/plans";
import { getPageImages, getSourceDocuments, listSourceDocuments } from "@/modules/documents";
import { applyImport, countDraftItems } from "@/modules/import/service";
import type { DraftMenu, ImportDraft } from "@/modules/import/types";
import { getMenuTree } from "@/modules/menu/service";
import { patchSettings } from "@/modules/settings/service";
import type { DesignBrief } from "@/modules/theme-ai/brief";
import { analyzeDesignFiles, generatePrintTheme, generateTheme, mediaToParts, type GenerateResult } from "@/modules/theme-ai/service";
import { getThemeWithPackage, publishTheme } from "@/modules/theme-engine/service";
import { parseStudioThemeId, type PrintFormat, type ThemeKind } from "@/modules/theme-engine/types";
import { sanitizeSettings } from "@/modules/theme-studio/lib/package";
import { writeThemeConfig } from "@/modules/theme-studio/service";
import { getKitJobRow, getLatestKitBrief, getLatestKitJobRow, kitInput, kitResult, type JobRow } from "./runner";
import { KIT_STEPS, type KitAllergenMode, type KitJobDto, type KitStepState } from "./types";

type RestaurantRow = typeof restaurants.$inferSelect;

async function restaurantRow(restaurantId: string): Promise<RestaurantRow> {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) throw new AppError("notFound");
  return r;
}

// ------------------------------------------------------------------ dto

export async function toKitDto(j: JobRow, r?: RestaurantRow): Promise<KitJobDto> {
  const rest = r ?? (await restaurantRow(j.restaurantId));
  const res = kitResult(j);
  const steps = j.steps as Record<string, KitStepState>;
  const sourceIds = res.mediaIds ?? ((j.input as { mediaIds?: string[] }).mediaIds ?? []);
  const currentLogoId = rest.settings?.logoMediaId ?? null;
  const mediaIds = [...new Set([...sourceIds, ...(res.pageMediaIds ?? []), ...(res.logoMediaId ? [res.logoMediaId] : []), ...(currentLogoId ? [currentLogoId] : [])])];

  const [mediaRows, imp, themeRows] = await Promise.all([
    mediaIds.length ? db.select().from(media).where(and(inArray(media.id, mediaIds), eq(media.restaurantId, j.restaurantId))) : [],
    res.importId ? db.select().from(menuImports).where(eq(menuImports.id, res.importId)).limit(1) : [],
    res.themeId || res.printThemeId
      ? db
          .select({ id: themes.id, name: themes.name, currentVersionId: themes.currentVersionId })
          .from(themes)
          .where(and(inArray(themes.id, [res.themeId, res.printThemeId].filter((x): x is string => !!x)), eq(themes.restaurantId, j.restaurantId)))
      : [],
  ]);
  const byId = new Map(mediaRows.map((m) => [m.id, m]));
  const pageOf = (sourceId: string) => mediaRows.find((m) => m.sourceMediaId === sourceId && (res.pageMediaIds ?? []).includes(m.id));
  const importRow = imp[0];
  const draft = (importRow?.result as ImportDraft | null) ?? null;
  const theme = themeRows.find((t) => t.id === res.themeId);
  const print = themeRows.find((t) => t.id === res.printThemeId);
  const logo = res.logoMediaId ? byId.get(res.logoMediaId) : undefined;
  const current = currentLogoId ? byId.get(currentLogoId) : undefined;

  return {
    id: j.id,
    status: j.status,
    active: j.status === "queued" || j.status === "running",
    createdAt: j.createdAt.toISOString(),
    startedAt: kitInput(j).runStartedAt ?? j.createdAt.toISOString(),
    finishedAt: j.finishedAt?.toISOString() ?? null,
    steps: KIT_STEPS.filter((k) => steps[k]).map((k) => ({
      key: k,
      status: steps[k].status,
      error: steps[k].error ?? null,
      ...(k === "logo" && steps[k].detail && typeof steps[k].detail === "object" ? { found: !!(steps[k].detail as { found?: boolean }).found } : {}),
    })),
    files: sourceIds
      .map((id) => byId.get(id))
      .filter((m) => !!m)
      .map((m) => ({
        id: m.id,
        mime: m.mime,
        thumb: m.mime.startsWith("image/") ? mediaSrc(m, "sm") : mediaSrc(pageOf(m.id), "sm"),
        url: mediaSrc(m, "orig"),
      })),
    import: importRow
      ? {
          id: importRow.id,
          status: importRow.status,
          itemCount: countDraftItems(draft),
          categoryCount: draft?.menus.reduce((n, m) => n + m.categories.length, 0) ?? 0,
          hintCount: draft?.menus.reduce((n, m) => n + m.categories.reduce((k, c) => k + c.items.filter((i) => i.marks.length || i.allergenHints.length || i.additiveHints.length).length, 0), 0) ?? 0,
          applied: importRow.status === "applied",
        }
      : null,
    logo: logo ? { mediaId: logo.id, url: mediaSrc(logo, "md"), isCurrent: currentLogoId === logo.id } : null,
    currentLogo: current ? { mediaId: current.id, url: mediaSrc(current, "md") } : null,
    theme: theme
      ? { id: theme.id, versionId: theme.currentVersionId, name: theme.name, summary: res.themeSummary ?? null, active: parseStudioThemeId(rest.themeId) === theme.id }
      : null,
    print: print
      ? { id: print.id, versionId: print.currentVersionId, name: print.name, summary: res.printSummary ?? null, selected: rest.settings?.print?.themeId === print.id }
      : null,
    briefSummary: res.brief?.summary ?? null,
  };
}

export async function getKitDto(restaurantId: string, jobId: string) {
  return toKitDto(await getKitJobRow(restaurantId, jobId));
}

// ------------------------------------------------------------------ overview card

export type KitOverview =
  | { state: "none" }
  | { state: "running"; jobId: string; done: number; total: number }
  | { state: "ready"; jobId: string }
  | { state: "finished"; jobId: string };

/** What the overview card shows: nothing ran yet · running job · results waiting to be applied · all handled. */
export async function getKitOverview(restaurantId: string): Promise<KitOverview> {
  const j = await getLatestKitJobRow(restaurantId);
  if (!j) return { state: "none" };
  const steps = Object.values(j.steps as Record<string, KitStepState>);
  if (j.status === "queued" || j.status === "running")
    return { state: "running", jobId: j.id, done: steps.filter((s) => s.status === "done" || s.status === "failed" || s.status === "skipped").length, total: steps.length };
  const dto = await toKitDto(j);
  const waiting = (dto.import?.status === "ready" && !dto.import.applied) || (dto.theme && !dto.theme.active) || (dto.print && !dto.print.selected);
  const recent = Date.now() - (j.finishedAt ?? j.createdAt).getTime() < 14 * 86_400_000;
  return waiting && recent ? { state: "ready", jobId: j.id } : { state: "finished", jobId: j.id };
}

// ------------------------------------------------------------------ apply

/** Same target mapping as the import preview: same-named menu → empty menu → (over the menu limit) first menu → new. */
async function draftWithTargets(restaurantId: string, plan: string, draft: ImportDraft): Promise<DraftMenu[]> {
  const tree = await getMenuTree(restaurantId);
  const limit = getPlan(plan).limits.menus;
  const counts = tree.map((m) => ({ id: m.id, name: m.name, items: m.categories.reduce((k, c) => k + c.items.length, 0) }));
  const empty = counts.filter((m) => m.items === 0);
  return draft.menus.map((m, idx) => {
    const same = counts.find((x) => x.name.trim().toLowerCase() === m.name.trim().toLowerCase());
    const target = same?.id ?? empty[idx]?.id ?? (counts.length + idx >= limit ? (counts[0]?.id ?? null) : null);
    return { ...m, targetMenuId: target };
  });
}

/** Applies the kit's import draft unchanged (edits happen in the import preview). */
export async function applyKitImport(opts: { restaurantId: string; userId: string; jobId: string; allergenMode?: KitAllergenMode }) {
  const r = await restaurantRow(opts.restaurantId);
  const j = await getKitJobRow(opts.restaurantId, opts.jobId);
  const importId = kitResult(j).importId;
  if (!importId) throw new AppError("notFound");
  const [row] = await db.select().from(menuImports).where(and(eq(menuImports.id, importId), eq(menuImports.restaurantId, opts.restaurantId))).limit(1);
  if (!row) throw new AppError("notFound");
  if (row.status === "applied") return null; // idempotent ("Alles übernehmen" twice)
  if (row.status !== "ready" || !row.result) throw new AppError("validation", "status");
  const menus = await draftWithTargets(opts.restaurantId, r.plan, row.result as ImportDraft);
  // Allergen codes stay suggestions (review tasks) unless the owner explicitly confirmed the printed declaration –
  // the same choice as in the import preview.
  return applyImport({ restaurantId: opts.restaurantId, userId: opts.userId, importId, menus, confirmAllergens: opts.allergenMode === "confirm" });
}

/** "Als Design aktivieren": publishes the latest version of the kit theme and activates it for guests. */
export async function activateKitTheme(opts: { restaurantId: string; userId: string; jobId: string }) {
  const j = await getKitJobRow(opts.restaurantId, opts.jobId);
  const themeId = kitResult(j).themeId;
  if (!themeId) throw new AppError("notFound");
  const r = await restaurantRow(opts.restaurantId);
  const { versionId, pkg } = await getThemeWithPackage(opts.restaurantId, themeId);
  const wasActive = parseStudioThemeId(r.themeId) === themeId;
  await publishTheme({ restaurantId: opts.restaurantId, themeId, versionId, userId: opts.userId });
  await writeThemeConfig(opts.restaurantId, sanitizeSettings(pkg.manifest, wasActive ? r.themeConfig : {}));
}

/** "Als Druckdesign verwenden": publishes the latest version of the kit print design and selects it for printing. */
export async function selectKitPrint(opts: { restaurantId: string; userId: string; jobId: string }) {
  const j = await getKitJobRow(opts.restaurantId, opts.jobId);
  const themeId = kitResult(j).printThemeId;
  if (!themeId) throw new AppError("notFound");
  const { versionId } = await getThemeWithPackage(opts.restaurantId, themeId);
  await publishTheme({ restaurantId: opts.restaurantId, themeId, versionId, userId: opts.userId });
}

/** "Andere Datei wählen" for the logo (own image media only). null removes the logo. */
export async function setKitLogo(opts: { restaurantId: string; userId: string; mediaId: string | null }) {
  if (opts.mediaId) {
    const [m] = await db.select({ mime: media.mime }).from(media).where(and(eq(media.id, opts.mediaId), eq(media.restaurantId, opts.restaurantId))).limit(1);
    if (!m) throw new AppError("notFound");
    if (!m.mime.startsWith("image/")) throw new AppError("validation", "mime");
  }
  await patchSettings(opts.restaurantId, { logoMediaId: opts.mediaId });
  await audit({ restaurantId: opts.restaurantId, userId: opts.userId, action: "settings.logo", data: { mediaId: opts.mediaId, via: "kit" } });
}

// ------------------------------------------------------------------ reuse in the design dialogs

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Stored source documents (thumbnails) + whether a kit brief for exactly these files exists. */
export async function getStoredSources(restaurantId: string): Promise<{ files: KitJobDto["files"]; hasBrief: boolean }> {
  const docs = await listSourceDocuments(restaurantId);
  if (!docs.length) return { files: [], hasBrief: false };
  const kb = await getLatestKitBrief(restaurantId);
  return {
    files: docs.map((d) => ({ id: d.id, mime: d.mime, thumb: d.thumb, url: d.url })),
    hasBrief: !!kb && sameSet(kb.mediaIds, docs.map((d) => d.id)),
  };
}

/**
 * New menu theme / print design from the STORED menu (no new upload). Reuses the kit's design brief when it was made
 * from exactly these files – otherwise one analysis call on the page renders (or the files themselves).
 */
export async function generateFromStoredSources(opts: {
  restaurantId: string;
  userId: string;
  locale: string;
  kind: ThemeKind;
  format?: PrintFormat;
  notes?: string;
}): Promise<GenerateResult & { briefReused: boolean }> {
  const ids = await getSourceDocuments(opts.restaurantId);
  if (!ids.length) throw new AppError("validation", "noSources");
  const kb = await getLatestKitBrief(opts.restaurantId);
  const reuse = !!kb && sameSet(kb.mediaIds, ids);

  let pageIds = reuse ? kb!.pageMediaIds : [];
  if (!pageIds.length) pageIds = await getPageImages(opts.restaurantId, ids, { maxPages: 6, userId: opts.userId }).then((p) => p.map((x) => x.mediaId)).catch(() => []);
  const files = pageIds.length
    ? await mediaToParts(opts.restaurantId, pageIds.slice(0, 6), { allowPdf: false })
    : await mediaToParts(opts.restaurantId, ids.slice(0, 6), { allowPdf: true });

  let brief: DesignBrief;
  if (reuse) brief = kb!.brief;
  else brief = (await analyzeDesignFiles({ restaurantId: opts.restaurantId, userId: opts.userId, mediaIds: [], notes: opts.notes, locale: opts.locale, files, kind: opts.kind })).brief;

  const common = { restaurantId: opts.restaurantId, userId: opts.userId, locale: opts.locale, brief, notes: opts.notes, referenceImages: files.imageParts.slice(0, 3), origin: "ai_file" as const };
  const res = opts.kind === "print" ? await generatePrintTheme({ ...common, format: opts.format ?? "a6" }) : await generateTheme(common);
  await audit({
    restaurantId: opts.restaurantId,
    userId: opts.userId,
    action: "theme.ai.generate",
    entityType: "theme",
    entityId: res.themeId,
    data: { kind: opts.kind, ...(opts.kind === "print" ? { format: opts.format } : {}), origin: "ai_file", via: "stored_sources", briefReused: reuse, files: ids.length, model: res.model, repaired: res.repaired, bytes: res.bytes },
  });
  return { ...res, briefReused: reuse };
}
