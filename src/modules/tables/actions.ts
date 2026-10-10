"use server";
import { z } from "zod";
import { action } from "@/core/http/action";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import { AppError } from "@/core/http/errors";
import { deleteTheme, duplicateTheme, getPrintDesign, publishTheme, saveThemeVersion, selectPrintDesign } from "@/modules/theme-engine/service";
import { resolveSettings } from "@/modules/theme-engine/settings";
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

// ---------------------------------------------------------------- QR print designs (theme packages of kind "print")

const themeId = z.uuid();
const printConfig = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).refine((c) => Object.keys(c).length <= 80);

/** Selects a print design (own or library) and stores its customizer values → settings.print = { themeId, config }. */
export const selectPrintDesignAction = action(
  z.object({ restaurantId: rid, themeId, config: printConfig.optional() }),
  async ({ restaurantId, themeId, config }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "tables.manage");
    const sel = await selectPrintDesign({ restaurantId, themeId, config, userId: ctx.user.id });
    return { themeId: sel.themeId };
  },
);

/** Copies a print design into an own design (Theme Studio plan; createTheme enforces it). */
export const duplicatePrintDesignAction = action(z.object({ restaurantId: rid, themeId }), async ({ restaurantId, themeId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "tables.manage");
  await getPrintDesign(restaurantId, themeId); // print kind only
  return duplicateTheme({ restaurantId, themeId, userId: ctx.user.id });
});

/** Deletes an own print design (refused while it is the selected one). */
export const deletePrintDesignAction = action(z.object({ restaurantId: rid, themeId }), async ({ restaurantId, themeId }) => {
  await assertRestaurantPermission(restaurantId, "tables.manage");
  const d = await getPrintDesign(restaurantId, themeId);
  if (d.theme.restaurantId !== restaurantId) throw new AppError("forbidden");
  await deleteTheme(restaurantId, themeId);
  return null;
});

/**
 * "Als Standard": writes the current customizer values as manifest defaults of an OWN print design (new version,
 * published + selected with these values). Library designs must be duplicated first.
 */
export const savePrintDefaultsAction = action(
  z.object({ restaurantId: rid, themeId, config: printConfig }),
  async ({ restaurantId, themeId, config }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "tables.manage");
    const d = await getPrintDesign(restaurantId, themeId);
    if (d.theme.restaurantId !== restaurantId) throw new AppError("forbidden", "library_design");
    const values = resolveSettings(d.pkg.manifest, config);
    const manifest = {
      ...d.pkg.manifest,
      settings: d.pkg.manifest.settings.map((f) => (f.type === "image" ? f : ({ ...f, default: values[f.id] ?? f.default } as typeof f))),
    };
    const saved = await saveThemeVersion({ restaurantId, themeId, pkg: { manifest, files: d.pkg.files }, note: "Standardwerte (Tische & QR-Codes)", author: "user", userId: ctx.user.id });
    await publishTheme({ restaurantId, themeId, versionId: saved.versionId, userId: ctx.user.id, config: values });
    return { versionId: saved.versionId };
  },
);
