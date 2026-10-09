"use server";
import { z } from "zod";
import { and, eq, sql as dsql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/core/db";
import { reviewTasks } from "@/core/db/schema";
import { action, AppError, ForbiddenError } from "@/core/http/action";
import { assertRestaurantPermission, getRestaurantContext } from "@/core/auth/guards";
import type { Permission } from "@/core/auth/permissions";
import { audit } from "@/core/audit";
import { ADDITIVE_CODES, ALLERGEN_CODES, DIET_TAGS } from "@/modules/allergens/catalog";
import { assertOwnMediaIds } from "@/modules/media/service";
import * as svc from "./service";

const id = z.string().uuid();
const name = z.string().trim().min(1).max(120);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const cents = z.number().int().min(0).max(10_000_000);

async function assertAny(restaurantId: string, perms: Permission[]) {
  const ctx = await getRestaurantContext(restaurantId);
  if (!ctx || !perms.some((p) => ctx.can(p))) throw new ForbiddenError(`missing one of ${perms.join(",")}`);
  return ctx;
}

async function ownMedia(restaurantId: string, mediaId: string | null | undefined) {
  if (mediaId) await assertOwnMediaIds(restaurantId, [mediaId]);
}

// ------------------------------------------------------------------ menus

export const createMenuAction = action(
  z.object({ restaurantId: id, name, description: optText(500) }),
  async ({ restaurantId, name, description }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
    const m = await svc.createMenu(restaurantId, { name, description });
    await audit({ restaurantId, userId: ctx.user.id, action: "menu.create", entityType: "menu", entityId: m.id, data: { name } });
    return { id: m.id };
  },
);

export const updateMenuAction = action(
  z.object({ restaurantId: id, menuId: id, name: name.optional(), description: optText(500).optional(), isActive: z.boolean().optional() }),
  async ({ restaurantId, menuId, ...patch }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    await svc.updateMenu(restaurantId, menuId, clean);
    await audit({ restaurantId, userId: ctx.user.id, action: "menu.update", entityType: "menu", entityId: menuId, data: clean });
    return { id: menuId };
  },
);

export const deleteMenuAction = action(z.object({ restaurantId: id, menuId: id }), async ({ restaurantId, menuId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
  const m = await svc.getMenu(restaurantId, menuId);
  await db.transaction((tx) => svc.deleteMenu(restaurantId, menuId, tx));
  await audit({ restaurantId, userId: ctx.user.id, action: "menu.delete", entityType: "menu", entityId: menuId, data: { name: m.name } });
  return { id: menuId };
});

export const reorderMenusAction = action(z.object({ restaurantId: id, ids: z.array(id).max(100) }), async ({ restaurantId, ids }) => {
  await assertRestaurantPermission(restaurantId, "menu.edit");
  await db.transaction((tx) => svc.reorder(restaurantId, "menu", ids, tx));
  return { ok: true };
});

/** PDF / photo menu: ordered media ids of a menu. */
export const setMenuPdfMediaAction = action(
  z.object({ restaurantId: id, menuId: id, mediaIds: z.array(id).max(30) }),
  async ({ restaurantId, menuId, mediaIds }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
    const unique = [...new Set(mediaIds)];
    await assertOwnMediaIds(restaurantId, unique);
    await svc.updateMenu(restaurantId, menuId, { pdfMediaIds: unique });
    await audit({ restaurantId, userId: ctx.user.id, action: "menu.pdf", entityType: "menu", entityId: menuId, data: { count: unique.length } });
    return { ok: true };
  },
);

/** Restaurant-level guest presentation: digital menu or PDF/photo menu. */
export const setMenuModeAction = action(
  z.object({ restaurantId: id, mode: z.enum(["digital", "pdf"]) }),
  async ({ restaurantId, mode }) => {
    const ctx = await assertAny(restaurantId, ["menu.edit", "settings.manage"]);
    await svc.setMenuMode(restaurantId, mode);
    await audit({ restaurantId, userId: ctx.user.id, action: "menu.mode", entityType: "restaurant", entityId: restaurantId, data: { mode } });
    return { mode };
  },
);

// ------------------------------------------------------------------ categories

export const saveCategoryAction = action(
  z.object({
    restaurantId: id,
    categoryId: id.optional(),
    menuId: id,
    name,
    description: optText(1000),
    imageMediaId: id.nullable(),
    isVisible: z.boolean(),
  }),
  async ({ restaurantId, categoryId, ...input }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
    await ownMedia(restaurantId, input.imageMediaId);
    const c = categoryId
      ? await db.transaction((tx) => svc.updateCategory(restaurantId, categoryId, input, tx))
      : await svc.createCategory(restaurantId, input);
    await audit({
      restaurantId,
      userId: ctx.user.id,
      action: categoryId ? "menu.category.update" : "menu.category.create",
      entityType: "category",
      entityId: c.id,
      data: { name: input.name },
    });
    return { id: c.id };
  },
);

export const setCategoryVisibleAction = action(
  z.object({ restaurantId: id, categoryId: id, isVisible: z.boolean() }),
  async ({ restaurantId, categoryId, isVisible }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
    await svc.updateCategory(restaurantId, categoryId, { isVisible });
    await audit({ restaurantId, userId: ctx.user.id, action: "menu.category.visible", entityType: "category", entityId: categoryId, data: { isVisible } });
    return { ok: true };
  },
);

export const deleteCategoryAction = action(z.object({ restaurantId: id, categoryId: id }), async ({ restaurantId, categoryId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
  const c = await svc.getCategory(restaurantId, categoryId);
  await db.transaction((tx) => svc.deleteCategory(restaurantId, categoryId, tx));
  await audit({ restaurantId, userId: ctx.user.id, action: "menu.category.delete", entityType: "category", entityId: categoryId, data: { name: c.name } });
  return { ok: true };
});

export const reorderCategoriesAction = action(
  z.object({ restaurantId: id, menuId: id, ids: z.array(id).max(500) }),
  async ({ restaurantId, menuId, ids }) => {
    await assertRestaurantPermission(restaurantId, "menu.edit");
    await svc.getMenu(restaurantId, menuId);
    await db.transaction((tx) => svc.reorder(restaurantId, "category", ids, tx));
    return { ok: true };
  },
);

// ------------------------------------------------------------------ items

const variantSchema = z.object({ name: z.string().trim().min(1).max(60), priceCents: cents });

export const saveItemAction = action(
  z.object({
    restaurantId: id,
    itemId: id.optional(),
    categoryId: id,
    name,
    description: optText(1000),
    ingredients: optText(2000),
    priceCents: cents.nullable(),
    imageMediaId: id.nullable(),
    isVisible: z.boolean(),
    isAvailable: z.boolean(),
    tags: z.array(z.enum(DIET_TAGS)).max(DIET_TAGS.length),
    variants: z.array(variantSchema).max(20),
  }),
  async ({ restaurantId, itemId, variants, ...input }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
    await ownMedia(restaurantId, input.imageMediaId);
    const tags = [...new Set(input.tags)];
    const it = await db.transaction(async (tx) => {
      if (itemId) {
        const updated = await svc.updateItem(restaurantId, itemId, { ...input, tags }, tx);
        await svc.setVariants(restaurantId, itemId, variants, tx);
        return updated;
      }
      return svc.createItem(restaurantId, input.categoryId, { ...input, tags, variants }, tx);
    });
    await audit({
      restaurantId,
      userId: ctx.user.id,
      action: itemId ? "menu.item.update" : "menu.item.create",
      entityType: "item",
      entityId: it.id,
      data: { name: input.name, priceCents: input.priceCents },
    });
    return { id: it.id, allergenStatus: it.allergenStatus };
  },
);

/** Quick toggles. Sold-out works with menu.availability (service staff); visibility needs menu.edit. */
export const setItemFlagsAction = action(
  z.object({ restaurantId: id, itemId: id, isVisible: z.boolean().optional(), isAvailable: z.boolean().optional() }),
  async ({ restaurantId, itemId, isVisible, isAvailable }) => {
    const ctx =
      isVisible !== undefined
        ? await assertRestaurantPermission(restaurantId, "menu.edit")
        : await assertAny(restaurantId, ["menu.edit", "menu.availability"]);
    const patch: svc.ItemPatch = {};
    if (isVisible !== undefined) patch.isVisible = isVisible;
    if (isAvailable !== undefined) patch.isAvailable = isAvailable;
    if (!Object.keys(patch).length) throw new AppError("validation");
    await svc.updateItem(restaurantId, itemId, patch);
    await audit({ restaurantId, userId: ctx.user.id, action: "menu.item.flags", entityType: "item", entityId: itemId, data: patch });
    return { ok: true };
  },
);

export const deleteItemAction = action(z.object({ restaurantId: id, itemId: id }), async ({ restaurantId, itemId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
  const it = await svc.getItem(restaurantId, itemId);
  await db.transaction((tx) => svc.deleteItem(restaurantId, itemId, tx));
  await audit({ restaurantId, userId: ctx.user.id, action: "menu.item.delete", entityType: "item", entityId: itemId, data: { name: it.name } });
  return { ok: true };
});

export const duplicateItemAction = action(z.object({ restaurantId: id, itemId: id }), async ({ restaurantId, itemId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
  const t = await getTranslations("menu");
  const copy = await db.transaction((tx) => svc.duplicateItem(restaurantId, itemId, t("copySuffix"), tx));
  await audit({ restaurantId, userId: ctx.user.id, action: "menu.item.duplicate", entityType: "item", entityId: copy.id, data: { from: itemId } });
  return { id: copy.id };
});

/** Drag & drop: final order of items in a category (may include items moved in from another category). */
export const arrangeItemsAction = action(
  z.object({ restaurantId: id, categoryId: id, ids: z.array(id).max(1000) }),
  async ({ restaurantId, categoryId, ids }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "menu.edit");
    await db.transaction((tx) => svc.arrangeItems(restaurantId, categoryId, ids, tx));
    await audit({ restaurantId, userId: ctx.user.id, action: "menu.item.arrange", entityType: "category", entityId: categoryId, data: { count: ids.length } });
    return { ok: true };
  },
);

// ------------------------------------------------------------------ allergens

export const confirmAllergensAction = action(
  z.object({
    restaurantId: id,
    itemId: id,
    allergens: z.array(z.string()).max(ALLERGEN_CODES.length),
    additives: z.array(z.string()).max(ADDITIVE_CODES.length),
  }),
  async ({ restaurantId, itemId, allergens, additives }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "allergens.review");
    const a = ALLERGEN_CODES.filter((c) => allergens.includes(c));
    const z2 = ADDITIVE_CODES.filter((c) => additives.includes(c));
    if (a.length !== new Set(allergens).size || z2.length !== new Set(additives).size) throw new AppError("validation");
    await db.transaction(async (tx) => {
      await svc.confirmAllergens(restaurantId, itemId, { allergens: a, additives: z2, userId: ctx.user.id }, tx);
      // A human decision closes open allergen review tasks of this item.
      await tx
        .update(reviewTasks)
        .set({ status: "resolved", resolvedBy: ctx.user.id, resolvedAt: dsql`now()` })
        .where(
          and(
            eq(reviewTasks.restaurantId, restaurantId),
            eq(reviewTasks.kind, "allergen"),
            eq(reviewTasks.entityId, itemId),
            eq(reviewTasks.status, "open"),
          ),
        );
    });
    await audit({ restaurantId, userId: ctx.user.id, action: "allergens.confirm", entityType: "item", entityId: itemId, data: { allergens: a, additives: z2 } });
    return { ok: true };
  },
);
