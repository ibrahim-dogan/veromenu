import { studioError, studioRoute } from "@/modules/theme-studio/http";
import { flatGuestMessages, previewView } from "@/modules/theme-studio/service";

/** GET /api/restaurants/[rid]/themes/preview-data?locale=de&source=real|sample → ThemeView + guest strings (studio preview). */
export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/themes/preview-data">) {
  const { rid } = await params;
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") ?? "";
  const source = url.searchParams.get("source") === "sample" ? "sample" : "real";
  if (!/^[a-z]{2}(?:-[A-Za-z]{2,4})?$/.test(locale)) return studioError("validation", 400, "locale");
  return studioRoute(rid, async (ctx) => {
    const res = await previewView(ctx.restaurant, locale, source);
    return { view: res.view, source: res.source, guestMessages: flatGuestMessages(res.locale) };
  });
}
