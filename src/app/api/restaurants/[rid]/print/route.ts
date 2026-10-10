import { randomBytes } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { AppError } from "@/core/http/errors";
import { canUseTableQr, jsonError, loadTables, recordQrDownload, routeContext } from "@/modules/tables/files";
import { buildPrintViews } from "@/modules/tables/print-designs";
import { getPrintDesign, getPrintSelection, resolveThemeMedia } from "@/modules/theme-engine/service";
import { escapeHtml } from "@/modules/theme-engine/liquid";
import { printDocumentCsp, printLayout, printPageCount, PRINT_LIMITS, renderPrintDocument } from "@/modules/theme-engine/print";
import { themeAssetBase } from "@/modules/theme-engine/guest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/restaurants/[rid]/print?theme=<id>&tables=all|<id,id>&generic=1&v=<versionId>&config=<json>&locale=de
 *
 * Printable HTML document of a QR print design (theme package of kind "print"): one card per table (+ the generic
 * restaurant card), imposed on physical pages. The browser prints it / saves it as PDF (no server-side PDF engine).
 * Defaults: theme = selected design (settings.print.themeId), config = stored customizer values of that design.
 * Security: session + tables.manage; per-table cards need the "tables" plan feature; the document runs sandboxed
 * (CSP sandbox, opaque origin) with only the host's nonce'd print script.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/print">) {
  const { rid } = await params;
  const ctx = await routeContext(rid, "tables.manage");
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const uiLocale = ["de", "en", "tr"].includes(url.searchParams.get("locale") ?? "") ? url.searchParams.get("locale")! : "de";
  const t = await getTranslations({ locale: uiLocale, namespace: "printDesigns" });

  const selection = await getPrintSelection(rid);
  const themeId = url.searchParams.get("theme") || selection?.themeId || "";
  const versionId = url.searchParams.get("v");
  if (!UUID.test(themeId) || (versionId && !UUID.test(versionId))) return jsonError("invalid", 400);

  let design;
  try {
    design = await getPrintDesign(rid, themeId, versionId);
  } catch (e) {
    if (e instanceof AppError && e.code === "notFound") return jsonError("notFound", 404);
    throw e;
  }

  // customizer values: explicit (unsaved changes from the tables page) → stored for this design → manifest defaults
  let config: Record<string, unknown> = selection?.themeId === design.theme.id ? selection.config : {};
  const rawConfig = url.searchParams.get("config");
  if (rawConfig) {
    if (rawConfig.length > 8000) return jsonError("invalid", 400);
    try {
      const parsed = JSON.parse(rawConfig) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return jsonError("invalid", 400);
      config = parsed as Record<string, unknown>;
    } catch {
      return jsonError("invalid", 400);
    }
  }

  const generic = url.searchParams.get("generic") === "1";
  const tablesParam = url.searchParams.get("tables");
  let rows: Awaited<ReturnType<typeof loadTables>> = [];
  if (tablesParam) {
    if (!canUseTableQr(ctx)) return jsonError("featureNotInPlan", 403);
    const ids = tablesParam === "all" ? "all" : tablesParam.split(",").filter((s) => UUID.test(s)).slice(0, PRINT_LIMITS.maxCards);
    rows = (await loadTables(rid, ids)).slice(0, PRINT_LIMITS.maxCards - (generic ? 1 : 0));
  }
  if (!generic && !rows.length) return jsonError("invalid", 400);

  const views = await buildPrintViews(ctx.restaurant, { tables: rows, generic, settings: config, mode: "print" });
  const assetBase = themeAssetBase();
  const nonce = randomBytes(16).toString("base64url");
  const spec = design.pkg.manifest.print;
  const layout = printLayout(spec);
  const pages = printPageCount(spec, views.length);
  const formatLabel = t(`format_${layout.format.replace(/-/g, "_")}`);

  const toolbar = `<div class="vm-screen-only vm-toolbar" role="region" aria-label="${escapeHtml(t("toolbar.label"))}">
<div class="vm-tb-text"><strong>${escapeHtml(design.theme.name)}</strong><span>${escapeHtml(t("summary", { cards: views.length, pages, format: formatLabel }))}</span><small>${escapeHtml(t("toolbar.hint"))}</small></div>
<button type="button" id="vm-print">${escapeHtml(t("toolbar.print"))}</button>
</div>
<style>
@media screen{body{padding-top:96px!important}
.vm-toolbar{position:fixed;inset:0 0 auto 0;z-index:100;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 20px;background:#1c1917;color:#fafaf9;font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 2px 12px rgb(0 0 0/.25)}
.vm-tb-text{display:flex;flex-direction:column;min-width:0}.vm-tb-text span{color:#d6d3d1}.vm-tb-text small{color:#a8a29e;font-size:12px}
#vm-print{flex:none;font:600 14px system-ui,sans-serif;padding:10px 20px;border:0;border-radius:999px;background:#fafaf9;color:#1c1917;cursor:pointer}
#vm-print:focus-visible{outline:2px solid #fbbf24;outline-offset:2px}}
@media print{.vm-toolbar{display:none!important}}
</style>
<script nonce="${nonce}">
(function(){var b=document.getElementById("vm-print");if(!b)return;b.addEventListener("click",function(){var r=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();r.then(function(){window.print();});});})();
</script>`;

  const media = await resolveThemeMedia(rid, design.pkg, config);
  const res = await renderPrintDocument({
    pkg: design.pkg,
    views,
    assetBaseUrl: assetBase,
    guestMessages: {},
    media,
    nonce,
    mode: "print",
    locale: ctx.restaurant.defaultLocale,
    hostBodyEnd: toolbar,
    title: `${ctx.restaurant.name} – ${design.theme.name}`,
  });
  if (res.ok) await recordQrDownload(ctx, { format: "print", themeId: design.theme.id, count: views.length });

  return new Response(res.html, {
    status: res.ok ? 200 : 500,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": printDocumentCsp(assetBase, { nonce, header: true }),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "SAMEORIGIN",
      "X-Robots-Tag": "noindex",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  });
}
