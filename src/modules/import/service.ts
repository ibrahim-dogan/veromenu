import "server-only";
import { languageName } from "@/core/i18n/locales";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/core/db";
import { categories, items, media, menuImports, reviewTasks } from "@/core/db/schema";
import { aiJson, type ContentPart } from "@/core/ai";
import { AppError } from "@/core/http/errors";
import { audit } from "@/core/audit";
import { mediaUrl } from "@/core/storage";
import { mediaSrc, readMediaBuffer } from "@/core/storage/media";
import { ADDITIVE_CODES, ALLERGEN_CODES, DIET_TAGS } from "@/modules/allergens/catalog";
import * as menu from "@/modules/menu/service";
import { setSourceDocuments } from "@/modules/documents";
import { cleanLegend, detectScheme, mapMarks, splitMarks } from "./marks";
import { EXTRACT_SYSTEM_PROMPT, extractionSchema, type Extraction } from "./schema";
import type { ApplyImportResult, DraftMenu, ImportDraft, ImportDto, ImportStatus } from "./types";

/**
 * AI menu import: photos / PDFs of the paper menu → `menu_extract` → editable draft → menu service.
 * Printed allergen marks are mapped to catalog codes (legend or German standard scheme, see marks.ts). They are
 * only stored as CONFIRMED when the owner explicitly states they checked them; otherwise they become review tasks.
 */

export const MAX_IMPORT_FILES = 10;
const MAX_IMAGE_EDGE = 2000;
const MAX_PDF_BYTES_TOTAL = 18 * 1024 * 1024;
/** An import still "processing" after this long was interrupted (server restart, closed tab …). */
export const STALE_PROCESSING_MS = 5 * 60_000;

type Row = typeof menuImports.$inferSelect;

const ALLERGEN_SET = new Set(ALLERGEN_CODES);
const ADDITIVE_SET = new Set(ADDITIVE_CODES);
const TAG_SET = new Set<string>(DIET_TAGS);
const sanePrice = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(100_000, Math.round(n))));
const clean = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

const codesOf = (xs: string[] | undefined, allowed: Set<string>) => [...new Set((xs ?? []).map((s) => s.trim().toLowerCase()))].filter((c) => allowed.has(c));

/**
 * Normalizes the model output into an editable draft (keys for React, codes filtered to the catalog).
 * Allergen/additive codes are derived deterministically from the printed marks: printed legend → legend,
 * else the German standard scheme when it is evident for the whole menu, else nothing (raw marks only).
 */
export function toDraft(x: Extraction, model: string | null): ImportDraft {
  const legend = cleanLegend(x.legend ?? []);
  const allMarks = x.menus.flatMap((m) => m.categories.flatMap((c) => c.items.flatMap((i) => i.marks ?? [])));
  const markScheme = detectScheme(allMarks, legend);
  const menus: DraftMenu[] = x.menus
    .map((m) => ({
      key: nanoid(8),
      name: clean(m.name, 200) ?? "Speisekarte",
      targetMenuId: null,
      categories: m.categories
        .map((c) => ({
          key: nanoid(8),
          name: clean(c.name, 200) ?? "Sonstiges",
          description: clean(c.description, 1000),
          items: c.items
            .filter((i) => clean(i.name, 200))
            .map((i) => {
              const variants = (i.variants ?? [])
                .map((v) => ({ name: clean(v.name, 80) ?? "", priceCents: sanePrice(v.priceCents) }))
                .filter((v): v is { name: string; priceCents: number } => !!v.name && v.priceCents != null)
                .slice(0, 20);
              let priceCents = sanePrice(i.priceCents);
              if (priceCents == null && variants.length) priceCents = Math.min(...variants.map((v) => v.priceCents));
              const marks = splitMarks(i.marks ?? []).slice(0, 30);
              let codes = mapMarks(marks, markScheme, legend);
              // Legend printed but the item's marks were not in it → fall back to the model's legend-based mapping.
              if (markScheme === "legend" && marks.length && !codes.allergens.length && !codes.additives.length)
                codes = { allergens: codesOf(i.allergenHints, ALLERGEN_SET), additives: codesOf(i.additiveHints, ADDITIVE_SET) };
              return {
                key: nanoid(8),
                name: clean(i.name, 200)!,
                description: clean(i.description, 1000),
                priceCents,
                variants,
                marks,
                allergenHints: codes.allergens,
                additiveHints: codes.additives,
                tags: [...new Set((i.tags ?? []).map((s) => s.trim().toLowerCase()))].filter((t) => TAG_SET.has(t)),
              };
            }),
        }))
        .filter((c) => c.items.length),
    }))
    .filter((m) => m.categories.length);
  return { menus, notes: clean(x.notes, 1000), model, legend, markScheme };
}

export const countDraftItems = (d: ImportDraft | null) => d?.menus.reduce((n, m) => n + m.categories.reduce((k, c) => k + c.items.length, 0), 0) ?? 0;

// ------------------------------------------------------------------ reads

async function toDto(r: Row): Promise<ImportDto> {
  const files = r.mediaIds.length ? await db.select().from(media).where(inArray(media.id, r.mediaIds)) : [];
  const byId = new Map(files.map((f) => [f.id, f]));
  const draft = (r.result as ImportDraft | null) ?? null;
  let status = r.status as ImportStatus;
  let error = r.error;
  if (status === "processing" && Date.now() - r.createdAt.getTime() > STALE_PROCESSING_MS) {
    status = "failed";
    error = error ?? "interrupted";
  }
  return {
    id: r.id,
    status,
    draft,
    error,
    files: r.mediaIds
      .map((id) => byId.get(id))
      .filter((f) => !!f)
      .map((f) => ({ id: f.id, mime: f.mime, thumb: f.mime.startsWith("image/") ? mediaSrc(f, "sm") : null, url: mediaUrl(f.storageKey)! })),
    createdAt: r.createdAt.toISOString(),
    appliedAt: r.appliedAt?.toISOString() ?? null,
    itemCount: countDraftItems(draft),
  };
}

export async function listImports(restaurantId: string, limit = 10): Promise<ImportDto[]> {
  const rows = await db.select().from(menuImports).where(eq(menuImports.restaurantId, restaurantId)).orderBy(desc(menuImports.createdAt)).limit(limit);
  return Promise.all(rows.map(toDto));
}

async function getOwnImport(restaurantId: string, id: string) {
  const [row] = await db.select().from(menuImports).where(and(eq(menuImports.id, id), eq(menuImports.restaurantId, restaurantId))).limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

// ------------------------------------------------------------------ create + extract

export async function createImport(restaurantId: string, userId: string, mediaIds: string[]) {
  const unique = [...new Set(mediaIds)];
  if (!unique.length || unique.length > MAX_IMPORT_FILES) throw new AppError("validation", "files");
  const rows = await db
    .select({ id: media.id, mime: media.mime })
    .from(media)
    .where(and(inArray(media.id, unique), eq(media.restaurantId, restaurantId)));
  if (rows.length !== unique.length) throw new AppError("notFound");
  const [row] = await db.insert(menuImports).values({ restaurantId, mediaIds: unique, createdBy: userId, status: "processing" }).returning();
  // The uploaded menu becomes the restaurant's source document set (reused for logo, themes, print designs, re-imports).
  await setSourceDocuments(restaurantId, unique, "replace");
  return row.id;
}

/** Builds the multimodal message parts: images downscaled to ≤2000 px JPEG, PDFs as file parts. */
async function filesToParts(restaurantId: string, mediaIds: string[]): Promise<ContentPart[]> {
  const rows = await db.select().from(media).where(and(inArray(media.id, mediaIds), eq(media.restaurantId, restaurantId)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const parts: ContentPart[] = [];
  let pdfBytes = 0;
  for (const [idx, id] of mediaIds.entries()) {
    const m = byId.get(id);
    if (!m) continue;
    const buf = await readMediaBuffer(m);
    if (!buf) throw new AppError("notFound", "file missing");
    if (m.mime === "application/pdf") {
      pdfBytes += buf.length;
      if (pdfBytes > MAX_PDF_BYTES_TOTAL) throw new AppError("validation", "pdf too large");
      parts.push({ type: "file", file: { filename: `menu-${idx + 1}.pdf`, file_data: `data:application/pdf;base64,${buf.toString("base64")}` } });
    } else {
      let jpeg: Buffer;
      try {
        jpeg = await sharp(buf, { failOn: "none" })
          .rotate()
          .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch {
        throw new AppError("validation", "image");
      }
      parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } });
    }
  }
  return parts;
}

/** Runs the extraction (30–90 s). Status ends as `ready` or `failed`; never throws for AI failures. */
export async function runExtraction(restaurantId: string, userId: string, importId: string, replyLocale?: string): Promise<ImportDto> {
  const row = await getOwnImport(restaurantId, importId);
  if (row.status === "applied" || row.status === "discarded") throw new AppError("validation", "status");
  await db.update(menuImports).set({ status: "processing", error: null, createdAt: new Date() }).where(eq(menuImports.id, importId));
  try {
    const parts = await filesToParts(restaurantId, row.mediaIds);
    const { data, model } = await aiJson(
      "menu_extract",
      {
        messages: [
          { role: "system", content: `${EXTRACT_SYSTEM_PROMPT}\nWrite "notes" in ${languageName(replyLocale)} (the owner's dashboard language).` },
          {
            role: "user",
            content: [{ type: "text", text: `Extract the complete menu from these ${parts.length} page(s).` }, ...parts],
          },
        ],
        maxTokens: 16000,
      },
      extractionSchema,
      { restaurantId, userId },
      "menu",
    );
    const draft = toDraft(data, model);
    const ok = countDraftItems(draft) > 0;
    const [updated] = await db
      .update(menuImports)
      .set({ status: ok ? "ready" : "failed", result: draft, error: ok ? null : "empty" })
      .where(eq(menuImports.id, importId))
      .returning();
    return toDto(updated);
  } catch (e) {
    const code = e instanceof AppError ? e.code : "unexpected";
    console.error("[import] extraction failed", e);
    const [updated] = await db.update(menuImports).set({ status: "failed", error: code }).where(eq(menuImports.id, importId)).returning();
    if (e instanceof AppError && (e.code === "aiCreditsExhausted" || e.code === "aiNotConfigured")) throw e;
    return toDto(updated);
  }
}

export async function discardImport(restaurantId: string, importId: string) {
  const row = await getOwnImport(restaurantId, importId);
  if (row.status === "applied") throw new AppError("validation", "status");
  await db.update(menuImports).set({ status: "discarded" }).where(eq(menuImports.id, importId));
}

// ------------------------------------------------------------------ apply

/** Case/space-insensitive name key for duplicate detection. */
const norm = (s: string) => s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Creates the menus/categories/items of the draft. `confirmAllergens` = the owner ticked "Allergen-Angaben aus
 * unserer Karte übernehmen – wir haben sie geprüft": items with codes are stored as confirmed (by this user);
 * items whose marks could not be mapped get a review task; items without marks stay "unknown".
 * Without the tick every item with marks/codes gets a review task (suggestions only).
 */
export async function applyImport(opts: {
  restaurantId: string;
  userId: string;
  importId: string;
  menus: DraftMenu[];
  confirmAllergens?: boolean;
}): Promise<ApplyImportResult> {
  const { restaurantId, userId } = opts;
  const confirm = opts.confirmAllergens === true;
  const row = await getOwnImport(restaurantId, opts.importId);
  if (row.status !== "ready") throw new AppError("validation", "status");
  const prev = (row.result as ImportDraft | null) ?? null;
  const draft: ImportDraft = {
    menus: opts.menus,
    notes: prev?.notes ?? null,
    model: prev?.model ?? null,
    legend: prev?.legend ?? [],
    markScheme: prev?.markScheme ?? "none",
  };
  const total = countDraftItems(draft);
  if (!total) throw new AppError("validation", "empty");

  return db.transaction(async (tx) => {
    const result: ApplyImportResult = {
      menus: 0,
      categories: 0,
      items: 0,
      reviewTasks: 0,
      allergensConfirmed: 0,
      skippedDuplicates: 0,
      mergedCategories: 0,
      menuIds: [],
    };
    // Importing into an existing menu MERGES: a category with the same name is reused and dishes whose name
    // already exists there are skipped – re-importing the same card never duplicates the menu.
    const existingByMenu = new Map<string, Map<string, { id: string; itemNames: Set<string> }>>();
    const targetIds = [...new Set(draft.menus.map((m) => m.targetMenuId).filter((x): x is string => !!x))];
    for (const id of targetIds) {
      await menu.getMenu(restaurantId, id, tx);
      const cats = await tx.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.menuId, id)).orderBy(asc(categories.sort));
      const its = cats.length
        ? await tx.select({ categoryId: items.categoryId, name: items.name }).from(items).where(inArray(items.categoryId, cats.map((c) => c.id)))
        : [];
      const byName = new Map<string, { id: string; itemNames: Set<string> }>();
      for (const c of cats) {
        const k = norm(c.name);
        if (!byName.has(k)) byName.set(k, { id: c.id, itemNames: new Set() });
      }
      for (const it of its) {
        for (const entry of byName.values()) if (entry.id === it.categoryId) entry.itemNames.add(norm(it.name));
      }
      existingByMenu.set(id, byName);
    }
    const isDuplicate = (menuId: string | null, catName: string, itemName: string) =>
      !!menuId && !!existingByMenu.get(menuId)?.get(norm(catName))?.itemNames.has(norm(itemName));
    // Plan limit counts only dishes that will really be created.
    const toCreate = draft.menus.reduce(
      (n, m) => n + m.categories.reduce((k, c) => k + c.items.filter((i) => !isDuplicate(m.targetMenuId, c.name, i.name)).length, 0),
      0,
    );
    if (toCreate) await menu.assertItemLimit(restaurantId, toCreate, tx);

    for (const m of draft.menus) {
      const cats = m.categories.filter((c) => c.items.length);
      if (!cats.length) continue;
      let menuId = m.targetMenuId;
      if (!menuId) {
        const created = await menu.createMenu(restaurantId, { name: m.name.trim() || "Speisekarte" }, tx);
        menuId = created.id;
        result.menus++;
      }
      if (!result.menuIds.includes(menuId)) result.menuIds.push(menuId);
      const existing = existingByMenu.get(menuId);
      for (const c of cats) {
        const catName = c.name.trim() || "Sonstiges";
        const match = existing?.get(norm(catName));
        let catId: string;
        if (match) {
          catId = match.id;
          result.mergedCategories++;
        } else {
          const cat = await menu.createCategory(restaurantId, { menuId, name: catName, description: c.description }, tx);
          catId = cat.id;
          existing?.set(norm(catName), { id: catId, itemNames: new Set() });
          result.categories++;
        }
        const seen = existing?.get(norm(catName))?.itemNames;
        for (const i of c.items) {
          if (seen?.has(norm(i.name))) {
            result.skippedDuplicates++;
            continue;
          }
          seen?.add(norm(i.name));
          const it = await menu.createItem(
            restaurantId,
            catId,
            {
              name: i.name.trim(),
              description: i.description,
              priceCents: i.priceCents,
              tags: i.tags.filter((t) => TAG_SET.has(t)),
              variants: i.variants,
            },
            tx,
          );
          result.items++;
          const allergenHints = i.allergenHints.filter((x) => ALLERGEN_SET.has(x));
          const additiveHints = i.additiveHints.filter((x) => ADDITIVE_SET.has(x));
          if (confirm && (allergenHints.length || additiveHints.length)) {
            // The owner confirmed the printed declaration in the preview (LMIV: human decision, recorded with who/when).
            await menu.setItemAllergens(restaurantId, it.id, { allergens: allergenHints, additives: additiveHints, status: "confirmed", userId }, tx);
            result.allergensConfirmed++;
          } else if (allergenHints.length || additiveHints.length || i.marks.length) {
            // Suggestions only – a human confirms allergens in the review queue (LMIV).
            await tx.insert(reviewTasks).values({
              restaurantId,
              kind: "menu_import",
              entityType: "item",
              entityId: it.id,
              title: it.name,
              reason: "allergen_hints_from_import",
              payload: { importId: row.id, marks: i.marks, allergenHints, additiveHints },
            });
            result.reviewTasks++;
          }
        }
      }
    }
    await tx
      .update(menuImports)
      .set({ status: "applied", appliedAt: new Date(), result: draft, targetMenuId: result.menuIds[0] ?? null })
      .where(eq(menuImports.id, row.id));
    await audit(
      {
        restaurantId,
        userId,
        action: "ai.import.apply",
        entityType: "menu_import",
        entityId: row.id,
        data: { ...result, allergensConfirmedByOwner: confirm, markScheme: draft.markScheme },
      },
      tx,
    );
    return result;
  });
}
