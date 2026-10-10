import { getThemeWithPackage } from "@/modules/theme-engine/service";
import { isUuid, studioError, studioRoute } from "@/modules/theme-studio/http";

/** GET /api/restaurants/[rid]/themes/[themeId]/versions/[versionId] → package of one version (studio version preview). */
export async function GET(_req: Request, { params }: RouteContext<"/api/restaurants/[rid]/themes/[themeId]/versions/[versionId]">) {
  const { rid, themeId, versionId } = await params;
  if (!isUuid(themeId) || !isUuid(versionId)) return studioError("notFound", 404);
  return studioRoute(rid, async () => {
    const res = await getThemeWithPackage(rid, themeId, versionId);
    return { versionId: res.versionId, pkg: res.pkg };
  }, { themeId });
}
