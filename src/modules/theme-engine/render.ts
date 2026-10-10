/**
 * Renders a theme package into the full sandbox document (isomorphic).
 */
import type { ThemePackage, ThemeView } from "./types";
import { THEME_LIMITS } from "./types";
import { fontFaceCss, fontStack } from "./fonts";
import { resolveSettings, settingsCssVars, settingsDataAttrs, usedFontIds } from "./settings";
import { absUrl, createEngine, errorLine, errorMessage, escapeHtml, lookupMessage, MENU_TEMPLATE, safeJson, unknownFilters, type ThemeMediaRef } from "./liquid";
import { themeFrameCsp } from "./csp";
import { BASE_CSS, BRIDGE_SCRIPT } from "./bridge";

export type RenderThemeOptions = {
  pkg: ThemePackage;
  view: ThemeView;
  /** Absolute app origin for media/fonts (the frame has an opaque origin). */
  assetBaseUrl: string;
  /** Platform guest strings for view.locale (flat or nested). */
  guestMessages: Record<string, unknown>;
  /** Media for image settings + manifest.assets (media id → URLs). See resolveThemeMedia() on the server. */
  media?: Record<string, ThemeMediaRef>;
  /** Width (px) of host controls in the top-end corner → CSS var --vm-host-top-end (default 56). */
  hostInsetTopEnd?: number;
};

export type RenderThemeResult = {
  html: string;
  /** Problems found while rendering (unknown filters, render errors …). */
  errors: string[];
  /** false → `html` is the friendly error document (the theme could not be rendered). */
  ok: boolean;
};

const closeTagSafe = (src: string, tag: "style" | "script") => src.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);

/** Defense in depth: strip things the sandbox must never get from rendered markup. */
function sanitizeBody(html: string): string {
  return html
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "")
    .replace(/<(iframe|frame|object|embed|portal)\b[^>]*>(?:[\s\S]*?<\/\1>)?/gi, "")
    .replace(/<script\b[^>]*\bsrc\s*=[^>]*>(?:[\s\S]*?<\/script>)?/gi, "")
    .replace(/<link\b[^>]*>/gi, "");
}

/** Absolute media URLs in the view (works in srcdoc/blob previews and in the opaque-origin frame). */
function absolutizeView(view: ThemeView, base: string, settings: Record<string, unknown>): ThemeView {
  const u = (x: string | null) => (x ? absUrl(x, base) || null : null);
  return {
    ...view,
    restaurant: { ...view.restaurant, logo_url: u(view.restaurant.logo_url), cover_url: u(view.restaurant.cover_url) },
    menus: view.menus.map((m) => ({
      ...m,
      categories: m.categories.map((c) => ({
        ...c,
        image_url: u(c.image_url),
        items: c.items.map((i) => ({ ...i, image_url: u(i.image_url), image_url_large: u(i.image_url_large) })),
      })),
    })),
    settings,
  };
}

function aiImageUrls(view: ThemeView): string[] {
  const out = new Set<string>();
  for (const m of view.menus) for (const c of m.categories) for (const i of c.items) if (i.image_is_ai) [i.image_url, i.image_url_large].forEach((x) => x && out.add(x));
  return [...out];
}

function documentShell(o: { lang: string; dir: string; mode: string; title: string; attrs?: Record<string, string>; head: string; body: string; csp: string }) {
  const attrs = Object.entries(o.attrs ?? {})
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
    .join("");
  return `<!doctype html>
<html lang="${escapeHtml(o.lang)}" dir="${o.dir === "rtl" ? "rtl" : "ltr"}" data-mode="${o.mode === "preview" ? "preview" : "live"}" data-cart-count="0"${attrs}>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(o.csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${escapeHtml(o.title)}</title>
${o.head}
</head>
<body>
${o.body}
</body>
</html>`;
}

/** Friendly error document (theme could not be rendered). Details only in preview mode. */
export function renderErrorDocument(o: { view: Pick<ThemeView, "locale" | "dir" | "mode" | "restaurant">; assetBaseUrl: string; guestMessages: Record<string, unknown>; errors: string[] }) {
  const t = (k: string, fb: string) => lookupMessage(o.guestMessages, k) ?? fb;
  const details =
    o.view.mode === "preview" && o.errors.length
      ? `<pre style="text-align:start;white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;background:#fff4f2;color:#7a1d10;padding:12px;border-radius:8px;max-width:640px;margin:16px auto 0">${escapeHtml(o.errors.slice(0, 20).join("\n"))}</pre>`
      : "";
  const body = `<main style="min-height:100vh;display:grid;place-items:center;padding:32px 20px;font:16px/1.5 system-ui,sans-serif;color:#2a2118;background:#fbf8f2;text-align:center">
<div><div aria-hidden="true" style="font-size:40px">🍽️</div>
<h1 style="font-size:22px;margin:12px 0 4px">${escapeHtml(o.view.restaurant.name)}</h1>
<p style="margin:0;color:#6f6253">${escapeHtml(t("themeErrorText", "Die Speisekarte kann gerade nicht angezeigt werden. Bitte frag unser Personal."))}</p>
<p style="margin:16px 0 0"><button type="button" data-vm-info style="font:inherit;padding:8px 16px;border-radius:999px;border:1px solid #d6c8b2;background:#fff">${escapeHtml(t("info", "Informationen"))}</button></p>
${details}</div></main>
<script id="vm-data" type="application/json">${safeJson({ mode: o.view.mode, locale: o.view.locale, ai: [] })}</script>
<script>${BRIDGE_SCRIPT}</script>`;
  return documentShell({ lang: o.view.locale, dir: o.view.dir, mode: o.view.mode, title: o.view.restaurant.name, head: "", body, csp: themeFrameCsp(o.assetBaseUrl) });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`render timeout (${ms} ms)`)), ms);
    p.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

export async function renderThemeDocument(opts: RenderThemeOptions): Promise<RenderThemeResult> {
  const { pkg, assetBaseUrl } = opts;
  const base = assetBaseUrl.replace(/\/+$/, "");
  const errors: string[] = [];
  const fail = (msgs: string[]): RenderThemeResult => ({
    html: renderErrorDocument({ view: opts.view, assetBaseUrl: base, guestMessages: opts.guestMessages, errors: msgs }),
    errors: msgs,
    ok: false,
  });

  const manifest = pkg?.manifest;
  const files = pkg?.files;
  if (!manifest || !files || typeof files[MENU_TEMPLATE] !== "string") return fail(["templates/menu.liquid missing"]);
  if (!Array.isArray(manifest.settings)) return fail(["manifest.settings missing"]);

  const settings = resolveSettings(manifest, opts.view.settings);
  const view = absolutizeView(opts.view, base, settings);
  const currency = view.currency || "EUR";

  // ---- Liquid
  let body: string;
  try {
    const engine = createEngine({ pkg, locale: view.locale, currency, assetBaseUrl: base, guestMessages: opts.guestMessages, media: opts.media }, view);
    let tpl;
    try {
      tpl = engine.parse(files[MENU_TEMPLATE], MENU_TEMPLATE);
    } catch (e) {
      const line = errorLine(e);
      return fail([`${MENU_TEMPLATE}${line ? `:${line}` : ""}: ${errorMessage(e)}`]);
    }
    for (const f of unknownFilters(engine, tpl)) errors.push(`${MENU_TEMPLATE}${f.line ? `:${f.line}` : ""}: unknown filter "${f.name}" (ignored)`);
    body = String(await withTimeout(engine.render(tpl, view as unknown as Record<string, unknown>), THEME_LIMITS.renderTimeoutMs + 250));
  } catch (e) {
    const line = errorLine(e);
    const file = (e as { token?: { file?: string } })?.token?.file;
    return fail([`${file ?? "render"}${line ? `:${line}` : ""}: ${errorMessage(e)}`]);
  }
  body = sanitizeBody(body);

  // ---- head: fonts, base, settings vars, theme CSS
  const css = Object.keys(files)
    .filter((p) => /^assets\/[a-z0-9_-]+\.css$/.test(p))
    .sort((a, b) => (a === "assets/theme.css" ? -1 : b === "assets/theme.css" ? 1 : a.localeCompare(b)))
    .map((p) => closeTagSafe(files[p], "style"))
    .join("\n");
  const head = [
    `<style id="vm-fonts">${fontFaceCss(usedFontIds(manifest, settings), base)}</style>`,
    `<style id="vm-base">${BASE_CSS}\n:root{--vm-host-top-end:${Math.max(0, Math.min(240, Math.round(opts.hostInsetTopEnd ?? 56)))}px}\n${settingsCssVars(manifest, settings, fontStack)}</style>`,
    `<style id="vm-theme">\n${css}\n</style>`,
  ].join("\n");

  // ---- body: theme markup, spacer for host UI, data, bridge, theme JS
  const data = {
    mode: view.mode,
    locale: view.locale,
    ai: aiImageUrls(view),
    aiLabel: lookupMessage(opts.guestMessages, "aiImage") ?? "KI-generiertes Symbolbild",
    aiBadge: lookupMessage(opts.guestMessages, "aiBadge") ?? "KI",
  };
  const js = typeof files["assets/theme.js"] === "string" && files["assets/theme.js"].trim() ? files["assets/theme.js"] : "";
  const tail = [
    `<div id="vm-host-spacer" aria-hidden="true"></div>`,
    `<script id="vm-data" type="application/json">${safeJson(data)}</script>`,
    `<script>${BRIDGE_SCRIPT}</script>`,
    js ? `<script>\ntry {\n${closeTagSafe(js, "script")}\n} catch (e) { console.error("[theme.js]", e); }\n</script>` : "",
  ].join("\n");

  const html = documentShell({
    lang: view.locale,
    dir: view.dir,
    mode: view.mode,
    title: view.restaurant.name,
    attrs: settingsDataAttrs(manifest, settings),
    head,
    body: `${body}\n${tail}`,
    csp: themeFrameCsp(base),
  });
  if (html.length > THEME_LIMITS.maxOutputBytes) return fail([`output too large (${html.length} > ${THEME_LIMITS.maxOutputBytes} bytes)`]);
  return { html, errors, ok: true };
}
