import { isUuid, studioRoute } from "@/modules/theme-studio/http";
import { resolvePreviewMedia } from "@/modules/theme-studio/service";

/** GET /api/restaurants/[rid]/themes/media?ids=<uuid>,<uuid> → media id → URLs (image settings / manifest.assets in the studio preview). */
export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/themes/media">) {
  const { rid } = await params;
  const ids = [...new Set((new URL(req.url).searchParams.get("ids") ?? "").split(","))].filter(isUuid).slice(0, 60);
  return studioRoute(rid, async () => (ids.length ? resolvePreviewMedia(rid, ids) : {}));
}
