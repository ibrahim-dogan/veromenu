"use server";
import { z } from "zod";
import { action } from "@/core/http/action";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import {
  bulkCreateTables,
  createTable,
  deleteTable,
  regenerateTableToken,
  updateTable,
} from "./service";

const rid = z.uuid();
const label = z.string().trim().min(1).max(60);
const area = z.string().trim().max(60).nullish();
const seats = z.number().int().min(1).max(500).nullish();

export const createTableAction = action(
  z.object({ restaurantId: rid, label, area, seats, isActive: z.boolean().optional() }),
  async ({ restaurantId, ...input }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "tables.manage");
    const row = await createTable(restaurantId, input);
    await audit({ restaurantId, userId: ctx.user.id, action: "tables.create", entityType: "table", entityId: row.id, data: { label: row.label } });
    return { id: row.id };
  },
);

export const bulkCreateTablesAction = action(
  z.object({
    restaurantId: rid,
    prefix: z.string().trim().max(40),
    from: z.number().int().min(0).max(9999),
    to: z.number().int().min(0).max(9999),
    area,
    seats,
  }),
  async ({ restaurantId, ...input }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "tables.manage");
    const rows = await bulkCreateTables(restaurantId, input);
    await audit({ restaurantId, userId: ctx.user.id, action: "tables.bulk_create", data: { count: rows.length, from: input.from, to: input.to } });
    return { created: rows.length };
  },
);

export const updateTableAction = action(
  z.object({ restaurantId: rid, tableId: z.uuid(), label: label.optional(), area, seats, isActive: z.boolean().optional() }),
  async ({ restaurantId, tableId, ...patch }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "tables.manage");
    await updateTable(restaurantId, tableId, patch);
    await audit({ restaurantId, userId: ctx.user.id, action: "tables.update", entityType: "table", entityId: tableId, data: patch });
    return null;
  },
);

export const deleteTableAction = action(z.object({ restaurantId: rid, tableId: z.uuid() }), async ({ restaurantId, tableId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "tables.manage");
  const row = await deleteTable(restaurantId, tableId);
  await audit({ restaurantId, userId: ctx.user.id, action: "tables.delete", entityType: "table", entityId: tableId, data: { label: row.label } });
  return null;
});

export const regenerateTableTokenAction = action(
  z.object({ restaurantId: rid, tableId: z.uuid() }),
  async ({ restaurantId, tableId }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "tables.manage");
    const row = await regenerateTableToken(restaurantId, tableId);
    await audit({ restaurantId, userId: ctx.user.id, action: "tables.regenerate_token", entityType: "table", entityId: tableId, data: { label: row.label } });
    return null;
  },
);
