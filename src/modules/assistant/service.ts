import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/core/db";
import { agentChangesets, categories, items, itemVariants, menus, restaurants, translations } from "@/core/db/schema";
import { aiJson } from "@/core/ai";
import { AppError } from "@/core/http/errors";
import { audit } from "@/core/audit";
import { getPlan } from "@/modules/billing/plans";
import { DIET_TAGS } from "@/modules/allergens/catalog";
import * as menu from "@/modules/menu/service";
import type { MenuTree } from "@/modules/menu/service";
import { AGENT_SYSTEM_PROMPT, agentPlanSchema, type AgentOp } from "./plan-schema";
import { adjustPrice, isSanePrice, type Rounding } from "./pricing";
import type {
  ApplyResult,
  CategoryPatchJson,
  CategorySnapshot,
  ChangesetDto,
  ChangesetPreview,
  ChangesetStatus,
  InverseOp,
  ItemPatchJson,
  ItemSnapshot,
  PlanResult,
  PreviewField,
  PreviewNote,
  PreviewOp,
  ResolvedOp,
  UndoResult,
  VariantInput,
} from "./types";

/**
 * AI assistant: instruction → agent plan → validated change set (dry run) → apply (one transaction,
 * via the menu service) → undo (inverse ops, refused when the data changed meanwhile).
 */

// ------------------------------------------------------------------ snapshot for the model

type Refs = { menus: Map<string, string>; categories: Map<string, string>; items: Map<string, string> };

export function buildSnapshot(tree: MenuTree) {
  const refs: Refs = { menus: new Map(), categories: new Map(), items: new Map() };
  const totalItems = tree.reduce((n, m) => n + m.categories.reduce((k, c) => k + c.items.length, 0), 0);
  const descLen = totalItems > 600 ? 0 : totalItems > 250 ? 50 : 100;
  let mi = 0;
  let ci = 0;
  let ii = 0;
  const out = tree.map((m) => {
    const mref = `m${++mi}`;
    refs.menus.set(mref, m.id);
    return {
      ref: mref,
      name: m.name,
      ...(m.isActive ? {} : { inactive: true }),
      categories: m.categories.map((c) => {
        const cref = `c${++ci}`;
        refs.categories.set(cref, c.id);
        return {
          ref: cref,
          name: c.name,
          ...(c.isVisible ? {} : { hidden: true }),
          items: c.items.map((i) => {
            const iref = `i${++ii}`;
            refs.items.set(iref, i.id);
            return {
              ref: iref,
              name: i.name,
              price: i.priceCents,
              ...(i.variants.length ? { variants: i.variants.map((v) => ({ name: v.name, price: v.priceCents })) } : {}),
              ...(i.isAvailable ? {} : { soldOut: true }),
              ...(i.isVisible ? {} : { hidden: true }),
              ...(i.tags.length ? { tags: i.tags } : {}),
              ...(descLen && i.description ? { desc: i.description.slice(0, descLen) } : {}),
            };
          }),
        };
      }),
    };
  });
  return { json: JSON.stringify({ menus: out }), refs };
}

// ------------------------------------------------------------------ resolver (model ops → validated ops + preview)

type ItemState = {
  id: string;
  name: string;
  description: string | null;
  ingredients: string | null;
  priceCents: number | null;
  isAvailable: boolean;
  isVisible: boolean;
  tags: string[];
  categoryId: string;
  variants: VariantInput[];
  updatedAt: string;
  allergenStatus: string;
};
type CatState = { id: string; name: string; description: string | null; isVisible: boolean; menuId: string; updatedAt: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_TAGS = new Set<string>(DIET_TAGS);
const RECIPE_FIELDS = ["name", "description", "ingredients"] as const;

const cleanText = (s: string | null | undefined) => {
  if (s == null) return undefined;
  const t = s.trim();
  return t === "" ? null : t;
};

type Resolution = { ops: ResolvedOp[]; dropped: PreviewNote[]; unknownTags: Set<string> };

export function resolvePlan(tree: MenuTree, refs: Refs, modelOps: AgentOp[]): Resolution {
  const itemsById = new Map<string, ItemState>();
  const catsById = new Map<string, CatState>();
  const menuIds = new Set(tree.map((m) => m.id));
  for (const m of tree)
    for (const c of m.categories) {
      catsById.set(c.id, { id: c.id, name: c.name, description: c.description, isVisible: c.isVisible, menuId: m.id, updatedAt: c.updatedAt.toISOString() });
      for (const i of c.items)
        itemsById.set(i.id, {
          id: i.id,
          name: i.name,
          description: i.description,
          ingredients: i.ingredients,
          priceCents: i.priceCents,
          isAvailable: i.isAvailable,
          isVisible: i.isVisible,
          tags: i.tags,
          categoryId: c.id,
          variants: i.variants.map((v) => ({ name: v.name, priceCents: v.priceCents })),
          updatedAt: i.updatedAt.toISOString(),
          allergenStatus: i.allergenStatus,
        });
    }

  const dropped: PreviewNote[] = [];
  const unknownTags = new Set<string>();
  const itemOps = new Map<string, Extract<ResolvedOp, { kind: "update_item" }>>();
  const catOps = new Map<string, Extract<ResolvedOp, { kind: "update_category" }>>();
  const createCats: Extract<ResolvedOp, { kind: "create_category" }>[] = [];
  const createItems: Extract<ResolvedOp, { kind: "create_item" }>[] = [];
  const deletedItems = new Set<string>();
  const deletedCats = new Set<string>();
  let seq = 0;
  const nextKey = () => `op${++seq}`;

  const resolveRef = (map: Map<string, string>, has: (id: string) => boolean, ref: string | null | undefined) => {
    if (!ref) return null;
    const r = ref.trim();
    const id = map.get(r) ?? (UUID.test(r) && has(r) ? r : null);
    return id;
  };
  const itemId = (ref: string) => resolveRef(refs.items, (id) => itemsById.has(id), ref);
  const catId = (ref: string | null | undefined) => resolveRef(refs.categories, (id) => catsById.has(id), ref);
  const menuId = (ref: string | null | undefined) => resolveRef(refs.menus, (id) => menuIds.has(id), ref);

  const filterTags = (tags: string[] | null | undefined) => {
    if (!tags) return undefined;
    const out: string[] = [];
    for (const raw of tags) {
      const t = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
      if (ALLOWED_TAGS.has(t)) {
        if (!out.includes(t)) out.push(t);
      } else if (t) unknownTags.add(raw);
    }
    return out;
  };
  const cleanVariants = (vs: { name: string; priceCents: number }[] | null | undefined, label: string): VariantInput[] | null => {
    if (!vs) return [];
    const out: VariantInput[] = [];
    for (const v of vs.slice(0, 20)) {
      const name = v.name.trim();
      const price = Math.round(v.priceCents);
      if (!name) continue;
      if (!isSanePrice(price)) {
        dropped.push({ code: "badPrice", params: { name: label } });
        return null;
      }
      out.push({ name, priceCents: price });
    }
    return out;
  };

  const updateOp = (id: string) => {
    let op = itemOps.get(id);
    if (!op) {
      op = { key: nextKey(), kind: "update_item", itemId: id, patch: {}, expectUpdatedAt: itemsById.get(id)!.updatedAt };
      itemOps.set(id, op);
    }
    return op;
  };
  const current = (id: string) => {
    const base = itemsById.get(id)!;
    const op = itemOps.get(id);
    return {
      ...base,
      ...(op?.patch ?? {}),
      variants: op?.variants ?? base.variants,
    } as ItemState;
  };

  for (const op of modelOps) {
    switch (op.op) {
      case "update_item": {
        const id = itemId(op.itemId);
        if (!id) {
          dropped.push({ code: "unknownItem", params: { ref: op.itemId } });
          break;
        }
        if (deletedItems.has(id)) break;
        const cur = current(id);
        const c = op.changes;
        const patch: ItemPatchJson = {};
        const name = cleanText(c.name);
        if (name) patch.name = name.slice(0, 200);
        const description = cleanText(c.description);
        if (description !== undefined) patch.description = description;
        const ingredients = cleanText(c.ingredients);
        if (ingredients !== undefined) patch.ingredients = ingredients;
        if (c.priceCents != null) {
          const p = Math.round(c.priceCents);
          if (!isSanePrice(p)) {
            dropped.push({ code: "badPrice", params: { name: cur.name } });
            break;
          }
          patch.priceCents = p;
        }
        if (c.isAvailable != null) patch.isAvailable = c.isAvailable;
        if (c.isVisible != null) patch.isVisible = c.isVisible;
        const tags = filterTags(c.tags);
        if (tags) patch.tags = tags;
        if (c.categoryId) {
          const cid = catId(c.categoryId);
          if (!cid || deletedCats.has(cid)) {
            dropped.push({ code: "unknownCategory", params: { ref: c.categoryId } });
            break;
          }
          patch.categoryId = cid;
        }
        // keep only real changes
        for (const k of Object.keys(patch) as (keyof ItemPatchJson)[]) {
          const before = cur[k as keyof ItemState];
          if (JSON.stringify(before) === JSON.stringify(patch[k])) delete patch[k];
        }
        if (!Object.keys(patch).length) break;
        Object.assign(updateOp(id).patch, patch);
        break;
      }
      case "set_variants": {
        const id = itemId(op.itemId);
        if (!id) {
          dropped.push({ code: "unknownItem", params: { ref: op.itemId } });
          break;
        }
        if (deletedItems.has(id)) break;
        const vs = cleanVariants(op.variants, itemsById.get(id)!.name);
        if (!vs) break;
        if (JSON.stringify(vs) === JSON.stringify(current(id).variants)) break;
        updateOp(id).variants = vs;
        break;
      }
      case "bulk_price_change": {
        const pct = op.percent ?? null;
        const amt = op.amountCents != null ? Math.round(op.amountCents) : null;
        if ((pct == null || pct === 0) && (amt == null || amt === 0)) break;
        if ((pct != null && (pct < -60 || pct > 200)) || (amt != null && Math.abs(amt) > 5000)) {
          dropped.push({ code: "badPercent" });
          break;
        }
        const targets = new Set<string>();
        const allIds = [...itemsById.keys()].filter((id) => !deletedItems.has(id));
        if (op.scope === "all") allIds.forEach((id) => targets.add(id));
        const idsOf = (k: typeof op.scope) => (op.scope === k ? op.ids : []);
        for (const ref of idsOf("menus")) {
          const mid = menuId(ref);
          if (!mid) dropped.push({ code: "unknownMenu", params: { ref } });
          else allIds.filter((id) => catsById.get(current(id).categoryId)?.menuId === mid).forEach((id) => targets.add(id));
        }
        for (const ref of idsOf("categories")) {
          const cid = catId(ref);
          if (!cid) dropped.push({ code: "unknownCategory", params: { ref } });
          else allIds.filter((id) => current(id).categoryId === cid).forEach((id) => targets.add(id));
        }
        for (const ref of idsOf("items")) {
          const id = itemId(ref);
          if (!id) dropped.push({ code: "unknownItem", params: { ref } });
          else if (!deletedItems.has(id)) targets.add(id);
        }
        const rounding = (op.rounding ?? "none") as Rounding;
        const withVariants = op.includeVariants ?? true;
        for (const id of targets) {
          const cur = current(id);
          const adj = (p: number) => adjustPrice(p, { percent: pct, amountCents: amt, rounding });
          if (cur.priceCents != null) {
            const np = adj(cur.priceCents);
            if (np !== cur.priceCents && isSanePrice(np)) updateOp(id).patch.priceCents = np;
          }
          if (withVariants && cur.variants.length) {
            const nv = cur.variants.map((v) => ({ name: v.name, priceCents: adj(v.priceCents) }));
            if (nv.every((v) => isSanePrice(v.priceCents)) && JSON.stringify(nv) !== JSON.stringify(cur.variants)) updateOp(id).variants = nv;
          }
        }
        break;
      }
      case "create_category": {
        const mid = menuId(op.menuId) ?? (tree.length === 1 ? tree[0].id : null);
        if (!mid) {
          dropped.push({ code: "unknownMenu", params: { ref: op.menuId } });
          break;
        }
        const name = cleanText(op.name);
        if (!name) {
          dropped.push({ code: "emptyName" });
          break;
        }
        const ref = op.ref.trim() || `new${createCats.length + 1}`;
        if (createCats.some((c) => c.ref === ref)) break;
        createCats.push({ key: nextKey(), kind: "create_category", ref, menuId: mid, name: name.slice(0, 200), description: cleanText(op.description) ?? null });
        break;
      }
      case "create_item": {
        const name = cleanText(op.name);
        if (!name) {
          dropped.push({ code: "emptyName" });
          break;
        }
        let categoryId: string | null = null;
        let categoryRef: string | null = null;
        if (op.newCategoryRef && createCats.some((c) => c.ref === op.newCategoryRef!.trim())) categoryRef = op.newCategoryRef.trim();
        else {
          categoryId = catId(op.categoryId ?? op.newCategoryRef);
          if (!categoryId && op.categoryId && createCats.some((c) => c.ref === op.categoryId!.trim())) categoryRef = op.categoryId.trim();
        }
        if ((!categoryId && !categoryRef) || (categoryId && deletedCats.has(categoryId))) {
          dropped.push({ code: "missingCategory", params: { name } });
          break;
        }
        let priceCents: number | null = null;
        if (op.priceCents != null) {
          priceCents = Math.round(op.priceCents);
          if (!isSanePrice(priceCents)) {
            dropped.push({ code: "badPrice", params: { name } });
            break;
          }
        }
        const variants = cleanVariants(op.variants, name);
        if (!variants) break;
        createItems.push({
          key: nextKey(),
          kind: "create_item",
          categoryId,
          categoryRef,
          input: {
            name: name.slice(0, 200),
            description: cleanText(op.description) ?? null,
            ingredients: cleanText(op.ingredients) ?? null,
            priceCents,
            tags: filterTags(op.tags) ?? [],
            variants,
          },
        });
        break;
      }
      case "delete_item": {
        const id = itemId(op.itemId);
        if (!id) {
          dropped.push({ code: "unknownItem", params: { ref: op.itemId } });
          break;
        }
        deletedItems.add(id);
        itemOps.delete(id);
        break;
      }
      case "update_category": {
        const id = catId(op.categoryId);
        if (!id) {
          dropped.push({ code: "unknownCategory", params: { ref: op.categoryId } });
          break;
        }
        if (deletedCats.has(id)) break;
        const cur = { ...catsById.get(id)!, ...(catOps.get(id)?.patch ?? {}) };
        const patch: CategoryPatchJson = {};
        const name = cleanText(op.changes.name);
        if (name && name !== cur.name) patch.name = name.slice(0, 200);
        const description = cleanText(op.changes.description);
        if (description !== undefined && description !== cur.description) patch.description = description;
        if (op.changes.isVisible != null && op.changes.isVisible !== cur.isVisible) patch.isVisible = op.changes.isVisible;
        if (!Object.keys(patch).length) break;
        const existing = catOps.get(id);
        if (existing) Object.assign(existing.patch, patch);
        else catOps.set(id, { key: nextKey(), kind: "update_category", categoryId: id, patch, expectUpdatedAt: catsById.get(id)!.updatedAt });
        break;
      }
      case "delete_category": {
        const id = catId(op.categoryId);
        if (!id) {
          dropped.push({ code: "unknownCategory", params: { ref: op.categoryId } });
          break;
        }
        deletedCats.add(id);
        catOps.delete(id);
        for (const [iid, st] of itemsById) if (st.categoryId === id) itemOps.delete(iid);
        break;
      }
    }
  }

  // items that are moved into a category deleted later → drop the move
  for (const [iid, op] of itemOps) if (op.patch.categoryId && deletedCats.has(op.patch.categoryId)) {
    delete op.patch.categoryId;
    if (!Object.keys(op.patch).length && !op.variants) itemOps.delete(iid);
  }
  const itemsOfDeletedCats = new Set([...itemsById.values()].filter((i) => deletedCats.has(i.categoryId)).map((i) => i.id));
  const ops: ResolvedOp[] = [
    ...createCats,
    ...catOps.values(),
    ...createItems.filter((c) => !c.categoryId || !deletedCats.has(c.categoryId)),
    ...[...itemOps.values()].filter((o) => !deletedItems.has(o.itemId) && !itemsOfDeletedCats.has(o.itemId)),
    ...[...deletedItems]
      .filter((id) => !itemsOfDeletedCats.has(id))
      .map((id): ResolvedOp => ({ key: nextKey(), kind: "delete_item", itemId: id, expectUpdatedAt: itemsById.get(id)!.updatedAt })),
    ...[...deletedCats].map((id): ResolvedOp => ({ key: nextKey(), kind: "delete_category", categoryId: id, expectUpdatedAt: catsById.get(id)!.updatedAt })),
  ];
  return { ops, dropped, unknownTags };
}

// ------------------------------------------------------------------ preview

export async function buildPreview(
  restaurantId: string,
  tree: MenuTree,
  res: Resolution,
  planItemLimit: number,
): Promise<{ preview: ChangesetPreview; warnings: string[] }> {
  const itemIdx = new Map<string, { item: MenuTree[number]["categories"][number]["items"][number]; cat: MenuTree[number]["categories"][number]; menu: MenuTree[number] }>();
  const catIdx = new Map<string, { cat: MenuTree[number]["categories"][number]; menu: MenuTree[number] }>();
  let itemCount = 0;
  for (const m of tree)
    for (const c of m.categories) {
      catIdx.set(c.id, { cat: c, menu: m });
      for (const i of c.items) {
        itemIdx.set(i.id, { item: i, cat: c, menu: m });
        itemCount++;
      }
    }
  const newCatName = new Map(res.ops.filter((o) => o.kind === "create_category").map((o) => [o.ref, o]));
  const catLabel = (id: string | null, ref: string | null) =>
    id ? (catIdx.get(id)?.cat.name ?? "?") : ref ? (newCatName.get(ref)?.name ?? "?") : "?";

  const ops: PreviewOp[] = [];
  const textChanges: { entityType: "item" | "category"; id: string; fields: string[] }[] = [];
  let recipeChanges = 0;
  let newItems = 0;

  for (const op of res.ops) {
    const notes: PreviewNote[] = [];
    switch (op.kind) {
      case "update_item": {
        const { item, cat, menu: m } = itemIdx.get(op.itemId)!;
        const fields: PreviewField[] = [];
        const p = op.patch;
        if (p.name !== undefined) fields.push({ field: "name", before: item.name, after: p.name });
        if (p.description !== undefined) fields.push({ field: "description", before: item.description, after: p.description });
        if (p.ingredients !== undefined) fields.push({ field: "ingredients", before: item.ingredients, after: p.ingredients });
        if (p.priceCents !== undefined) {
          fields.push({ field: "price", before: item.priceCents, after: p.priceCents });
          if (item.priceCents && p.priceCents != null && Math.abs(p.priceCents - item.priceCents) / item.priceCents > 0.3)
            notes.push({ code: "bigPriceChange" });
        }
        if (op.variants) fields.push({ field: "variants", before: item.variants.map((v) => ({ name: v.name, priceCents: v.priceCents })), after: op.variants });
        if (p.isAvailable !== undefined) fields.push({ field: "available", before: item.isAvailable, after: p.isAvailable });
        if (p.isVisible !== undefined) fields.push({ field: "visible", before: item.isVisible, after: p.isVisible });
        if (p.tags !== undefined) fields.push({ field: "tags", before: item.tags, after: p.tags });
        if (p.categoryId !== undefined) fields.push({ field: "category", before: cat.name, after: catLabel(p.categoryId, null) });
        if (RECIPE_FIELDS.some((f) => p[f] !== undefined)) {
          recipeChanges++;
          notes.push({ code: item.allergenStatus === "confirmed" ? "allergensRecheckConfirmed" : "allergensRecheck" });
        }
        const tf = (["name", "description"] as const).filter((f) => p[f] !== undefined);
        if (tf.length) textChanges.push({ entityType: "item", id: item.id, fields: tf });
        ops.push({ key: op.key, kind: op.kind, title: p.name ?? item.name, context: `${m.name} › ${cat.name}`, fields, destructive: false, dependsOn: null, notes });
        break;
      }
      case "create_item": {
        newItems++;
        const i = op.input;
        const fields: PreviewField[] = [{ field: "name", after: i.name }];
        if (i.description) fields.push({ field: "description", after: i.description });
        if (i.ingredients) fields.push({ field: "ingredients", after: i.ingredients });
        fields.push({ field: "price", after: i.priceCents });
        if (i.variants.length) fields.push({ field: "variants", after: i.variants });
        if (i.tags.length) fields.push({ field: "tags", after: i.tags });
        notes.push({ code: "allergensMissing" });
        const menuName = op.categoryId ? catIdx.get(op.categoryId)?.menu.name : tree.find((m) => m.id === newCatName.get(op.categoryRef!)?.menuId)?.name;
        ops.push({
          key: op.key,
          kind: op.kind,
          title: i.name,
          context: `${menuName ?? "?"} › ${catLabel(op.categoryId, op.categoryRef)}`,
          fields,
          destructive: false,
          dependsOn: op.categoryRef ? (newCatName.get(op.categoryRef)?.key ?? null) : null,
          notes,
        });
        break;
      }
      case "delete_item": {
        const { item, cat, menu: m } = itemIdx.get(op.itemId)!;
        notes.push({ code: "deleteUndoHint" });
        ops.push({
          key: op.key,
          kind: op.kind,
          title: item.name,
          context: `${m.name} › ${cat.name}`,
          fields: [{ field: "price", before: item.priceCents }],
          destructive: true,
          dependsOn: null,
          notes,
        });
        break;
      }
      case "create_category": {
        const m = tree.find((x) => x.id === op.menuId);
        const fields: PreviewField[] = [{ field: "name", after: op.name }];
        if (op.description) fields.push({ field: "description", after: op.description });
        ops.push({ key: op.key, kind: op.kind, title: op.name, context: m?.name ?? null, fields, destructive: false, dependsOn: null, notes });
        break;
      }
      case "update_category": {
        const { cat, menu: m } = catIdx.get(op.categoryId)!;
        const fields: PreviewField[] = [];
        if (op.patch.name !== undefined) fields.push({ field: "name", before: cat.name, after: op.patch.name });
        if (op.patch.description !== undefined) fields.push({ field: "description", before: cat.description, after: op.patch.description });
        if (op.patch.isVisible !== undefined) fields.push({ field: "visible", before: cat.isVisible, after: op.patch.isVisible });
        const tf = (["name", "description"] as const).filter((f) => op.patch[f] !== undefined);
        if (tf.length) textChanges.push({ entityType: "category", id: cat.id, fields: tf });
        ops.push({ key: op.key, kind: op.kind, title: op.patch.name ?? cat.name, context: m.name, fields, destructive: false, dependsOn: null, notes });
        break;
      }
      case "delete_category": {
        const { cat, menu: m } = catIdx.get(op.categoryId)!;
        if (cat.items.length) notes.push({ code: "cascadeItems", params: { count: cat.items.length } });
        notes.push({ code: "deleteUndoHint" });
        ops.push({ key: op.key, kind: op.kind, title: cat.name, context: m.name, fields: [], destructive: true, dependsOn: null, notes });
        break;
      }
    }
  }

  const warnings: PreviewNote[] = [];
  if (textChanges.length) {
    const rows = await db
      .select({ entityType: translations.entityType, entityId: translations.entityId, field: translations.field })
      .from(translations)
      .where(and(eq(translations.restaurantId, restaurantId), inArray(translations.entityId, textChanges.map((t) => t.id))));
    const count = rows.filter((r) => textChanges.some((t) => t.id === r.entityId && t.entityType === r.entityType && t.fields.includes(r.field))).length;
    if (count) warnings.push({ code: "translationsStale", params: { count } });
  }
  if (recipeChanges) warnings.push({ code: "allergensRecheck", params: { count: recipeChanges } });
  if (newItems) warnings.push({ code: "allergensMissing", params: { count: newItems } });
  if (newItems && itemCount + newItems > planItemLimit) warnings.push({ code: "itemLimit", params: { limit: planItemLimit } });
  if (res.unknownTags.size) warnings.push({ code: "unknownTags", params: { tags: [...res.unknownTags].join(", ") } });
  if (ops.some((o) => o.destructive)) warnings.push({ code: "destructive" });

  return { preview: { ops, warnings, dropped: res.dropped }, warnings: warnings.map((w) => w.code) };
}

// ------------------------------------------------------------------ plan (AI call)

export async function planChangeset(opts: {
  restaurantId: string;
  userId: string;
  input: string;
  inputKind: "text" | "voice";
}): Promise<PlanResult> {
  const [r] = await db.select({ plan: restaurants.plan, defaultLocale: restaurants.defaultLocale }).from(restaurants).where(eq(restaurants.id, opts.restaurantId)).limit(1);
  if (!r) throw new AppError("notFound");
  const tree = await menu.getMenuTree(opts.restaurantId);
  const { json, refs } = buildSnapshot(tree);
  const { data } = await aiJson(
    "agent",
    {
      messages: [
        { role: "system", content: AGENT_SYSTEM_PROMPT(r.defaultLocale, DIET_TAGS) },
        { role: "user", content: `MENU:\n${json}\n\nINSTRUCTION:\n${opts.input}` },
      ],
      maxTokens: 6000,
    },
    agentPlanSchema,
    { restaurantId: opts.restaurantId, userId: opts.userId },
    "menu_changes",
  );

  const clarifications = data.clarifications.map((c) => c.trim()).filter(Boolean);
  if (!data.operations.length) {
    return clarifications.length ? { kind: "clarify", summary: data.summary, clarifications } : { kind: "empty", summary: data.summary };
  }
  const res = resolvePlan(tree, refs, data.operations);
  if (!res.ops.length) {
    return clarifications.length ? { kind: "clarify", summary: data.summary, clarifications } : { kind: "empty", summary: data.summary };
  }
  const { preview, warnings } = await buildPreview(opts.restaurantId, tree, res, getPlan(r.plan).limits.items);
  const [row] = await db
    .insert(agentChangesets)
    .values({
      restaurantId: opts.restaurantId,
      userId: opts.userId,
      input: opts.input,
      inputKind: opts.inputKind,
      summary: data.summary,
      operations: res.ops,
      preview,
      warnings,
      status: "draft",
    })
    .returning();
  return { kind: "changeset", changeset: toDto(row), clarifications };
}

// ------------------------------------------------------------------ reads

type Row = typeof agentChangesets.$inferSelect;

function toDto(r: Row): ChangesetDto {
  return {
    id: r.id,
    status: r.status as ChangesetStatus,
    input: r.input,
    inputKind: r.inputKind,
    summary: r.summary,
    preview: (r.preview as ChangesetPreview | null) ?? { ops: [], warnings: [], dropped: [] },
    createdAt: r.createdAt.toISOString(),
    appliedAt: r.appliedAt?.toISOString() ?? null,
    error: r.error,
  };
}

export async function listChangesets(restaurantId: string, limit = 20): Promise<ChangesetDto[]> {
  const rows = await db
    .select()
    .from(agentChangesets)
    .where(eq(agentChangesets.restaurantId, restaurantId))
    .orderBy(desc(agentChangesets.createdAt))
    .limit(limit);
  return rows.map(toDto);
}

async function getOwnChangeset(restaurantId: string, id: string, tx: DbOrTx = db) {
  const [row] = await tx.select().from(agentChangesets).where(and(eq(agentChangesets.id, id), eq(agentChangesets.restaurantId, restaurantId))).limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

export async function discardChangeset(restaurantId: string, id: string) {
  const row = await getOwnChangeset(restaurantId, id);
  if (row.status !== "draft") throw new AppError("validation", "status");
  await db.update(agentChangesets).set({ status: "discarded" }).where(eq(agentChangesets.id, id));
}

// ------------------------------------------------------------------ apply / undo

class Conflict extends Error {
  constructor(public names: string[]) {
    super("conflict");
  }
}

const iso = (d: Date) => d.toISOString();

async function variantsOf(tx: DbOrTx, itemId: string): Promise<VariantInput[]> {
  const vs = await tx.select().from(itemVariants).where(eq(itemVariants.itemId, itemId)).orderBy(asc(itemVariants.sort));
  return vs.map((v) => ({ name: v.name, priceCents: v.priceCents }));
}

async function findItem(tx: DbOrTx, restaurantId: string, id: string) {
  const [row] = await tx.select().from(items).where(and(eq(items.id, id), eq(items.restaurantId, restaurantId))).limit(1);
  return row ?? null;
}
async function findCategory(tx: DbOrTx, restaurantId: string, id: string) {
  const [row] = await tx.select().from(categories).where(and(eq(categories.id, id), eq(categories.restaurantId, restaurantId))).limit(1);
  return row ?? null;
}
async function menuExists(tx: DbOrTx, restaurantId: string, id: string) {
  const [row] = await tx.select({ id: menus.id }).from(menus).where(and(eq(menus.id, id), eq(menus.restaurantId, restaurantId))).limit(1);
  return !!row;
}

async function snapshotItem(tx: DbOrTx, it: typeof items.$inferSelect): Promise<ItemSnapshot> {
  return {
    id: it.id,
    categoryId: it.categoryId,
    name: it.name,
    description: it.description,
    ingredients: it.ingredients,
    priceCents: it.priceCents,
    imageMediaId: it.imageMediaId,
    sort: it.sort,
    isVisible: it.isVisible,
    isAvailable: it.isAvailable,
    tags: it.tags,
    allergens: it.allergens,
    additives: it.additives,
    allergenStatus: it.allergenStatus,
    allergenConfirmedBy: it.allergenConfirmedBy,
    variants: await variantsOf(tx, it.id),
  };
}

function pick<T extends object>(obj: T, keys: string[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) (out as Record<string, unknown>)[k] = (obj as Record<string, unknown>)[k];
  return out;
}

const isDestructive = (o: ResolvedOp) => o.kind === "delete_item" || o.kind === "delete_category";

export async function applyChangeset(opts: {
  restaurantId: string;
  userId: string;
  changesetId: string;
  keys: string[];
  confirmDestructive: boolean;
}): Promise<ApplyResult> {
  const { restaurantId } = opts;
  const row = await getOwnChangeset(restaurantId, opts.changesetId);
  if (row.status !== "draft") throw new AppError("validation", "status");
  const keySet = new Set(opts.keys);
  let ops = (row.operations as ResolvedOp[]).filter((o) => keySet.has(o.key));
  const enabledRefs = new Set(ops.flatMap((o) => (o.kind === "create_category" ? [o.ref] : [])));
  ops = ops.filter((o) => o.kind !== "create_item" || !o.categoryRef || enabledRefs.has(o.categoryRef));
  if (!ops.length) throw new AppError("validation", "empty");
  if (ops.some(isDestructive) && !opts.confirmDestructive) throw new AppError("validation", "confirmDestructive");

  try {
    await db.transaction(async (tx) => {
      // 1. the menu must still look like in the preview
      const conflicts: string[] = [];
      for (const op of ops) {
        if (op.kind === "update_item" || op.kind === "delete_item") {
          const it = await findItem(tx, restaurantId, op.itemId);
          if (!it || iso(it.updatedAt) !== op.expectUpdatedAt) conflicts.push(it?.name ?? op.itemId);
        } else if (op.kind === "update_category" || op.kind === "delete_category") {
          const c = await findCategory(tx, restaurantId, op.categoryId);
          if (!c || iso(c.updatedAt) !== op.expectUpdatedAt) conflicts.push(c?.name ?? op.categoryId);
        } else if (op.kind === "create_item" && op.categoryId) {
          if (!(await findCategory(tx, restaurantId, op.categoryId))) conflicts.push(op.input.name);
        } else if (op.kind === "create_category") {
          if (!(await menuExists(tx, restaurantId, op.menuId))) conflicts.push(op.name);
        }
      }
      if (conflicts.length) throw new Conflict(conflicts);

      const creates = ops.filter((o) => o.kind === "create_item").length;
      if (creates) await menu.assertItemLimit(restaurantId, creates, tx);

      // 2. execute via the menu service, collecting inverse ops
      const inverse: InverseOp[] = [];
      const refIds = new Map<string, string>();
      for (const op of ops) {
        switch (op.kind) {
          case "update_item": {
            const before = await menu.getItem(restaurantId, op.itemId, tx);
            const inv: Extract<InverseOp, { kind: "restore_item" }> = {
              kind: "restore_item",
              itemId: op.itemId,
              name: before.name,
              patch: pick(before, Object.keys(op.patch)) as ItemPatchJson,
            };
            if (Object.keys(op.patch).length) await menu.updateItem(restaurantId, op.itemId, op.patch, tx);
            if (op.variants) {
              inv.variants = await variantsOf(tx, op.itemId);
              await menu.setVariants(restaurantId, op.itemId, op.variants, tx);
            }
            inverse.push(inv);
            break;
          }
          case "create_item": {
            const categoryId = op.categoryId ?? refIds.get(op.categoryRef!)!;
            const it = await menu.createItem(restaurantId, categoryId, { ...op.input }, tx);
            inverse.push({ kind: "remove_item", itemId: it.id, name: it.name });
            break;
          }
          case "delete_item": {
            const it = await menu.getItem(restaurantId, op.itemId, tx);
            const snap = await snapshotItem(tx, it);
            await menu.deleteItem(restaurantId, op.itemId, tx);
            inverse.push({ kind: "recreate_item", item: snap });
            break;
          }
          case "create_category": {
            const c = await menu.createCategory(restaurantId, { menuId: op.menuId, name: op.name, description: op.description }, tx);
            refIds.set(op.ref, c.id);
            inverse.push({ kind: "remove_category", categoryId: c.id, name: c.name });
            break;
          }
          case "update_category": {
            const before = await menu.getCategory(restaurantId, op.categoryId, tx);
            await menu.updateCategory(restaurantId, op.categoryId, op.patch, tx);
            inverse.push({ kind: "restore_category", categoryId: op.categoryId, name: before.name, patch: pick(before, Object.keys(op.patch)) as CategoryPatchJson });
            break;
          }
          case "delete_category": {
            const c = await menu.getCategory(restaurantId, op.categoryId, tx);
            const its = await tx.select().from(items).where(eq(items.categoryId, c.id)).orderBy(asc(items.sort));
            const snap: CategorySnapshot = {
              id: c.id,
              menuId: c.menuId,
              name: c.name,
              description: c.description,
              imageMediaId: c.imageMediaId,
              isVisible: c.isVisible,
              sort: c.sort,
              items: await Promise.all(its.map((i) => snapshotItem(tx, i))),
            };
            await menu.deleteCategory(restaurantId, op.categoryId, tx);
            inverse.push({ kind: "recreate_category", category: snap });
            break;
          }
        }
      }

      // 3. remember the state after applying → undo refuses when somebody changed it meanwhile
      for (const inv of inverse) {
        if (inv.kind === "restore_item" || inv.kind === "remove_item") {
          const it = await findItem(tx, restaurantId, inv.itemId);
          if (it) inv.expectUpdatedAt = iso(it.updatedAt);
          if (inv.kind === "restore_item" && inv.variants) inv.expectVariants = await variantsOf(tx, inv.itemId);
        } else if (inv.kind === "restore_category" || inv.kind === "remove_category") {
          const c = await findCategory(tx, restaurantId, inv.categoryId);
          if (c) inv.expectUpdatedAt = iso(c.updatedAt);
        }
      }
      inverse.reverse();

      const preview = { ...((row.preview as ChangesetPreview | null) ?? { ops: [], warnings: [], dropped: [] }), appliedKeys: ops.map((o) => o.key) };
      await tx
        .update(agentChangesets)
        .set({ status: "applied", inverse, preview, appliedAt: new Date(), error: null })
        .where(eq(agentChangesets.id, row.id));
      await audit(
        {
          restaurantId,
          userId: opts.userId,
          action: "ai.changeset.apply",
          entityType: "agent_changeset",
          entityId: row.id,
          data: { ops: ops.length, kinds: ops.map((o) => o.kind) },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Conflict) return { status: "conflict", names: [...new Set(e.names)] };
    throw e;
  }
  return { status: "applied" };
}

async function recreateItem(tx: DbOrTx, restaurantId: string, snap: ItemSnapshot, categoryId: string) {
  const it = await menu.createItem(
    restaurantId,
    categoryId,
    {
      name: snap.name,
      description: snap.description,
      ingredients: snap.ingredients,
      priceCents: snap.priceCents,
      imageMediaId: snap.imageMediaId,
      isVisible: snap.isVisible,
      isAvailable: snap.isAvailable,
      tags: snap.tags,
      variants: snap.variants,
    },
    tx,
  );
  await menu.updateItem(restaurantId, it.id, { sort: snap.sort }, tx);
  if (snap.allergenStatus === "confirmed" && snap.allergenConfirmedBy) {
    await menu.confirmAllergens(restaurantId, it.id, { allergens: snap.allergens, additives: snap.additives, userId: snap.allergenConfirmedBy }, tx);
  }
  return it;
}

export async function undoChangeset(opts: { restaurantId: string; userId: string; changesetId: string }): Promise<UndoResult> {
  const { restaurantId } = opts;
  const row = await getOwnChangeset(restaurantId, opts.changesetId);
  if (row.status !== "applied") throw new AppError("validation", "status");
  const inverse = (row.inverse ?? []) as InverseOp[];

  try {
    await db.transaction(async (tx) => {
      const recreatedCats = new Set(inverse.flatMap((i) => (i.kind === "recreate_category" ? [i.category.id] : [])));
      const conflicts: string[] = [];
      for (const inv of inverse) {
        if (inv.kind === "restore_item" || inv.kind === "remove_item") {
          const it = await findItem(tx, restaurantId, inv.itemId);
          if (!it || (inv.expectUpdatedAt && iso(it.updatedAt) !== inv.expectUpdatedAt)) conflicts.push(it?.name ?? inv.name);
          else if (inv.kind === "restore_item" && inv.expectVariants && JSON.stringify(await variantsOf(tx, inv.itemId)) !== JSON.stringify(inv.expectVariants))
            conflicts.push(it.name);
        } else if (inv.kind === "restore_category" || inv.kind === "remove_category") {
          const c = await findCategory(tx, restaurantId, inv.categoryId);
          if (!c || (inv.expectUpdatedAt && iso(c.updatedAt) !== inv.expectUpdatedAt)) conflicts.push(c?.name ?? inv.name);
        } else if (inv.kind === "recreate_item") {
          if (!recreatedCats.has(inv.item.categoryId) && !(await findCategory(tx, restaurantId, inv.item.categoryId))) conflicts.push(inv.item.name);
        } else if (inv.kind === "recreate_category") {
          if (!(await menuExists(tx, restaurantId, inv.category.menuId))) conflicts.push(inv.category.name);
        }
      }
      if (conflicts.length) throw new Conflict(conflicts);

      const catMap = new Map<string, string>();
      for (const inv of inverse) {
        switch (inv.kind) {
          case "restore_item":
            if (Object.keys(inv.patch).length) await menu.updateItem(restaurantId, inv.itemId, inv.patch, tx);
            if (inv.variants) await menu.setVariants(restaurantId, inv.itemId, inv.variants, tx);
            break;
          case "remove_item":
            await menu.deleteItem(restaurantId, inv.itemId, tx);
            break;
          case "recreate_item":
            await recreateItem(tx, restaurantId, inv.item, catMap.get(inv.item.categoryId) ?? inv.item.categoryId);
            break;
          case "remove_category": {
            const left = await tx.select({ id: items.id }).from(items).where(eq(items.categoryId, inv.categoryId)).limit(1);
            if (left.length) throw new Conflict([inv.name]);
            await menu.deleteCategory(restaurantId, inv.categoryId, tx);
            break;
          }
          case "restore_category":
            await menu.updateCategory(restaurantId, inv.categoryId, inv.patch, tx);
            break;
          case "recreate_category": {
            const s = inv.category;
            const c = await menu.createCategory(
              restaurantId,
              { menuId: s.menuId, name: s.name, description: s.description, imageMediaId: s.imageMediaId, isVisible: s.isVisible },
              tx,
            );
            await menu.updateCategory(restaurantId, c.id, { sort: s.sort }, tx);
            catMap.set(s.id, c.id);
            for (const it of s.items) await recreateItem(tx, restaurantId, it, c.id);
            break;
          }
        }
      }
      await tx.update(agentChangesets).set({ status: "reverted" }).where(eq(agentChangesets.id, row.id));
      await audit({ restaurantId, userId: opts.userId, action: "ai.changeset.undo", entityType: "agent_changeset", entityId: row.id }, tx);
    });
  } catch (e) {
    if (e instanceof Conflict) return { status: "conflict", names: [...new Set(e.names)] };
    throw e;
  }
  return { status: "reverted" };
}
