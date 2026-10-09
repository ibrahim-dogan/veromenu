import { getTranslations } from "next-intl/server";
import { guestMenuUrl } from "@/modules/tables/service";
import { buildQrPdf, scanPhrases, type QrCard } from "@/modules/tables/pdf";
import { canUseTableQr, jsonError, loadLogo, loadTables, recordQrDownload, routeContext, safeFilename } from "@/modules/tables/files";

/**
 * GET /api/restaurants/[rid]/qr/pdf?layout=sheet|tent&tables=all|<id,id>&generic=1&logo=1&locale=de
 * Printable QR material. `generic=1` adds the restaurant-wide QR card.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/qr/pdf">) {
  const { rid } = await params;
  const ctx = await routeContext(rid, "tables.manage");
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const layout = url.searchParams.get("layout") === "tent" ? "tent" : "sheet";
  const withLogo = url.searchParams.get("logo") !== "0";
  const generic = url.searchParams.get("generic") === "1";
  const tablesParam = url.searchParams.get("tables");
  const uiLocale = ["de", "en", "tr"].includes(url.searchParams.get("locale") ?? "") ? url.searchParams.get("locale")! : "de";
  const t = await getTranslations({ locale: uiLocale, namespace: "tables" });

  const cards: QrCard[] = [];
  if (generic) cards.push({ label: t("pdf.genericLabel"), url: guestMenuUrl(ctx.restaurant.slug) });

  if (tablesParam) {
    if (!canUseTableQr(ctx)) return jsonError("featureNotInPlan", 403);
    const ids = tablesParam === "all" ? "all" : tablesParam.split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 500);
    const rows = await loadTables(rid, ids);
    for (const row of rows) cards.push({ label: row.label, sublabel: row.area, url: guestMenuUrl(ctx.restaurant.slug, row.token) });
  }
  if (!cards.length) return jsonError("invalid", 400);

  const logo = withLogo ? await loadLogo(rid, ctx.restaurant.settings?.logoMediaId) : null;
  const pdf = await buildQrPdf({
    layout,
    restaurantName: ctx.restaurant.name,
    cards,
    phrases: scanPhrases(ctx.restaurant.enabledLocales),
    logo,
    title: `${ctx.restaurant.name} – ${t("pdf.title")}`,
  });
  await recordQrDownload(ctx, { format: "pdf", layout, count: cards.length });
  const filename = `${safeFilename(ctx.restaurant.slug)}-qr-${layout === "tent" ? "a6" : "a4"}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
