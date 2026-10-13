import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { restaurants } from "./tenancy";

/**
 * Long-running background jobs (in-process runner, single instance). The UI polls the row.
 * kind "menu_kit": one upload → menu import + logo + menu theme + print design.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status", { enum: ["queued", "running", "done", "failed", "cancelled"] }).notNull().default("queued"),
    /** Per-step progress: { [step]: { status: "pending"|"running"|"done"|"failed"|"skipped", detail?, error? } } */
    steps: jsonb("steps").$type<Record<string, { status: string; detail?: unknown; error?: string }>>().notNull().default({}),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_restaurant_idx").on(t.restaurantId, t.createdAt)],
);
