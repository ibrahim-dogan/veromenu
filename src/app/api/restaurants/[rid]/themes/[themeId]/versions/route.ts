import { listThemeVersions } from "@/modules/theme-engine/service";
import { isUuid, studioError, studioRoute } from "@/modules/theme-studio/http";

/** GET /api/restaurants/[rid]/themes/[themeId]/versions → version history (newest first). */
export async function GET(_req: Request, { params }: RouteContext<"/api/restaurants/[rid]/themes/[themeId]/versions">) {
  const { rid, themeId } = await params;
  if (!isUuid(themeId)) return studioError("notFound", 404);
  return studioRoute(rid, async () => {
    const list = await listThemeVersions(rid, themeId);
    return list.map((v) => ({ ...v, createdAt: v.createdAt.toISOString() }));
  }, { themeId });
}
