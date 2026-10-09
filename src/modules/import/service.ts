import "server-only";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/core/db";
import { media, menuImports, reviewTasks } from "@/core/db/schema";
import { aiJson, type ContentPart } from "@/core/ai";
import { AppError } from "@/core/http/errors";
import { audit } from "@/core/audit";
import { mediaUrl } from "@/core/storage";
import { mediaSrc, readMediaBuffer } from "@/core/storage/media";
import { ADDITIVE_CODES, ALLERGEN_CODES, DIET_TAGS } from "@/modules/allergens/catalog";
import * as menu from "@/modules/menu/service";
import { EXTRACT_SYSTEM_PROMPT, extractionSchema, type Extraction } from "./schema";
import type { ApplyImportResult, DraftMenu, ImportDraft, ImportDto, ImportStatus } from "./types";

/**
 * AI menu import: photos / PDFs of the paper menu → `menu_extract` → editable draft → menu service.
 * Allergen marks only ever become suggestions (review tasks), never confirmed allergens.
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

/** Normalizes the model output into an editable draft (keys for React, codes filtered to the catalog). */
export function toDraft(x: Extraction, model: string | null): ImportDraft {
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
              return {
                key: nanoid(8),
                name: clean(i.name, 200)!,
                description: clean(i.description, 1000),
                priceCents,
                variants,
                marks: [...new Set((i.marks ?? []).map((s) => s.trim()).filter(Boolean))].slice(0, 30),
                allergenHints: [...new Set((i.allergenHints ?? []).map((s) => s.trim().toLowerCase()))].filter((c) => ALLERGEN_SET.has(c)),
                additiveHints: [...new Set((i.additiveHints ?? []).map((s) => s.trim().toLowerCase()))].filter((c) => ADDITIVE_SET.has(c)),
                tags: [...new Set((i.tags ?? []).map((s) => s.trim().toLowerCase()))].filter((t) => TAG_SET.has(t)),
              };
            }),
        }))
        .filter((c) => c.items.length),
    }))
    .filter((m) => m.categories.length);
  return { menus, notes: clean(x.notes, 1000), model };
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
export async function runExtraction(restaurantId: string, userId: string, importId: string): Promise<ImportDto> {
  const row = await getOwnImport(restaurantId, importId);
  if (row.status === "applied" || row.status === "discarded") throw new AppError("validation", "status");
  await db.update(menuImports).set({ status: "processing", error: null, createdAt: new Date() }).where(eq(menuImports.id, importId));
  try {
    const parts = await filesToParts(restaurantId, row.mediaIds);
    const { data, model } = await aiJson(
      "menu_extract",
      {
        messages: [
          { role: "system", content: EXTRACT_SYSTEM_PROMPT },
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

export async function applyImport(opts: { restaurantId: string; userId: string; importId: string; menus: DraftMenu[] }): Promise<ApplyImportResult> {
  const { restaurantId, userId } = opts;
  const row = await getOwnImport(restaurantId, opts.importId);
  if (row.status !== "ready") throw new AppError("validation", "status");
  const draft: ImportDraft = { menus: opts.menus, notes: (row.result as ImportDraft | null)?.notes ?? null, model: (row.result as ImportDraft | null)?.model ?? null };
  const total = countDraftItems(draft);
  if (!total) throw new AppError("validation", "empty");
  await menu.assertItemLimit(restaurantId, total);

  return db.transaction(async (tx) => {
    const result: ApplyImportResult = { menus: 0, categories: 0, items: 0, reviewTasks: 0 };
    let firstMenuId: string | null = null;
    for (const m of draft.menus) {
      const cats = m.categories.filter((c) => c.items.length);
      if (!cats.length) continue;
      let menuId = m.targetMenuId;
      if (menuId) await menu.getMenu(restaurantId, menuId, tx);
      else {
        const created = await menu.createMenu(restaurantId, { name: m.name.trim() || "Speisekarte" }, tx);
        menuId = created.id;
        result.menus++;
      }
      firstMenuId ??= menuId;
      for (const c of cats) {
        const cat = await menu.createCategory(restaurantId, { menuId, name: c.name.trim() || "Sonstiges", description: c.description }, tx);
        result.categories++;
        for (const i of c.items) {
          const it = await menu.createItem(
            restaurantId,
            cat.id,
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
          if (allergenHints.length || additiveHints.length || i.marks.length) {
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
      .set({ status: "applied", appliedAt: new Date(), result: draft, targetMenuId: firstMenuId })
      .where(eq(menuImports.id, row.id));
    await audit(
      { restaurantId, userId, action: "ai.import.apply", entityType: "menu_import", entityId: row.id, data: { ...result } },
      tx,
    );
    return result;
  });
}
