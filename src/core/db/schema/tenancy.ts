import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./auth";

export type RestaurantSettings = {
  address?: { street?: string; zip?: string; city?: string; country?: string };
  phone?: string;
  email?: string;
  website?: string;
  cuisine?: string;
  /** Impressum data shown on the guest menu (DDG §5). */
  legal?: {
    companyName?: string;
    representative?: string;
    registerCourt?: string;
    registerNumber?: string;
    vatId?: string;
    extra?: string;
  };
  openingHours?: { day: number; open: string; close: string }[];
  /** Guest menu presentation */
  menuMode?: "digital" | "pdf";
  logoMediaId?: string | null;
  coverMediaId?: string | null;
  /** Ordering module */
  ordering?: {
    enabled: boolean;
    /** manual: staff must accept each order. auto: accepted automatically. */
    acceptMode: "manual" | "auto";
    /** Only allow orders from table QR codes (not from the generic QR). */
    requireTable: boolean;
    allowNotes: boolean;
  };
  translations?: {
    /** Show only reviewed/approved translations to guests (else fall back to source). */
    guestsSeeOnlyApproved: boolean;
    /** Auto-approve translations whose AI review score >= threshold. */
    autoApproveThreshold: number | null;
  };
};

export const restaurants = pgTable(
  "restaurants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    /** Plan id from modules/billing/plans.ts */
    plan: text("plan").notNull().default("free"),
    planValidUntil: timestamp("plan_valid_until", { withTimezone: true }),
    /** Source language of all menu content. Germany first → "de". */
    defaultLocale: text("default_locale").notNull().default("de"),
    /** Languages the owner allows on the guest menu (always includes defaultLocale). */
    enabledLocales: text("enabled_locales").array().notNull().default(["de"]),
    currency: text("currency").notNull().default("EUR"),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    themeId: text("theme_id").notNull().default("classic"),
    themeConfig: jsonb("theme_config").$type<Record<string, unknown>>().notNull().default({}),
    settings: jsonb("settings").$type<RestaurantSettings>().notNull().default({}),
    /** Enabled feature modules (ordering, tables, ai ...); gated additionally by plan. */
    modules: text("modules").array().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("restaurants_slug_uq").on(t.slug)],
);

/** Restaurant-scoped role with a free set of permission strings (see core/auth/permissions.ts). */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** System roles (owner) cannot be deleted / stripped. */
    key: text("key"), // owner | manager | service | kitchen | editor | null (custom)
    permissions: text("permissions").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("roles_restaurant_idx").on(t.restaurantId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_uq").on(t.restaurantId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invitations_restaurant_idx").on(t.restaurantId), uniqueIndex("invitations_token_uq").on(t.tokenHash)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. "menu.item.update"
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_restaurant_idx").on(t.restaurantId, t.createdAt)],
);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

