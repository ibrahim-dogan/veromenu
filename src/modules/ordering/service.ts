import "server-only";
import { and, desc, eq, gte, inArray, or, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { categories, itemVariants, items, menus, orderItems, orders, restaurants, tables } from "@/core/db/schema";
import type { OrderStatus, RestaurantSettings } from "@/core/db/schema";
import { AppError } from "@/core/http/errors";
import { randomToken } from "@/core/crypto";
import { publish } from "@/core/events";
import { ALL_LOCALES } from "@/core/i18n/locales";
import { planHas } from "@/modules/billing/plans";
import { findActiveTableByToken } from "@/modules/tables/service";
import { trackEvent } from "@/modules/analytics/track";

/**
 * Ordering domain: public order placement (guest menu), staff board, history.
 * Prices are ALWAYS recomputed from the DB. Names are snapshotted in the source language.
 */

export const ORDER_CHANNEL = "vm_orders";
export const BOARD_STATUSES = ["pending", "accepted", "preparing", "ready", "served"] as const satisfies readonly OrderStatus[];
export const ACTIVE_STATUSES: OrderStatus[] = ["pending", "accepted", "preparing", "ready"];
/** Orders that count as revenue (accepted or later). */
export const REVENUE_STATUSES: OrderStatus[] = ["accepted", "preparing", "ready", "served"];

/** Allowed staff transitions (incl. one step back to fix mis-clicks). */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "ready", "served", "rejected", "cancelled"],
  preparing: ["ready", "served", "accepted", "cancelled"],
  ready: ["served", "preparing", "cancelled"],
  served: ["ready"],
  rejected: [],
  cancelled: [],
};
export const canTransition = (from: OrderStatus, to: OrderStatus) => TRANSITIONS[from]?.includes(to) ?? false;

export const DEFAULT_ORDERING: NonNullable<RestaurantSettings["ordering"]> = {
  enabled: false,
  acceptMode: "manual",
  requireTable: true,
  allowNotes: true,
};
export const orderingSettings = (s: RestaurantSettings | null | undefined) => ({ ...DEFAULT_ORDERING, ...(s?.ordering ?? {}) });

// ------------------------------------------------------------------ public placement

export type PublicOrderErrorCode = "ordering_disabled" | "table_required" | "item_unavailable" | "invalid" | "rate_limited";

export class PublicOrderError extends Error {
  constructor(
    public code: PublicOrderErrorCode,
    public status: number,
  ) {
    super(code);
    this.name = "PublicOrderError";
  }
}

export type PlaceOrderInput = {
  slug: string;
  tableToken?: string | null;
  locale: string;
  note?: string | null;
  items: { itemId: string; variantId?: string | null; quantity: number; note?: string | null }[];
};

export type PlacedOrder = { publicId: string; number: number; status: OrderStatus; totalCents: number };

const clean = (s: string | null | undefined, max: number) => {
  const v = (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return v || null;
};

export async function placeOrder(input: PlaceOrderInput, reqHeaders: Headers): Promise<PlacedOrder> {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, input.slug)).limit(1);
  if (!r) throw new PublicOrderError("invalid", 404);
  const cfg = orderingSettings(r.settings);
  if (r.status !== "active" || !cfg.enabled || !planHas(r.plan, "ordering")) throw new PublicOrderError("ordering_disabled", 403);

  const table = await findActiveTableByToken(r.id, input.tableToken);
  if (!table && cfg.requireTable) throw new PublicOrderError("table_required", 403);

  // Load all referenced items with their category + menu visibility.
  const itemIds = Array.from(new Set(input.items.map((l) => l.itemId)));
  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      priceCents: items.priceCents,
      isVisible: items.isVisible,
      isAvailable: items.isAvailable,
      categoryVisible: categories.isVisible,
      menuActive: menus.isActive,
    })
    .from(items)
    .innerJoin(categories, eq(categories.id, items.categoryId))
    .innerJoin(menus, eq(menus.id, categories.menuId))
    .where(and(eq(items.restaurantId, r.id), inArray(items.id, itemIds)));
  const byId = new Map(rows.map((x) => [x.id, x]));
  const variants = rows.length
    ? await db.select().from(itemVariants).where(inArray(itemVariants.itemId, rows.map((x) => x.id)))
    : [];

  const lines = input.items.map((line) => {
    const it = byId.get(line.itemId);
    if (!it || !it.isVisible || !it.isAvailable || !it.categoryVisible || !it.menuActive) throw new PublicOrderError("item_unavailable", 409);
    const itemVariantsList = variants.filter((v) => v.itemId === it.id);
    let price = it.priceCents;
    let variantName: string | null = null;
    let variantId: string | null = null;
    if (line.variantId) {
      const v = itemVariantsList.find((x) => x.id === line.variantId);
      if (!v) throw new PublicOrderError("item_unavailable", 409);
      price = v.priceCents;
      variantName = v.name;
      variantId = v.id;
    } else if (price == null && itemVariantsList.length) {
      throw new PublicOrderError("invalid", 400); // a variant must be chosen
    }
    if (price == null || price < 0) throw new PublicOrderError("item_unavailable", 409); // "price on request" is not orderable
    return {
      itemId: it.id,
      variantId,
      nameSnapshot: it.name,
      variantSnapshot: variantName,
      unitPriceCents: price,
      quantity: line.quantity,
      note: cfg.allowNotes ? clean(line.note, 200) : null,
    };
  });
  const totalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  if (totalCents > 10_000_000) throw new PublicOrderError("invalid", 400);

  const status: OrderStatus = cfg.acceptMode === "auto" ? "accepted" : "pending";
  const publicId = randomToken(12);
  const guestLocale = ALL_LOCALES.includes(input.locale) ? input.locale : null;

  const order = await db.transaction(async (tx) => {
    // Serialize number assignment per restaurant.
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${"orders:" + r.id}))`);
    const [n] = await tx
      .select({ next: dsql<number>`(coalesce(max(${orders.number}), 0) + 1)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, r.id),
          gte(orders.createdAt, dsql`(date_trunc('day', now() at time zone ${r.timezone}) at time zone ${r.timezone})`),
        ),
      );
    const [o] = await tx
      .insert(orders)
      .values({
        restaurantId: r.id,
        tableId: table?.id ?? null,
        number: n.next,
        status,
        autoAccepted: status === "accepted",
        totalCents,
        currency: r.currency,
        guestNote: cfg.allowNotes ? clean(input.note, 500) : null,
        guestLocale,
        publicId,
      })
      .returning();
    await tx.insert(orderItems).values(lines.map((l) => ({ ...l, orderId: o.id })));
    return o;
  });

  await Promise.allSettled([
    publish(ORDER_CHANNEL, { restaurantId: r.id, type: "order.created", id: order.id }),
    trackEvent({
      restaurantId: r.id,
      type: "order_placed",
      headers: reqHeaders,
      tableId: table?.id ?? null,
      locale: guestLocale,
      meta: { orderId: order.id, totalCents, items: lines.length },
    }),
  ]).then((res) => res.forEach((x) => x.status === "rejected" && console.error("[orders] post-commit", x.reason)));

  return { publicId: order.publicId, number: order.number, status: order.status, totalCents: order.totalCents };
}

export async function getPublicOrder(publicId: string) {
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId)).limit(1);
  if (!o) return null;
  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
  return {
    publicId: o.publicId,
    number: o.number,
    status: o.status,
    totalCents: o.totalCents,
    currency: o.currency,
    createdAt: o.createdAt.toISOString(),
    items: lines.map((l) => ({ name: l.nameSnapshot, variant: l.variantSnapshot, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
    rejectReason: o.status === "rejected" ? o.rejectReason : null,
  };
}

// ------------------------------------------------------------------ staff side

export type BoardOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  autoAccepted: boolean;
  tableId: string | null;
  tableLabel: string | null;
  tableArea: string | null;
  totalCents: number;
  currency: string;
  guestNote: string | null;
  guestLocale: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: { name: string; variant: string | null; quantity: number; unitPriceCents: number; note: string | null }[];
};

type OrderRow = typeof orders.$inferSelect & { tableLabel: string | null; tableArea: string | null };

async function hydrate(rows: OrderRow[]): Promise<BoardOrder[]> {
  if (!rows.length) return [];
  const lines = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, rows.map((r) => r.id)));
  const byOrder = new Map<string, typeof lines>();
  for (const l of lines) (byOrder.get(l.orderId) ?? byOrder.set(l.orderId, []).get(l.orderId)!).push(l);
  return rows.map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    autoAccepted: o.autoAccepted,
    tableId: o.tableId,
    tableLabel: o.tableLabel,
    tableArea: o.tableArea,
    totalCents: o.totalCents,
    currency: o.currency,
    guestNote: o.guestNote,
    guestLocale: o.guestLocale,
    rejectReason: o.rejectReason,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    items: (byOrder.get(o.id) ?? []).map((l) => ({
      name: l.nameSnapshot,
      variant: l.variantSnapshot,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      note: l.note,
    })),
  }));
}

const baseSelect = () =>
  db
    .select({
      ...orderColumns(),
      tableLabel: tables.label,
      tableArea: tables.area,
    })
    .from(orders)
    .leftJoin(tables, eq(tables.id, orders.tableId));

function orderColumns() {
  return {
    id: orders.id,
    restaurantId: orders.restaurantId,
    tableId: orders.tableId,
    number: orders.number,
    status: orders.status,
    autoAccepted: orders.autoAccepted,
    totalCents: orders.totalCents,
    currency: orders.currency,
    guestNote: orders.guestNote,
    guestLocale: orders.guestLocale,
    publicId: orders.publicId,
    rejectReason: orders.rejectReason,
    handledBy: orders.handledBy,
    createdAt: orders.createdAt,
    updatedAt: orders.updatedAt,
  };
}

/** Board: all open orders + orders served in the last 3 hours. */
export async function listBoardOrders(restaurantId: string) {
  const since = new Date(Date.now() - 3 * 36e5);
  const rows = await baseSelect()
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        or(inArray(orders.status, ACTIVE_STATUSES), and(eq(orders.status, "served"), gte(orders.updatedAt, since))),
      ),
    )
    .orderBy(orders.createdAt)
    .limit(300);
  return hydrate(rows);
}

export type HistoryFilter = { range: "today" | "7d"; status?: OrderStatus | null; tableId?: string | null };

export async function listOrderHistory(restaurantId: string, timezone: string, f: HistoryFilter) {
  const days = f.range === "today" ? 0 : 6;
  const conds = [
    eq(orders.restaurantId, restaurantId),
    gte(
      orders.createdAt,
      dsql`((date_trunc('day', now() at time zone ${timezone}) - make_interval(days => ${days})) at time zone ${timezone})`,
    ),
  ];
  if (f.status) conds.push(eq(orders.status, f.status));
  if (f.tableId) conds.push(eq(orders.tableId, f.tableId));
  const rows = await baseSelect()
    .where(and(...conds))
    .orderBy(desc(orders.createdAt))
    .limit(500);
  return hydrate(rows);
}

export async function countOpenOrders(restaurantId: string) {
  const [r] = await db
    .select({
      pending: dsql<number>`count(*) filter (where ${orders.status} = 'pending')::int`,
      open: dsql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), inArray(orders.status, ACTIVE_STATUSES)));
  return r;
}

export async function updateOrderStatus(
  restaurantId: string,
  orderId: string,
  to: OrderStatus,
  userId: string | null,
  rejectReason?: string | null,
) {
  const [o] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.restaurantId, restaurantId)))
    .limit(1);
  if (!o) throw new AppError("notFound");
  if (o.status === to) return o;
  if (!canTransition(o.status, to)) throw new AppError("validation", `transition ${o.status} → ${to}`);
  const [updated] = await db
    .update(orders)
    .set({
      status: to,
      handledBy: userId,
      updatedAt: new Date(),
      rejectReason: to === "rejected" ? clean(rejectReason, 300) : o.rejectReason,
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, o.status)))
    .returning();
  if (!updated) throw new AppError("validation", "order changed concurrently");
  await publish(ORDER_CHANNEL, { restaurantId, type: "order.updated", id: orderId }).catch((e) =>
    console.error("[orders] publish", e),
  );
  return updated;
}

/** Tables for the history filter (incl. inactive ones). */
export async function tableOptions(restaurantId: string) {
  return db
    .select({ id: tables.id, label: tables.label })
    .from(tables)
    .where(eq(tables.restaurantId, restaurantId))
    .orderBy(tables.sort, tables.label);
}

