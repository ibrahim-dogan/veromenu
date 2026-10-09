import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/core/db";
import { categories, itemVariants, items, menus, type TranslatableEntity } from "@/core/db/schema";
import { sha256 } from "@/core/crypto";

/**
 * Source texts of a restaurant that can be translated.
 * A "unit" is one (entity, field) pair, identified by a stable key "type:id:field".
 */
export type TranslatableField = "name" | "description";
export type SourceUnit = {
  key: string;
  entityType: TranslatableEntity;
  entityId: string;
  field: TranslatableField;
  text: string;
  hash: string;
  /** Human-readable context for the translator / UI (e.g. category name for an item). */
  context: string | null;
  /** Kind used in prompts and UI grouping. */
  kind: "menu" | "category" | "item" | "variant";
  sort: number;
};

/** Normalised hash of a source text – whitespace-only edits do not make translations stale. */
export const hashSource = (text: string) => sha256(text.trim().replace(/\s+/g, " "));

export const unitKey = (entityType: string, entityId: string, field: string) => `${entityType}:${entityId}:${field}`;

export function parseUnitKey(key: string): { entityType: TranslatableEntity; entityId: string; field: TranslatableField } | null {
  const m = /^(menu|category|item|variant):([0-9a-f-]{36}):(name|description)$/i.exec(key);
  if (!m) return null;
  return { entityType: m[1] as TranslatableEntity, entityId: m[2], field: m[3] as TranslatableField };
}

function push(out: SourceUnit[], u: Omit<SourceUnit, "key" | "hash">) {
  const text = u.text?.trim();
  if (!text) return;
  out.push({ ...u, text, key: unitKey(u.entityType, u.entityId, u.field), hash: hashSource(text) });
}

/** All translatable source units of a restaurant in menu order. */
export async function collectSourceUnits(restaurantId: string, tx: DbOrTx = db): Promise<SourceUnit[]> {
  const [ms, cs, is] = await Promise.all([
    tx.select().from(menus).where(eq(menus.restaurantId, restaurantId)).orderBy(asc(menus.sort), asc(menus.createdAt)),
    tx.select().from(categories).where(eq(categories.restaurantId, restaurantId)).orderBy(asc(categories.sort), asc(categories.createdAt)),
    tx.select().from(items).where(eq(items.restaurantId, restaurantId)).orderBy(asc(items.sort), asc(items.createdAt)),
  ]);
  const vs = is.length
    ? await tx.select().from(itemVariants).where(inArray(itemVariants.itemId, is.map((i) => i.id))).orderBy(asc(itemVariants.sort))
    : [];

  const out: SourceUnit[] = [];
  let sort = 0;
  for (const m of ms) {
    push(out, { entityType: "menu", entityId: m.id, field: "name", text: m.name, context: null, kind: "menu", sort: sort++ });
    push(out, { entityType: "menu", entityId: m.id, field: "description", text: m.description ?? "", context: m.name, kind: "menu", sort: sort++ });
    for (const c of cs.filter((c) => c.menuId === m.id)) {
      push(out, { entityType: "category", entityId: c.id, field: "name", text: c.name, context: m.name, kind: "category", sort: sort++ });
      push(out, { entityType: "category", entityId: c.id, field: "description", text: c.description ?? "", context: c.name, kind: "category", sort: sort++ });
      for (const it of is.filter((i) => i.categoryId === c.id)) {
        push(out, { entityType: "item", entityId: it.id, field: "name", text: it.name, context: c.name, kind: "item", sort: sort++ });
        push(out, { entityType: "item", entityId: it.id, field: "description", text: it.description ?? "", context: it.name, kind: "item", sort: sort++ });
        for (const v of vs.filter((v) => v.itemId === it.id)) {
          push(out, { entityType: "variant", entityId: v.id, field: "name", text: v.name, context: it.name, kind: "variant", sort: sort++ });
        }
      }
    }
  }
  return out;
}

/** Current source texts of one entity (used by the hooks). */
export async function loadEntityTexts(
  tx: DbOrTx,
  entityType: TranslatableEntity,
  entityId: string,
): Promise<Partial<Record<TranslatableField, string | null>> | null> {
  switch (entityType) {
    case "menu": {
      const [r] = await tx.select({ name: menus.name, description: menus.description }).from(menus).where(eq(menus.id, entityId)).limit(1);
      return r ?? null;
    }
    case "category": {
      const [r] = await tx
        .select({ name: categories.name, description: categories.description })
        .from(categories)
        .where(eq(categories.id, entityId))
        .limit(1);
      return r ?? null;
    }
    case "item": {
      const [r] = await tx.select({ name: items.name, description: items.description }).from(items).where(eq(items.id, entityId)).limit(1);
      return r ?? null;
    }
    case "variant": {
      const [r] = await tx.select({ name: itemVariants.name }).from(itemVariants).where(eq(itemVariants.id, entityId)).limit(1);
      return r ?? null;
    }
    default:
      return null;
  }
}
