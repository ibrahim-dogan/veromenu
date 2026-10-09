import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigserial,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { restaurants } from "./tenancy";
import { items, itemVariants } from "./menu";

/** Physical tables. Each has its own QR token. The restaurant also has a generic (table-less) QR. */
export const tables = pgTable(
  "tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // "Tisch 12"
    area: text("area"), // "Terrasse"
    /** Random public token used in the QR URL: /m/{slug}?t={token} */
    token: text("token").notNull(),
    seats: integer("seats"),
    sort: integer("sort").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tables_token_uq").on(t.token), index("tables_restaurant_idx").on(t.restaurantId)],
);

export type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "served" | "rejected" | "cancelled";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableId: uuid("table_id").references(() => tables.id, { onDelete: "set null" }),
    /** Short human number, resets daily per restaurant. */
    number: integer("number").notNull(),
    status: text("status").$type<OrderStatus>().notNull().default("pending"),
    autoAccepted: boolean("auto_accepted").notNull().default(false),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    guestNote: text("guest_note"),
    guestLocale: text("guest_locale"),
    /** Public random id so guests can poll their order status without auth. */
    publicId: text("public_id").notNull(),
    rejectReason: text("reject_reason"),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_restaurant_idx").on(t.restaurantId, t.createdAt),
    uniqueIndex("orders_public_uq").on(t.publicId),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => itemVariants.id, { onDelete: "set null" }),
    /** Snapshots so history stays correct after menu edits. */
    nameSnapshot: text("name_snapshot").notNull(),
    variantSnapshot: text("variant_snapshot"),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note"),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export type AnalyticsEventType =
  | "menu_view"
  | "qr_scan"
  | "item_view"
  | "category_view"
  | "locale_switch"
  | "order_placed"
  | "cart_add";

/**
 * Cookie-less analytics (no consent banner needed, TDDDG §25):
 * `visitorHash` = sha256(ip + ua + restaurantId + daily salt) – not reversible, rotates daily.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    type: text("type").$type<AnalyticsEventType>().notNull(),
    tableId: uuid("table_id"),
    itemId: uuid("item_id"),
    categoryId: uuid("category_id"),
    locale: text("locale"),
    visitorHash: text("visitor_hash"),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("analytics_restaurant_time_idx").on(t.restaurantId, t.createdAt),
    index("analytics_type_idx").on(t.restaurantId, t.type, t.createdAt),
  ],
);
