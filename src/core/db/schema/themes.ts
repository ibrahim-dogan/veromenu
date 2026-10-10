import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { restaurants } from "./tenancy";

/**
 * Studio themes (theme engine v2): code packages (manifest + Liquid templates + CSS/JS) that render the
 * guest menu inside a sandboxed iframe. See docs/THEMES.md and src/modules/theme-engine/types.ts.
 * restaurantId null = platform library theme (usable/duplicable by every restaurant).
 */
export const themes = pgTable(
  "themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /** How it was created: starter | ai_prompt | ai_file | manual | import | duplicate | library */
    origin: text("origin").notNull().default("manual"),
    parentThemeId: uuid("parent_theme_id"),
    /** Latest saved version (editor works on it). */
    currentVersionId: uuid("current_version_id"),
    /** Version guests see when this theme is active. */
    publishedVersionId: uuid("published_version_id"),
    previewMediaId: uuid("preview_media_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("themes_restaurant_idx").on(t.restaurantId)],
);

/** Immutable snapshots of a theme package – every save creates one (history + rollback). */
export const themeVersions = pgTable(
  "theme_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    themeId: uuid("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** ThemePackage JSON: { manifest, files } */
    package: jsonb("package").$type<unknown>().notNull(),
    note: text("note"),
    /** "user" | "ai" | "import" | "system" */
    author: text("author").notNull().default("user"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("theme_versions_theme_idx").on(t.themeId, t.number)],
);
