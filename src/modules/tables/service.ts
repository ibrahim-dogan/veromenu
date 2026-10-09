import "server-only";
import { and, asc, eq, sql as dsql } from "drizzle-orm";
import { db, type DbOrTx } from "@/core/db";
import { restaurants, tables } from "@/core/db/schema";
import { AppError } from "@/core/http/errors";
import { randomToken } from "@/core/crypto";
import { env } from "@/core/env";
import { getPlan, planHas } from "@/modules/billing/plans";

/**
 * Tables & QR codes. Every table has a random public token: /m/{slug}?t={token}.
 * Regenerating the token invalidates printed QR codes of that table.
 */
export type TableRow = typeof tables.$inferSelect;

export type TableInput = { label: string; area?: string | null; seats?: number | null; isActive?: boolean };

export const newTableToken = () => randomToken(12);

/** Guest menu URL encoded in QR codes (contract: /m/{slug} or /m/{slug}?t={token}). */
export function guestMenuUrl(slug: string, token?: string | null) {
  const base = env().APP_URL.replace(/\/+$/, "");
  return token ? `${base}/m/${slug}?t=${encodeURIComponent(token)}` : `${base}/m/${slug}`;
}

export async function listTables(restaurantId: string, tx: DbOrTx = db) {
  return tx
    .select()
    .from(tables)
    .where(eq(tables.restaurantId, restaurantId))
    .orderBy(asc(tables.sort), asc(tables.createdAt));
}

export async function getTable(restaurantId: string, tableId: string, tx: DbOrTx = db) {
  const [row] = await tx
    .select()
    .from(tables)
    .where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId)))
    .limit(1);
  if (!row) throw new AppError("notFound");
  return row;
}

/** Active table for a public token (used by the guest menu + ordering). */
export async function findActiveTableByToken(restaurantId: string, token: string | null | undefined, tx: DbOrTx = db) {
  if (!token || token.length > 64) return null;
  const [row] = await tx
    .select()
    .from(tables)
    .where(and(eq(tables.token, token), eq(tables.restaurantId, restaurantId), eq(tables.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function tableUsage(restaurantId: string, tx: DbOrTx = db) {
  const [r] = await tx.select({ plan: restaurants.plan }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  const [c] = await tx.select({ n: dsql<number>`count(*)::int` }).from(tables).where(eq(tables.restaurantId, restaurantId));
  const plan = r?.plan ?? "free";
  return { used: c.n, limit: getPlan(plan).limits.tables, enabled: planHas(plan, "tables") };
}

async function assertTableCapacity(restaurantId: string, adding: number, tx: DbOrTx) {
  const u = await tableUsage(restaurantId, tx);
  if (!u.enabled) throw new AppError("featureNotInPlan");
  if (u.used + adding > u.limit) throw new AppError("planLimit", `${u.used}/${u.limit}`);
}

async function nextSort(restaurantId: string, tx: DbOrTx) {
  const [r] = await tx
    .select({ m: dsql<number>`coalesce(max(${tables.sort}), -1)::int` })
    .from(tables)
    .where(eq(tables.restaurantId, restaurantId));
  return r.m + 1;
}

export async function createTable(restaurantId: string, input: TableInput, tx: DbOrTx = db) {
  return tx.transaction(async (t) => {
    await lockRestaurant(t, restaurantId);
    await assertTableCapacity(restaurantId, 1, t);
    const [row] = await t
      .insert(tables)
      .values({
        restaurantId,
        label: input.label,
        area: input.area || null,
        seats: input.seats ?? null,
        isActive: input.isActive ?? true,
        token: newTableToken(),
        sort: await nextSort(restaurantId, t),
      })
      .returning();
    return row;
  });
}

/** "Tisch 1–12": creates `prefix from..to`, skipping labels that already exist. */
export async function bulkCreateTables(
  restaurantId: string,
  input: { prefix: string; from: number; to: number; area?: string | null; seats?: number | null },
  tx: DbOrTx = db,
) {
  if (input.to < input.from || input.to - input.from > 199) throw new AppError("validation");
  return tx.transaction(async (t) => {
    await lockRestaurant(t, restaurantId);
    const existing = new Set(
      (await t.select({ label: tables.label }).from(tables).where(eq(tables.restaurantId, restaurantId))).map((r) =>
        r.label.trim().toLowerCase(),
      ),
    );
    const labels: string[] = [];
    for (let n = input.from; n <= input.to; n++) {
      const label = `${input.prefix.trim()} ${n}`.trim();
      if (!existing.has(label.toLowerCase())) labels.push(label);
    }
    if (!labels.length) return [];
    await assertTableCapacity(restaurantId, labels.length, t);
    const start = await nextSort(restaurantId, t);
    return t
      .insert(tables)
      .values(
        labels.map((label, i) => ({
          restaurantId,
          label,
          area: input.area || null,
          seats: input.seats ?? null,
          token: newTableToken(),
          sort: start + i,
        })),
      )
      .returning();
  });
}

export async function updateTable(restaurantId: string, tableId: string, patch: Partial<TableInput>, tx: DbOrTx = db) {
  await getTable(restaurantId, tableId, tx);
  const set: Partial<typeof tables.$inferInsert> = {};
  if (patch.label !== undefined) set.label = patch.label;
  if (patch.area !== undefined) set.area = patch.area || null;
  if (patch.seats !== undefined) set.seats = patch.seats ?? null;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (!Object.keys(set).length) return getTable(restaurantId, tableId, tx);
  const [row] = await tx
    .update(tables)
    .set(set)
    .where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId)))
    .returning();
  return row;
}

export async function deleteTable(restaurantId: string, tableId: string, tx: DbOrTx = db) {
  const row = await getTable(restaurantId, tableId, tx);
  await tx.delete(tables).where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId)));
  return row;
}

/** New token → old printed QR code of this table stops working. */
export async function regenerateTableToken(restaurantId: string, tableId: string, tx: DbOrTx = db) {
  await getTable(restaurantId, tableId, tx);
  const [row] = await tx
    .update(tables)
    .set({ token: newTableToken() })
    .where(and(eq(tables.id, tableId), eq(tables.restaurantId, restaurantId)))
    .returning();
  return row;
}

/** Serializes concurrent limit checks per restaurant inside a transaction. */
async function lockRestaurant(tx: DbOrTx, restaurantId: string) {
  await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${"tables:" + restaurantId}))`);
}
