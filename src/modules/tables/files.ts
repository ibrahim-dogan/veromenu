import "server-only";
import { and, eq, inArray, gte, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { auditLog, media, tables } from "@/core/db/schema";
import { getRestaurantContext, type RestaurantContext } from "@/core/auth/guards";
import type { Permission } from "@/core/auth/permissions";
import { readMediaBuffer } from "@/core/storage/media";
import { audit } from "@/core/audit";
import { planHas } from "@/modules/billing/plans";

/** Shared helpers for the QR image / PDF route handlers. */
export const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function routeContext(rid: string, permission: Permission): Promise<RestaurantContext | Response> {
  const ctx = await getRestaurantContext(rid);
  if (!ctx) return jsonError("unauthorized", 401);
  if (!ctx.can(permission)) return jsonError("forbidden", 403);
  return ctx;
}

export const canUseTableQr = (ctx: RestaurantContext) => planHas(ctx.restaurant.plan, "tables");

export async function loadTables(restaurantId: string, ids: string[] | "all") {
  const where =
    ids === "all"
      ? and(eq(tables.restaurantId, restaurantId), eq(tables.isActive, true))
      : and(eq(tables.restaurantId, restaurantId), inArray(tables.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]));
  return db.select().from(tables).where(where).orderBy(tables.sort, tables.createdAt);
}

export async function loadLogo(restaurantId: string, mediaId: string | null | undefined) {
  if (!mediaId || !/^[0-9a-f-]{36}$/i.test(mediaId)) return null;
  const [m] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.restaurantId, restaurantId)))
    .limit(1);
  if (!m || !m.mime.startsWith("image/")) return null;
  return readMediaBuffer(m);
}

/** Records that QR material was downloaded (drives the "print QR codes" onboarding step). */
export async function recordQrDownload(ctx: RestaurantContext, data: Record<string, unknown>) {
  const since = new Date(Date.now() - 60_000);
  const [recent] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.restaurantId, ctx.restaurant.id), eq(auditLog.action, "qr.download"), gte(auditLog.createdAt, since)));
  if (recent.n > 5) return;
  await audit({ restaurantId: ctx.restaurant.id, userId: ctx.user.id, action: "qr.download", data });
}

export const safeFilename = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "qr";
