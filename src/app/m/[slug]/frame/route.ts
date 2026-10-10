import type { NextRequest } from "next/server";
import { decodeConfigParam } from "@/themes/config";
import { loadGuestMenu, getGuestRestaurantRow } from "@/modules/guest/load";
import { getGuestMessages } from "@/modules/guest/i18n";
import { renderErrorDocument, themeFrameHeaders } from "@/modules/theme-engine";
import { renderStudioGuest, selectStudioTheme, themeAssetBase } from "@/modules/theme-engine/guest";

/**
 * Sandboxed theme document: GET /m/[slug]/frame?lang&t[&preview=1&theme=<id>&v=<versionId>&config=<b64>]
 * Rendered from the published version; preview params only for users with theme.manage on the restaurant.
 * Response CSP: `sandbox allow-scripts` (opaque origin even when opened directly) + no network.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sp = req.nextUrl.searchParams;
  const assetBase = themeAssetBase();
  const wantsPreview = sp.get("preview") === "1";
  const themeParam = sp.get("theme");
  const previewTheme = themeParam ? (themeParam.startsWith("studio:") ? themeParam : `studio:${themeParam}`) : null;

  const res = await loadGuestMenu(slug, {
    lang: sp.get("lang"),
    tableToken: sp.get("t"),
    acceptLanguage: req.headers.get("accept-language"),
    preview: wantsPreview && previewTheme ? { themeId: previewTheme, config: decodeConfigParam(sp.get("config")) } : null,
  });

  const errorResponse = (status: number, locale = "de", name = "Menu") =>
    new Response(
      renderErrorDocument({
        view: { locale, dir: "ltr", mode: "live", restaurant: { name } as never },
        assetBaseUrl: assetBase,
        guestMessages: getGuestMessages(locale) as Record<string, unknown>,
        errors: [],
      }),
      { status, headers: themeFrameHeaders(assetBase, { noStore: true }) },
    );

  if (res.status !== "ok") return errorResponse(404, res.status === "suspended" ? res.locale : "de", res.status === "suspended" ? res.name : "Menu");
  const { data } = res;
  const row = await getGuestRestaurantRow(slug);
  const sel = row ? await selectStudioTheme(data, { plan: row.plan, activeThemeId: row.themeId, versionId: sp.get("v") }) : null;
  if (!sel) return errorResponse(404, data.locale, data.restaurant.name);

  const out = await renderStudioGuest(data, sel);
  return new Response(out.html, { status: out.ok ? 200 : 500, headers: themeFrameHeaders(assetBase, { noStore: data.preview }) });
}
