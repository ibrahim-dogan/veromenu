import { studioRoute } from "@/modules/theme-studio/http";
import { flatGuestMessages, printPreviewViews } from "@/modules/theme-studio/service";

/**
 * GET /api/restaurants/[rid]/themes/print-data?source=real|sample → PrintViews (generic card + tables, max 24) +
 * guest strings for the print-design preview (studio, tables page). The QR is rendered by the engine from table.url.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/themes/print-data">) {
  const { rid } = await params;
  const source = new URL(req.url).searchParams.get("source") === "sample" ? "sample" : "real";
  return studioRoute(
    rid,
    async (ctx) => {
      const r = ctx.restaurant;
      const res = await printPreviewViews(r, source);
      const locale = r.defaultLocale;
      return { views: res.views, source: res.source, total: res.total, locale, guestMessages: flatGuestMessages(locale) };
    },
    "print",
  );
}
