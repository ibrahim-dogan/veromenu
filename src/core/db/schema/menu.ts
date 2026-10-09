import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { restaurants } from "./tenancy";

/** Uploaded or AI-generated files (images, PDFs). */
export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["upload", "ai_generated"] }).notNull().default("upload"),
    /** Storage key of the original file (see core/storage). */
    storageKey: text("storage_key").notNull(),
    /** Optimized variants for images: { sm: key, md: key } (webp). */
    variants: jsonb("variants").$type<Record<string, string>>().notNull().default({}),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    alt: text("alt"),
    /** For AI images: prompt + reference image used (EU AI Act transparency). */
    aiPrompt: text("ai_prompt"),
    aiModel: text("ai_model"),
    sourceMediaId: uuid("source_media_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_restaurant_idx").on(t.restaurantId)],
);

/** A restaurant can have several menus (Speisekarte, Getränkekarte, Mittagstisch ...). */
export const menus = pgTable(
  "menus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    sort: integer("sort").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    /** Optional time windows, e.g. lunch menu: [{days:[1..5], from:"11:30", to:"14:30"}] */
    schedule: jsonb("schedule").$type<{ days: number[]; from: string; to: string }[]>(),
    /** PDF / image menu mode: ordered media ids shown instead of the digital menu. */
    pdfMediaIds: uuid("pdf_media_ids").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("menus_restaurant_idx").on(t.restaurantId)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    /** Source-language texts (restaurant.defaultLocale). Other languages → translations table. */
    name: text("name").notNull(),
    description: text("description"),
    imageMediaId: uuid("image_media_id").references(() => media.id, { onDelete: "set null" }),
    sort: integer("sort").notNull().default(0),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("categories_menu_idx").on(t.menuId, t.sort)],
);

export type AllergenStatus = "unknown" | "ai_suggested" | "needs_review" | "confirmed";

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Internal ingredient list (helps AI allergen detection; optional to show). */
    ingredients: text("ingredients"),
    /** Base price in cents incl. VAT (PAngV: Endpreise). null = "Preis auf Anfrage". */
    priceCents: integer("price_cents"),
    imageMediaId: uuid("image_media_id").references(() => media.id, { onDelete: "set null" }),
    sort: integer("sort").notNull().default(0),
    isVisible: boolean("is_visible").notNull().default(true),
    /** Temporarily sold out (still visible, not orderable). */
    isAvailable: boolean("is_available").notNull().default(true),
    /** Diet / feature tags: vegan, vegetarian, halal, spicy1..3, new, recommended, alcohol ... */
    tags: text("tags").array().notNull().default([]),
    /** CONFIRMED EU-14 allergen codes (see modules/allergens/catalog.ts). Only these are shown to guests. */
    allergens: text("allergens").array().notNull().default([]),
    /** CONFIRMED additive codes (ZZulV / LMIV Zusatzstoffe). */
    additives: text("additives").array().notNull().default([]),
    allergenStatus: text("allergen_status").$type<AllergenStatus>().notNull().default("unknown"),
    allergenConfirmedBy: uuid("allergen_confirmed_by").references(() => users.id, { onDelete: "set null" }),
    allergenConfirmedAt: timestamp("allergen_confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("items_category_idx").on(t.categoryId, t.sort), index("items_restaurant_idx").on(t.restaurantId)],
);

/** Size / portion variants (0,3 l / 0,5 l, klein / groß). */
export const itemVariants = pgTable(
  "item_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("variants_item_idx").on(t.itemId)],
);

export type TranslatableEntity = "menu" | "category" | "item" | "variant" | "restaurant";
export type TranslationStatus = "machine" | "needs_review" | "approved" | "stale";

/**
 * Translations of source texts into other locales.
 * `sourceHash` = hash of the source text at translation time → status becomes "stale" when the source changes.
 */
export const translations = pgTable(
  "translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    entityType: text("entity_type").$type<TranslatableEntity>().notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(), // name | description
    locale: text("locale").notNull(),
    value: text("value").notNull(),
    status: text("status").$type<TranslationStatus>().notNull().default("machine"),
    sourceHash: text("source_hash").notNull(),
    /** AI reviewer: 1..5 quality score, issues, and a back-translation into the source language. */
    qualityScore: real("quality_score"),
    reviewNotes: text("review_notes"),
    backTranslation: text("back_translation"),
    translatedBy: text("translated_by"), // model id or "human"
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("translations_uq").on(t.entityType, t.entityId, t.field, t.locale),
    index("translations_restaurant_idx").on(t.restaurantId, t.locale, t.status),
  ],
);

/** Per-restaurant glossary: fixed translations or "do not translate" terms (e.g. "Döner", "Currywurst"). */
export const glossary = pgTable(
  "glossary",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    term: text("term").notNull(),
    locale: text("locale"), // null = all locales
    translation: text("translation"), // null + doNotTranslate = keep term
    doNotTranslate: boolean("do_not_translate").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("glossary_restaurant_idx").on(t.restaurantId)],
);

/**
 * Generic human-review queue. Anything the AI is unsure about lands here:
 * allergens (ambiguous), translations (low score), menu imports (to confirm).
 */
export const reviewTasks = pgTable(
  "review_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["allergen", "translation", "menu_import", "other"] }).notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    title: text("title").notNull(),
    reason: text("reason"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status", { enum: ["open", "resolved", "dismissed"] }).notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_restaurant_idx").on(t.restaurantId, t.status, t.kind)],
);

/** AI menu import from photos / PDF. `result` holds the extracted structure for preview before applying. */
export const menuImports = pgTable(
  "menu_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["processing", "ready", "applied", "failed", "discarded"] })
      .notNull()
      .default("processing"),
    mediaIds: uuid("media_ids").array().notNull().default([]),
    result: jsonb("result").$type<unknown>(),
    error: text("error"),
    targetMenuId: uuid("target_menu_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => [index("menu_imports_restaurant_idx").on(t.restaurantId)],
);
