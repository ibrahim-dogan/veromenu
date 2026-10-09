import "server-only";
import { and, asc, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, type DbOrTx } from "@/core/db";
import { categories, items, itemVariants, menus, restaurants } from "@/core/db/schema";
import { AppError } from "@/core/http/errors";
import { getPlan } from "@/modules/billing/plans";
import { onEntityDeleted, onSourceTextChanged } from "@/modules/translations/hooks";

/**
 * Menu domain service – the single write path for menus, categories, items and variants.
 * Used by dashboard actions, the AI agent (change sets) and the menu import.
 * Every function takes an optional transaction and enforces restaurant scoping.
 */

export type Menu = typeof menus.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Variant = typeof itemVariants.$inferSelect;

export type ItemInput = {
  name: string;
  description?: string | null;
  ingredients?: string | null;
  priceCents?: number | null;
  imageMediaId?: string | null;
  isVisible?: boolean;
  isAvailable?: boolean;
  tags?: string[];
  variants?: { name: string; priceCents: number }[];
};

const TEXT_FIELDS = ["name", "description"] as const;

// ------------------------------------------------------------------ reads

export type MenuTree = (Menu & { categories: (Category & { items: (Item & { variants: Variant[] })[] })[] })[];

/** Full menu tree for a restaurant (dashboard + guest view), sorted. */
export async function getMenuTree(restaurantId: string, tx: DbOrTx = db): Promise<MenuTree> {
  const [ms, cs, is] = await Promise.all([
    tx.select().from(menus).where(eq(menus.restaurantId, restaurantId)).orderBy(asc(menus.sort), asc(menus.createdAt)),
    tx.select().from(categories).where(eq(categories.restaurantId, restaurantId)).orderBy(asc(categories.sort), asc(categories.createdAt)),
    tx.select().from(items).where(eq(items.restaurantId, restaurantId)).orderBy(asc(items.sort), asc(items.createdAt)),
  ]);
  const vs = is.length
    ? await tx.select().from(itemVariants).where(inArray(itemVariants.itemId, is.map((i) => i.id))).orderBy(asc(itemVariants.sort))
    : [];
  return ms.map((m) => ({
    ...m,
    categories: cs
      .filter((c) => c.menuId === m.id)
      .map((c) => ({
        ...c,
        items: is.filter((i) => i.categoryId === c.id).map((i) => ({ ...i, variants: vs.filter((v) => v.itemId === i.id) })),
      })),
  }));
}

async function own<T extends { restaurantId: string }>(row: T | undefined, restaurantId: string): Promise<T> {
  if (!row || row.restaurantId !== restaurantId) throw new AppError("notFound");
  return row;
}

export async function getItem(restaurantId: string, itemId: string, tx: DbOrTx = db) {
  const [row] = await tx.select().from(items).where(eq(items.id, itemId)).limit(1);
  return own(row, restaurantId);
}
export async function getCategory(restaurantId: string, categoryId: string, tx: DbOrTx = db) {
  const [row] = await tx.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  return own(row, restaurantId);
}
export async function getMenu(restaurantId: string, menuId: string, tx: DbOrTx = db) {
  const [row] = await tx.select().from(menus).where(eq(menus.id, menuId)).limit(1);
  return own(row, restaurantId);
}

// ------------------------------------------------------------------ limits

async function planOf(restaurantId: string, tx: DbOrTx) {
  const [r] = await tx.select({ plan: restaurants.plan }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  return getPlan(r?.plan);
}

export async function assertItemLimit(restaurantId: string, adding = 1, tx: DbOrTx = db) {
  const plan = await planOf(restaurantId, tx);
  const [c] = await tx.select({ n: dsql<number>`count(*)::int` }).from(items).where(eq(items.restaurantId, restaurantId));
  if (c.n + adding > plan.limits.items) throw new AppError("planLimit", `items ${plan.limits.items}`);
}
async function assertMenuLimit(restaurantId: string, tx: DbOrTx) {
  const plan = await planOf(restaurantId, tx);
  const [c] = await tx.select({ n: dsql<number>`count(*)::int` }).from(menus).where(eq(menus.restaurantId, restaurantId));
  if (c.n + 1 > plan.limits.menus) throw new AppError("planLimit", `menus ${plan.limits.menus}`);
}

const nextSort = async (tx: DbOrTx, table: typeof categories | typeof items | typeof menus, where: ReturnType<typeof eq>) => {
  const [r] = await tx.select({ m: dsql<number>`coalesce(max(${table.sort}), -1)::int` }).from(table).where(where);
  return r.m + 1;
};

// ------------------------------------------------------------------ menus

export async function createMenu(restaurantId: string, input: { name: string; description?: string | null }, tx: DbOrTx = db) {
  await assertMenuLimit(restaurantId, tx);
  const sort = await nextSort(tx, menus, eq(menus.restaurantId, restaurantId));
  const [m] = await tx.insert(menus).values({ restaurantId, name: input.name, description: input.description ?? null, sort }).returning();
  return m;
}

export async function updateMenu(
  restaurantId: string,
  menuId: string,
  patch: Partial<Pick<Menu, "name" | "description" | "isActive" | "schedule" | "pdfMediaIds" | "sort">>,
  tx: DbOrTx = db,
) {
  const before = await getMenu(restaurantId, menuId, tx);
  const [m] = await tx.update(menus).set({ ...patch, updatedAt: new Date() }).where(eq(menus.id, menuId)).returning();
  const changed = TEXT_FIELDS.filter((f) => f in patch && patch[f] !== before[f]);
  if (changed.length) await onSourceTextChanged(tx, restaurantId, "menu", menuId, changed);
  return m;
}

export async function deleteMenu(restaurantId: string, menuId: string, tx: DbOrTx = db) {
  await getMenu(restaurantId, menuId, tx);
  const cats = await tx.select({ id: categories.id }).from(categories).where(eq(categories.menuId, menuId));
  const its = cats.length
    ? await tx.select({ id: items.id }).from(items).where(inArray(items.categoryId, cats.map((c) => c.id)))
    : [];
  await tx.delete(menus).where(eq(menus.id, menuId));
  await onEntityDeleted(tx, "menu", [menuId]);
  await onEntityDeleted(tx, "category", cats.map((c) => c.id));
  await onEntityDeleted(tx, "item", its.map((i) => i.id));
}

// ------------------------------------------------------------------ categories

export async function createCategory(
  restaurantId: string,
  input: { menuId: string; name: string; description?: string | null; imageMediaId?: string | null; isVisible?: boolean },
  tx: DbOrTx = db,
) {
  await getMenu(restaurantId, input.menuId, tx);
  const sort = await nextSort(tx, categories, eq(categories.menuId, input.menuId));
  const [c] = await tx
    .insert(categories)
    .values({
      restaurantId,
      menuId: input.menuId,
      name: input.name,
      description: input.description ?? null,
      imageMediaId: input.imageMediaId ?? null,
      isVisible: input.isVisible ?? true,
      sort,
    })
    .returning();
  return c;
}

export async function updateCategory(
  restaurantId: string,
  categoryId: string,
  patch: Partial<Pick<Category, "name" | "description" | "imageMediaId" | "isVisible" | "menuId" | "sort">>,
  tx: DbOrTx = db,
) {
  const before = await getCategory(restaurantId, categoryId, tx);
  if (patch.menuId && patch.menuId !== before.menuId) await getMenu(restaurantId, patch.menuId, tx);
  const [c] = await tx.update(categories).set({ ...patch, updatedAt: new Date() }).where(eq(categories.id, categoryId)).returning();
  const changed = TEXT_FIELDS.filter((f) => f in patch && patch[f] !== before[f]);
  if (changed.length) await onSourceTextChanged(tx, restaurantId, "category", categoryId, changed);
  return c;
}

export async function deleteCategory(restaurantId: string, categoryId: string, tx: DbOrTx = db) {
  await getCategory(restaurantId, categoryId, tx);
  const its = await tx.select({ id: items.id }).from(items).where(eq(items.categoryId, categoryId));
  await tx.delete(categories).where(eq(categories.id, categoryId));
  await onEntityDeleted(tx, "category", [categoryId]);
  await onEntityDeleted(tx, "item", its.map((i) => i.id));
}

// ------------------------------------------------------------------ items

export async function createItem(restaurantId: string, categoryId: string, input: ItemInput, tx: DbOrTx = db) {
  await getCategory(restaurantId, categoryId, tx);
  await assertItemLimit(restaurantId, 1, tx);
  const sort = await nextSort(tx, items, eq(items.categoryId, categoryId));
  const [it] = await tx
    .insert(items)
    .values({
      restaurantId,
      categoryId,
      name: input.name,
      description: input.description ?? null,
      ingredients: input.ingredients ?? null,
      priceCents: input.priceCents ?? null,
      imageMediaId: input.imageMediaId ?? null,
      isVisible: input.isVisible ?? true,
      isAvailable: input.isAvailable ?? true,
      tags: input.tags ?? [],
      sort,
    })
    .returning();
  if (input.variants?.length) await setVariants(restaurantId, it.id, input.variants, tx);
  return it;
}

export type ItemPatch = Partial<
  Pick<Item, "name" | "description" | "ingredients" | "priceCents" | "imageMediaId" | "isVisible" | "isAvailable" | "tags" | "categoryId" | "sort">
>;

/**
 * Updates an item. If name/description/ingredients change on an item whose allergens were confirmed,
 * the allergen status falls back to "needs_review" (recipe may have changed → re-check, LMIV).
 */
export async function updateItem(restaurantId: string, itemId: string, patch: ItemPatch, tx: DbOrTx = db) {
  const before = await getItem(restaurantId, itemId, tx);
  if (patch.categoryId && patch.categoryId !== before.categoryId) await getCategory(restaurantId, patch.categoryId, tx);
  const recipeChanged = (["name", "description", "ingredients"] as const).some((f) => f in patch && patch[f] !== before[f]);
  const extra = recipeChanged && before.allergenStatus === "confirmed" ? { allergenStatus: "needs_review" as const } : {};
  const [it] = await tx.update(items).set({ ...patch, ...extra, updatedAt: new Date() }).where(eq(items.id, itemId)).returning();
  const changed = TEXT_FIELDS.filter((f) => f in patch && patch[f] !== before[f]);
  if (changed.length) await onSourceTextChanged(tx, restaurantId, "item", itemId, changed);
  return it;
}

/** Sets confirmed allergens/additives (human decision – records who confirmed). */
export async function confirmAllergens(
  restaurantId: string,
  itemId: string,
  input: { allergens: string[]; additives: string[]; userId: string },
  tx: DbOrTx = db,
) {
  await getItem(restaurantId, itemId, tx);
  const [it] = await tx
    .update(items)
    .set({
      allergens: input.allergens,
      additives: input.additives,
      allergenStatus: "confirmed",
      allergenConfirmedBy: input.userId,
      allergenConfirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(items.id, itemId))
    .returning();
  return it;
}

export async function deleteItem(restaurantId: string, itemId: string, tx: DbOrTx = db) {
  await getItem(restaurantId, itemId, tx);
  const vs = await tx.select({ id: itemVariants.id }).from(itemVariants).where(eq(itemVariants.itemId, itemId));
  await tx.delete(items).where(eq(items.id, itemId));
  await onEntityDeleted(tx, "item", [itemId]);
  await onEntityDeleted(tx, "variant", vs.map((v) => v.id));
}

/** Replaces all variants of an item (simple + predictable for forms and the AI agent). */
export async function setVariants(restaurantId: string, itemId: string, variants: { name: string; priceCents: number }[], tx: DbOrTx = db) {
  await getItem(restaurantId, itemId, tx);
  const old = await tx.select().from(itemVariants).where(eq(itemVariants.itemId, itemId)).orderBy(asc(itemVariants.sort));
  // Keep ids of variants whose name didn't change → their translations survive.
  const keep = new Map(old.map((v) => [v.name, v]));
  const used = new Set<string>();
  const rows: Variant[] = [];
  for (const [i, v] of variants.entries()) {
    const existing = keep.get(v.name);
    if (existing && !used.has(existing.id)) {
      used.add(existing.id);
      const [u] = await tx.update(itemVariants).set({ priceCents: v.priceCents, sort: i }).where(eq(itemVariants.id, existing.id)).returning();
      rows.push(u);
    } else {
      const [n] = await tx.insert(itemVariants).values({ itemId, name: v.name, priceCents: v.priceCents, sort: i }).returning();
      rows.push(n);
    }
  }
  const removed = old.filter((v) => !used.has(v.id)).map((v) => v.id);
  if (removed.length) {
    await tx.delete(itemVariants).where(inArray(itemVariants.id, removed));
    await onEntityDeleted(tx, "variant", removed);
  }
  return rows;
}

/** Reorders siblings: ids in the desired order. */
export async function reorder(restaurantId: string, kind: "menu" | "category" | "item", ids: string[], tx: DbOrTx = db) {
  const table = kind === "menu" ? menus : kind === "category" ? categories : items;
  for (const [i, id] of ids.entries()) {
    await tx
      .update(table)
      .set({ sort: i })
      .where(and(eq(table.id, id), eq(table.restaurantId, restaurantId)));
  }
}

/**
 * Puts the given items (in this order) into a category. Items coming from another category are moved
 * (same restaurant only); siblings are re-sorted. Used by drag & drop in the editor.
 */
export async function arrangeItems(restaurantId: string, categoryId: string, orderedIds: string[], tx: DbOrTx = db) {
  await getCategory(restaurantId, categoryId, tx);
  if (!orderedIds.length) return;
  const rows = await tx
    .select({ id: items.id, categoryId: items.categoryId })
    .from(items)
    .where(and(inArray(items.id, orderedIds), eq(items.restaurantId, restaurantId)));
  if (rows.length !== new Set(orderedIds).size) throw new AppError("notFound");
  for (const r of rows) if (r.categoryId !== categoryId) await updateItem(restaurantId, r.id, { categoryId }, tx);
  await reorder(restaurantId, "item", orderedIds, tx);
}

/** Copies an item (incl. variants, tags, image). Allergens are not copied – they must be confirmed per dish. */
export async function duplicateItem(restaurantId: string, itemId: string, nameSuffix: string, tx: DbOrTx = db) {
  const src = await getItem(restaurantId, itemId, tx);
  const vs = await tx.select().from(itemVariants).where(eq(itemVariants.itemId, itemId)).orderBy(asc(itemVariants.sort));
  const copy = await createItem(
    restaurantId,
    src.categoryId,
    {
      name: `${src.name} ${nameSuffix}`.trim(),
      description: src.description,
      ingredients: src.ingredients,
      priceCents: src.priceCents,
      imageMediaId: src.imageMediaId,
      isVisible: false,
      isAvailable: src.isAvailable,
      tags: src.tags,
      variants: vs.map((v) => ({ name: v.name, priceCents: v.priceCents })),
    },
    tx,
  );
  // place the copy right after the original
  const siblings = await tx
    .select({ id: items.id })
    .from(items)
    .where(eq(items.categoryId, src.categoryId))
    .orderBy(asc(items.sort), asc(items.createdAt));
  const ids = siblings.map((s) => s.id).filter((id) => id !== copy.id);
  ids.splice(ids.indexOf(src.id) + 1, 0, copy.id);
  await reorder(restaurantId, "item", ids, tx);
  return copy;
}

/** Guest presentation switch (digital menu vs. PDF/photo menu). Merges into settings, keeps other keys. */
export async function setMenuMode(restaurantId: string, mode: "digital" | "pdf", tx: DbOrTx = db) {
  await tx
    .update(restaurants)
    .set({ settings: dsql`${restaurants.settings} || jsonb_build_object('menuMode', ${mode}::text)`, updatedAt: new Date() })
    .where(eq(restaurants.id, restaurantId));
}

export async function countUsage(restaurantId: string, tx: DbOrTx = db) {
  const [[i], [m]] = await Promise.all([
    tx.select({ n: dsql<number>`count(*)::int` }).from(items).where(eq(items.restaurantId, restaurantId)),
    tx.select({ n: dsql<number>`count(*)::int` }).from(menus).where(eq(menus.restaurantId, restaurantId)),
  ]);
  return { items: i.n, menus: m.n };
}
