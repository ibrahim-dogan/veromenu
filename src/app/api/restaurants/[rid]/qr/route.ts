import { and, eq } from "drizzle-orm";
import { db } from "@/core/db";
import { tables } from "@/core/db/schema";
import { guestMenuUrl } from "@/modules/tables/service";
import { clampQrSize, qrPng, qrSvg } from "@/modules/tables/qr";
import { canUseTableQr, jsonError, recordQrDownload, routeContext, safeFilename } from "@/modules/tables/files";

/**
 * GET /api/restaurants/[rid]/qr?table=<id>&format=png|svg&size=512&download=1
 * Without `table` → generic restaurant QR (every plan). With `table` → plan feature "tables".
 */
export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/qr">) {
  const { rid } = await params;
  const ctx = await routeContext(rid, "tables.manage");
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "svg" ? "svg" : "png";
  const size = clampQrSize(url.searchParams.get("size"));
  const tableId = url.searchParams.get("table");
  const download = url.searchParams.get("download") === "1";

  let target = guestMenuUrl(ctx.restaurant.slug);
  let name = `${ctx.restaurant.slug}-qr`;
  if (tableId) {
    if (!/^[0-9a-f-]{36}$/i.test(tableId)) return jsonError("invalid", 400);
    if (!canUseTableQr(ctx)) return jsonError("featureNotInPlan", 403);
    const [t] = await db
      .select()
      .from(tables)
      .where(and(eq(tables.id, tableId), eq(tables.restaurantId, rid)))
      .limit(1);
    if (!t) return jsonError("notFound", 404);
    target = guestMenuUrl(ctx.restaurant.slug, t.token);
    name = `${ctx.restaurant.slug}-${safeFilename(t.label)}`;
  }

  const headers: Record<string, string> = { "cache-control": "private, no-store" };
  if (download) {
    headers["content-disposition"] = `attachment; filename="${safeFilename(name)}.${format}"`;
    await recordQrDownload(ctx, { format, table: tableId ?? null });
  }
  if (format === "svg") {
    return new Response(await qrSvg(target, size), { headers: { ...headers, "content-type": "image/svg+xml; charset=utf-8" } });
  }
  const png = await qrPng(target, size);
  return new Response(new Uint8Array(png), { headers: { ...headers, "content-type": "image/png" } });
}
