/**
 * Print engine for theme packages of kind "print" (QR table cards, table tents, posters). ISOMORPHIC: the studio and
 * the tables page render previews client-side, the print route renders the real document on the server.
 *
 * Print documents are static HTML: NO theme JavaScript at all (scripts/event handlers are stripped here and blocked
 * by the CSP). The engine renders templates/print.liquid once per card (twice for table tents: front + back), puts
 * the cards on physical pages (`@page` size in mm, A4 imposition with crop marks) and leaves printing to the browser's
 * print/PDF engine (no headless Chrome on the server).
 */
import QRCode from "qrcode";
import type { PrintFormat, PrintSpec, PrintView, ThemeManifest, ThemePackage } from "./types";
import { THEME_LIMITS } from "./types";
import { fontFaceCss, fontStack } from "./fonts";
import { HEX_COLOR, resolveSettings, settingsCssVars, settingsDataAttrs, usedFontIds, type SettingValue } from "./settings";
import { absUrl, contrastRatio, createEngine, errorLine, errorMessage, escapeHtml, PRINT_TEMPLATE_PATH, unknownFilters, type ThemeMediaRef } from "./liquid";

export const PRINT_TEMPLATE = PRINT_TEMPLATE_PATH;

/** Card (trim) size per format in mm. tent-a6 = the visible face of the folded tent (A6 landscape). */
export const PRINT_FORMAT_SIZES: Record<PrintFormat, { w: number; h: number }> = {
  a6: { w: 105, h: 148 },
  "a6-landscape": { w: 148, h: 105 },
  a5: { w: 148, h: 210 },
  "a5-landscape": { w: 210, h: 148 },
  a4: { w: 210, h: 297 },
  "a4-landscape": { w: 297, h: 210 },
  "tent-a6": { w: 148, h: 105 },
};
export const PRINT_FORMATS = Object.keys(PRINT_FORMAT_SIZES) as PrintFormat[];

/** Hard limits of one print document. */
export const PRINT_LIMITS = { maxCards: 500, maxOutputBytes: 16_000_000, totalRenderMs: 30_000 } as const;

/** Setting ids that colour the QR code (dark modules / background). Low-contrast combos fall back to black/white. */
export const QR_COLOR_SETTINGS = { dark: "qr_color", light: "qr_background" } as const;

const DEFAULT_SAFE_MM = 4;
const A4 = { w: 210, h: 297 };
const MARK_LEN = 3; // crop mark length (mm)
const MARK_GAP = 1; // distance of crop marks from the trim (mm)

// ---------------------------------------------------------------- strings

type PrintStrings = { scanMenu: string; orderAtTable: string; wifi: string; wifiPassword: string; tableWord: string };

/** Print-specific strings per content language, available via {{ 'scanMenu' | t }} etc. (+ languages[].scan_text). */
export const PRINT_STRINGS: Record<string, PrintStrings> = {
  de: { scanMenu: "Speisekarte scannen", orderAtTable: "Bestellung direkt am Tisch", wifi: "WLAN", wifiPassword: "Passwort", tableWord: "Tisch" },
  en: { scanMenu: "Scan for the menu", orderAtTable: "Order right at your table", wifi: "Wi-Fi", wifiPassword: "Password", tableWord: "Table" },
  tr: { scanMenu: "Menü için okutun", orderAtTable: "Masadan doğrudan sipariş", wifi: "Wi-Fi", wifiPassword: "Şifre", tableWord: "Masa" },
  fr: { scanMenu: "Scannez pour la carte", orderAtTable: "Commandez directement à table", wifi: "Wi-Fi", wifiPassword: "Mot de passe", tableWord: "Table" },
  it: { scanMenu: "Scansiona per il menù", orderAtTable: "Ordina direttamente al tavolo", wifi: "Wi-Fi", wifiPassword: "Password", tableWord: "Tavolo" },
  es: { scanMenu: "Escanea para ver la carta", orderAtTable: "Pide directamente en tu mesa", wifi: "Wi-Fi", wifiPassword: "Contraseña", tableWord: "Mesa" },
  nl: { scanMenu: "Scan voor het menu", orderAtTable: "Bestel direct aan tafel", wifi: "Wifi", wifiPassword: "Wachtwoord", tableWord: "Tafel" },
  pl: { scanMenu: "Zeskanuj, aby zobaczyć menu", orderAtTable: "Zamów bezpośrednio przy stoliku", wifi: "Wi-Fi", wifiPassword: "Hasło", tableWord: "Stolik" },
  ru: { scanMenu: "Сканируйте, чтобы открыть меню", orderAtTable: "Заказ прямо за столиком", wifi: "Wi-Fi", wifiPassword: "Пароль", tableWord: "Стол" },
  uk: { scanMenu: "Скануйте, щоб відкрити меню", orderAtTable: "Замовлення прямо за столиком", wifi: "Wi-Fi", wifiPassword: "Пароль", tableWord: "Стіл" },
  ar: { scanMenu: "امسح الرمز لعرض القائمة", orderAtTable: "اطلب مباشرة من طاولتك", wifi: "واي فاي", wifiPassword: "كلمة المرور", tableWord: "طاولة" },
  zh: { scanMenu: "扫码查看菜单", orderAtTable: "在餐桌直接点餐", wifi: "无线网络", wifiPassword: "密码", tableWord: "桌号" },
  ja: { scanMenu: "スキャンしてメニューを見る", orderAtTable: "テーブルから直接注文", wifi: "Wi-Fi", wifiPassword: "パスワード", tableWord: "テーブル" },
  pt: { scanMenu: "Digitalize para ver o menu", orderAtTable: "Peça diretamente na mesa", wifi: "Wi-Fi", wifiPassword: "Senha", tableWord: "Mesa" },
  el: { scanMenu: "Σαρώστε για το μενού", orderAtTable: "Παραγγελία απευθείας στο τραπέζι", wifi: "Wi-Fi", wifiPassword: "Κωδικός", tableWord: "Τραπέζι" },
  da: { scanMenu: "Scan for menuen", orderAtTable: "Bestil direkte ved bordet", wifi: "Wi-Fi", wifiPassword: "Adgangskode", tableWord: "Bord" },
};
export const printStrings = (locale: string): PrintStrings => PRINT_STRINGS[locale] ?? PRINT_STRINGS.en;

/** "Tisch 12" → "12", "Terrasse T2" → "T2", "Bar" → "Bar". */
export function printTableNumber(label: string | null | undefined): string | null {
  const l = (label ?? "").trim();
  if (!l) return null;
  const m = /(?:^|\s)([A-Za-z]{0,2}\d{1,4}[a-z]?)$/.exec(l);
  return m ? m[1] : l;
}

// ---------------------------------------------------------------- QR

/** Readable QR colours: dark modules on a lighter background with contrast ≥ 4.5 – otherwise black on white. */
export function safeQrColors(dark: unknown, light: unknown): { dark: string; light: string; fallback: boolean } {
  const hex6 = (v: unknown, fb: string) => {
    if (typeof v !== "string" || !HEX_COLOR.test(v)) return fb;
    return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v.slice(0, 7);
  };
  const d = hex6(dark, "#000000");
  const l = hex6(light, "#ffffff");
  const ok = d.length === 7 && l.length === 7 && contrastRatio(d, l) >= 4.5 && contrastRatio(d, "#000000") < contrastRatio(l, "#000000");
  return ok ? { dark: d.toLowerCase(), light: l.toLowerCase(), fallback: false } : { dark: "#000000", light: "#ffffff", fallback: d !== "#000000" || l !== "#ffffff" };
}

/**
 * Crisp vector QR code (scales to its container: width:100%). 4-module quiet zone, error correction Q for short URLs
 * (survives wear on table cards), M for long ones.
 */
export function qrSvgMarkup(text: string, opts: { dark?: unknown; light?: unknown; quiet?: number; ec?: "L" | "M" | "Q" | "H" } = {}): string {
  const value = text || " ";
  const ec = opts.ec ?? (value.length <= 80 ? "Q" : "M");
  const q = QRCode.create(value, { errorCorrectionLevel: ec });
  const n = q.modules.size;
  const quiet = Math.max(0, Math.min(8, Math.round(opts.quiet ?? 4)));
  const total = n + quiet * 2;
  const { dark, light } = safeQrColors(opts.dark, opts.light);
  let d = "";
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (q.modules.get(y, x)) {
        const s = x;
        while (x < n && q.modules.get(y, x)) x++;
        d += `M${s + quiet} ${y + quiet}h${x - s}v1h${s - x}z`;
      } else x++;
    }
  }
  return `<svg class="vm-qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${total}" height="${total}" fill="${light}"/><path fill="${dark}" d="${d}"/></svg>`;
}

// ---------------------------------------------------------------- layout

type Rect = { x: number; y: number; w: number; h: number };
export type PrintLayout = {
  format: PrintFormat;
  sheet: "card" | "a4";
  /** physical page size (mm) */
  page: { w: number; h: number };
  /** trim size of one card (mm) */
  card: { w: number; h: number };
  /** size of one imposed unit (card, or the unfolded tent = two faces) */
  unit: { w: number; h: number };
  tent: boolean;
  safeMm: number;
  /** unit positions on a page */
  slots: { x: number; y: number }[];
  /** crop marks (thin rectangles, mm) */
  marks: Rect[];
};

/** Physical layout for a print spec (pages, imposition, crop marks). */
export function printLayout(spec: Partial<PrintSpec> | null | undefined): PrintLayout {
  const format: PrintFormat = spec?.format && spec.format in PRINT_FORMAT_SIZES ? spec.format : "a6";
  const sheet = spec?.sheet === "a4" ? "a4" : "card";
  const card = PRINT_FORMAT_SIZES[format];
  const tent = format === "tent-a6";
  const unit = tent ? { w: card.w, h: card.h * 2 } : card;
  const safeMm = typeof spec?.safeMm === "number" && Number.isFinite(spec.safeMm) ? Math.max(0, Math.min(20, spec.safeMm)) : DEFAULT_SAFE_MM;
  const base = { format, sheet, card, unit, tent, safeMm } as const;
  if (sheet === "card" || (unit.w >= A4.w && unit.h >= A4.h) || (unit.w >= A4.h && unit.h >= A4.w)) {
    return { ...base, page: { ...unit }, slots: [{ x: 0, y: 0 }], marks: [] };
  }
  const fit = (p: { w: number; h: number }) => ({ p, cols: Math.floor((p.w + 0.01) / unit.w), rows: Math.floor((p.h + 0.01) / unit.h) });
  const portrait = fit(A4);
  const landscape = fit({ w: A4.h, h: A4.w });
  const best = landscape.cols * landscape.rows > portrait.cols * portrait.rows ? landscape : portrait;
  if (best.cols * best.rows < 1) return { ...base, page: { ...unit }, slots: [{ x: 0, y: 0 }], marks: [] };
  const page = best.p;
  const ox = round2((page.w - best.cols * unit.w) / 2);
  const oy = round2((page.h - best.rows * unit.h) / 2);
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < best.rows; r++) for (let c = 0; c < best.cols; c++) slots.push({ x: round2(ox + c * unit.w), y: round2(oy + r * unit.h) });

  // crop marks: outside the trim when the margin allows it, otherwise short ticks on the inner cut lines at the edge
  const marks: Rect[] = [];
  const t = 0.2; // line width
  const xs = Array.from({ length: best.cols + 1 }, (_, i) => round2(ox + i * unit.w));
  const ys = Array.from({ length: best.rows + 1 }, (_, i) => round2(oy + i * unit.h));
  const roomY = oy >= MARK_LEN + MARK_GAP;
  const roomX = ox >= MARK_LEN + MARK_GAP;
  xs.forEach((x, i) => {
    const inner = i > 0 && i < xs.length - 1;
    if (roomY) {
      marks.push({ x: x - t / 2, y: oy - MARK_GAP - MARK_LEN, w: t, h: MARK_LEN });
      marks.push({ x: x - t / 2, y: page.h - oy + MARK_GAP, w: t, h: MARK_LEN });
    } else if (inner) {
      marks.push({ x: x - t / 2, y: 0, w: t, h: MARK_LEN });
      marks.push({ x: x - t / 2, y: page.h - MARK_LEN, w: t, h: MARK_LEN });
    }
  });
  ys.forEach((y, i) => {
    const inner = i > 0 && i < ys.length - 1;
    if (roomX) {
      marks.push({ x: ox - MARK_GAP - MARK_LEN, y: y - t / 2, w: MARK_LEN, h: t });
      marks.push({ x: page.w - ox + MARK_GAP, y: y - t / 2, w: MARK_LEN, h: t });
    } else if (inner) {
      marks.push({ x: 0, y: y - t / 2, w: MARK_LEN, h: t });
      marks.push({ x: page.w - MARK_LEN, y: y - t / 2, w: MARK_LEN, h: t });
    }
  });
  return { ...base, page, slots, marks: marks.map((m) => ({ x: round2(m.x), y: round2(m.y), w: m.w, h: m.h })) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Number of physical pages for n cards. */
export const printPageCount = (spec: Partial<PrintSpec> | null | undefined, cards: number) => Math.ceil(Math.max(0, cards) / printLayout(spec).slots.length);

// ---------------------------------------------------------------- security

/** CSP of a print document (meta tag; `header` adds the sandbox directive for the print route response). */
export function printDocumentCsp(assetBaseUrl: string, opts: { nonce?: string; header?: boolean } = {}): string {
  const base = assetBaseUrl.replace(/\/+$/, "");
  const nonce = opts.nonce && /^[A-Za-z0-9+/=_-]{8,128}$/.test(opts.nonce) ? opts.nonce : null;
  return [
    ...(opts.header ? ["sandbox allow-scripts allow-modals"] : []),
    "default-src 'none'",
    `img-src ${base}/media/ data:`,
    `font-src ${base}/theme-fonts/ data:`,
    "style-src 'unsafe-inline'",
    nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "media-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    ...(opts.header ? ["frame-ancestors 'self'"] : []),
  ].join("; ");
}

const URL_ATTR = /^(src|href|xlink:href|srcset|action|formaction|poster|background|data|ping|cite|longdesc|lowsrc|dynsrc)$/i;

function allowedUrl(value: string, base: string, attr: string): boolean {
  const v = value.trim().replace(/&amp;/g, "&");
  if (!v) return true;
  if (v.startsWith("#")) return /href$/i.test(attr);
  if (/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(v)) return true;
  return !!base && v.startsWith(base + "/");
}

/** url(...) in CSS: only our origin and data: images; @import removed. */
export function sanitizePrintCss(css: string, base: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, _q: string, u: string) => (allowedUrl(u, base, "src") || u.trim().startsWith("#") ? m : "none"))
    .replace(/expression\s*\(/gi, "x(")
    .replace(/<\/style/gi, "<\\/style");
}

function cleanAttrs(attrs: string, base: string): string {
  return attrs.replace(/(\s+)([^\s"'>/=]+)(\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g, (m, ws: string, name: string, _eq: string | undefined, raw: string | undefined) => {
    if (/^on/i.test(name)) return "";
    if (/^(srcdoc|formaction|http-equiv)$/i.test(name)) return "";
    if (raw === undefined) return m;
    const value = raw.replace(/^["']|["']$/g, "");
    if (URL_ATTR.test(name)) {
      if (/^srcset$/i.test(name)) return value.split(",").every((part) => allowedUrl(part.trim().split(/\s+/)[0] ?? "", base, "src")) ? m : "";
      return allowedUrl(value, base, name) ? m : "";
    }
    if (/^style$/i.test(name)) {
      if (!/url\s*\(|expression|@import/i.test(value)) return m;
      const q = raw.startsWith("'") ? "'" : '"';
      return `${ws}${name}=${q}${sanitizePrintCss(value, base).replace(new RegExp(q, "g"), "")}${q}`;
    }
    return m;
  });
}

/** Defense in depth for rendered card markup: no scripts, no event handlers, no external URLs, no embedding. */
export function sanitizePrintMarkup(html: string, assetBaseUrl: string): string {
  const base = assetBaseUrl.replace(/\/+$/, "");
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<\/?script\b[^>]*>/gi, "")
    .replace(/<(iframe|frame|frameset|object|embed|portal|applet|audio|video)\b[^>]*>(?:[\s\S]*?<\/\1\s*>)?/gi, "")
    .replace(/<\/?(base|link|meta|iframe|object|embed|portal)\b[^>]*>/gi, "")
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_m, a: string, css: string, b: string) => a + sanitizePrintCss(css, base).replace(/<\\\/style/gi, "") + b)
    .replace(/<([a-zA-Z][a-zA-Z0-9:-]*)(\s[^<>]*?)?(\/?)>/g, (m, tag: string, attrs: string | undefined, slash: string) => (attrs ? `<${tag}${cleanAttrs(attrs, base)}${slash}>` : m))
    .replace(/javascript\s*:/gi, "");
}

// ---------------------------------------------------------------- sample data

function sampleLogo(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" fill="#2f5d3a"/><path d="M60 22c18 14 26 30 22 46-3 12-12 20-22 22-10-2-19-10-22-22-4-16 4-32 22-46z" fill="#cfe6c4"/><path d="M60 34v62" stroke="#2f5d3a" stroke-width="3" stroke-linecap="round"/><path d="M60 58l-12-9M60 70l13-10M60 82l-10-7" stroke="#2f5d3a" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Realistic sample cards (generic + 3 tables) for previews and AI validation. */
export function samplePrintViews(): PrintView[] {
  const restaurant: PrintView["restaurant"] = {
    name: "Gasthaus Zur Linde",
    slug: "zur-linde",
    cuisine: "Deutsch · Regional",
    logo_url: sampleLogo(),
    address: "Lindenstraße 12, 20095 Hamburg",
    phone: "+49 40 1234567",
    website: "www.zur-linde.de",
  };
  const languages = (["de", "en", "tr"] as const).map((code) => ({
    code,
    name: { de: "Deutsch", en: "English", tr: "Türkçe" }[code],
    flag: { de: "🇩🇪", en: "🇬🇧", tr: "🇹🇷" }[code],
    scan_text: printStrings(code).scanMenu,
  }));
  const base = "https://veromenu.de/m/zur-linde";
  const tables: { label: string | null; area: string | null; token: string | null }[] = [
    { label: null, area: null, token: null },
    { label: "Tisch 1", area: "Gaststube", token: "Ab3dE5fG7hJ9" },
    { label: "Tisch 12", area: "Gaststube", token: "Kq2Wx8Zr4Tn6" },
    { label: "T2", area: "Terrasse", token: "Pm7Ys3Lc9Vb1" },
  ];
  return tables.map((t, i) => {
    const url = t.token ? `${base}?t=${t.token}` : base;
    return {
      restaurant,
      table: { label: t.label, area: t.area, number: printTableNumber(t.label), is_generic: !t.label, url, qr_svg: qrSvgMarkup(url) },
      languages,
      ordering: { enabled: true },
      card: { index: i + 1, total: tables.length, face: "front" },
      settings: {},
      mode: "preview",
    } satisfies PrintView;
  });
}

// ---------------------------------------------------------------- render

const mm = (n: number) => `${round2(n)}mm`;

function baseCss(layout: PrintLayout): string {
  const { page, card, unit, tent, safeMm } = layout;
  return `@page{size:${mm(page.w)} ${mm(page.h)};margin:0}
:root{--vm-card-w:${mm(card.w)};--vm-card-h:${mm(card.h)};--vm-safe:${mm(safeMm)};--vm-page-w:${mm(page.w)};--vm-page-h:${mm(page.h)};--vm-qr-min:35mm}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;-webkit-text-size-adjust:100%;text-size-adjust:100%}
html,body{margin:0;padding:0}
body{font-family:${fontStack(null)};color:#111;line-height:1.3;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
img{max-width:100%}
.vm-sheet{position:relative;width:${mm(page.w)};height:${mm(page.h)};overflow:hidden;background:#fff;break-after:page;page-break-after:always;break-inside:avoid}
.vm-sheet:last-child{break-after:auto;page-break-after:auto}
.vm-slot{position:absolute;width:${mm(unit.w)};height:${mm(unit.h)}}
.vm-face{position:absolute;left:0;width:${mm(card.w)};height:${mm(card.h)}}
.vm-face-back{top:0;transform:rotate(180deg)}
.vm-face-front{top:${tent ? mm(card.h) : "0"}}
.vm-card{position:relative;width:${mm(card.w)};height:${mm(card.h)};overflow:hidden;display:flex;flex-direction:column}
.vm-card>:only-child{flex:1 1 auto;min-height:0}
.vm-qr-svg{display:block;width:100%;height:auto}
.vm-mark{position:absolute;background:#000;z-index:5}
.vm-fold{position:absolute;left:0;width:${mm(unit.w)};height:0;top:${mm(card.h)};z-index:5}
.vm-fold::before,.vm-fold::after{content:"";position:absolute;top:-.1mm;width:5mm;height:.2mm;background:#888}
.vm-fold::before{left:0}.vm-fold::after{right:0}
@media screen{
html{background:#d6d3d1}
body{padding:24px;display:flex;flex-direction:column;align-items:center;gap:24px}
.vm-sheet{box-shadow:0 4px 18px rgb(0 0 0/.18),0 0 0 1px rgb(0 0 0/.06)}
.vm-fold{border-top:.2mm dashed rgb(0 0 0/.25)}
html[data-mode="preview"]{background:transparent}
html[data-mode="preview"] body{padding:0;gap:12px}
html[data-mode="preview"] .vm-sheet{box-shadow:none}
}
@media print{html,body{background:none}.vm-screen-only{display:none!important}}`;
}

function documentShell(o: { lang: string; title: string; attrs: Record<string, string>; head: string; body: string; csp: string }) {
  const attrs = Object.entries(o.attrs)
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
    .join("");
  return `<!doctype html>
<html lang="${escapeHtml(o.lang)}"${attrs}>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(o.csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
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

function errorDocument(o: { title: string; errors: string[]; mode: string; csp: string; lang: string; hostBodyEnd?: string }) {
  const details =
    o.mode === "preview" && o.errors.length
      ? `<pre style="text-align:start;white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;background:#fff4f2;color:#7a1d10;padding:12px;border-radius:8px;max-width:640px;margin:16px auto 0">${escapeHtml(o.errors.slice(0, 20).join("\n"))}</pre>`
      : "";
  const body = `<main style="min-height:100vh;display:grid;place-items:center;padding:32px 20px;font:16px/1.5 system-ui,sans-serif;color:#2a2118;background:#fbf8f2;text-align:center"><div><div aria-hidden="true" style="font-size:40px">🖨️</div><h1 style="font-size:20px;margin:12px 0 4px">${escapeHtml(o.title)}</h1><p style="margin:0;color:#6f6253">Dieses Druckdesign konnte nicht dargestellt werden. / This print design could not be rendered.</p>${details}</div></main>${o.hostBodyEnd ?? ""}`;
  return documentShell({ lang: o.lang, title: o.title, attrs: { "data-kind": "print", "data-mode": o.mode }, head: "", body, csp: o.csp });
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

function randomToken(): string {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").replace(/[^a-z0-9]/g, "");
}

/**
 * Full printable document: @page size per manifest.print, cards imposed on sheets (crop marks for "a4"),
 * tent-a6 front/back faces, font CSS, theme CSS, one rendered print.liquid per view.
 * `nonce` lets the host add its own print-button script (CSP allows only that nonce).
 */
export async function renderPrintDocument(opts: {
  pkg: ThemePackage;
  views: PrintView[];
  assetBaseUrl: string;
  guestMessages: Record<string, unknown>;
  media?: Record<string, ThemeMediaRef | { url: string }>;
  nonce?: string;
  mode?: "print" | "preview";
  /** additive: language of the card texts ('scanMenu' | t …), default "de". */
  locale?: string;
  /** additive: TRUSTED host markup appended to <body> after sanitising (print toolbar of the print route). */
  hostBodyEnd?: string;
  /** additive: document title (default: restaurant name). */
  title?: string;
}): Promise<{ html: string; errors: string[]; ok: boolean }> {
  const base = opts.assetBaseUrl.replace(/\/+$/, "");
  const views = (opts.views ?? []).slice(0, PRINT_LIMITS.maxCards);
  const mode = opts.mode ?? views[0]?.mode ?? "print";
  const locale = typeof opts.locale === "string" && /^[a-z]{2}$/.test(opts.locale) ? opts.locale : "de";
  const csp = printDocumentCsp(base, { nonce: opts.nonce });
  const title = opts.title ?? (views[0]?.restaurant.name ? `${views[0].restaurant.name} – QR` : "QR");
  const fail = (errors: string[]) => ({ html: errorDocument({ title, errors, mode, csp, lang: locale, hostBodyEnd: opts.hostBodyEnd }), errors, ok: false });

  const pkg = opts.pkg;
  const manifest = pkg?.manifest as ThemeManifest | undefined;
  const files = pkg?.files;
  if (!manifest || !files) return fail(["package missing"]);
  if (manifest.kind !== "print") return fail(['manifest.kind must be "print"']);
  if (typeof files[PRINT_TEMPLATE] !== "string") return fail([`${PRINT_TEMPLATE} missing`]);
  if (!Array.isArray(manifest.settings)) return fail(["manifest.settings missing"]);
  if (!views.length) return fail(["no cards to print"]);

  const layout = printLayout(manifest.print);
  const settings: Record<string, SettingValue> = resolveSettings(manifest, views[0].settings);
  const qrColors = { dark: settings[QR_COLOR_SETTINGS.dark], light: settings[QR_COLOR_SETTINGS.light] };
  const strings = printStrings(locale);
  const guestMessages = { ...strings, ...(opts.guestMessages ?? {}) };
  const errors: string[] = [];

  // ---- Liquid: parse once, render every card (and both tent faces)
  const engine = createEngine({ pkg, locale, currency: "EUR", assetBaseUrl: base, guestMessages, media: opts.media as Record<string, ThemeMediaRef> | undefined });
  let tpl;
  try {
    tpl = engine.parse(files[PRINT_TEMPLATE], PRINT_TEMPLATE);
  } catch (e) {
    const line = errorLine(e);
    return fail([`${PRINT_TEMPLATE}${line ? `:${line}` : ""}: ${errorMessage(e)}`]);
  }
  for (const f of unknownFilters(engine, tpl)) errors.push(`${PRINT_TEMPLATE}${f.line ? `:${f.line}` : ""}: unknown filter "${f.name}" (ignored)`);

  const token = `vmqr${randomToken()}`;
  const deadline = Date.now() + PRINT_LIMITS.totalRenderMs;
  const faces: ("front" | "back")[] = layout.tent ? ["back", "front"] : ["front"];
  const units: string[] = [];
  let bytes = 0;
  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    const url = typeof v.table?.url === "string" ? v.table.url : "";
    const qr = url ? qrSvgMarkup(url, qrColors) : typeof v.table?.qr_svg === "string" ? v.table.qr_svg : "";
    const label = v.table?.label ?? null;
    const parts: string[] = [];
    for (const face of faces) {
      if (Date.now() > deadline) return fail([`render timeout (${views.length} cards)`]);
      const view: PrintView = {
        ...v,
        restaurant: { ...v.restaurant, logo_url: v.restaurant.logo_url ? absUrl(v.restaurant.logo_url, base) || null : null },
        table: { ...v.table, label, number: v.table?.number ?? printTableNumber(label), is_generic: !label, url, qr_svg: token },
        languages: (v.languages ?? []).map((l) => ({ ...l, scan_text: l.scan_text ?? printStrings(l.code).scanMenu })),
        card: { index: i + 1, total: views.length, face },
        settings,
        mode,
      };
      let out: string;
      try {
        const scope = view as unknown as Record<string, unknown>;
        out = String(await withTimeout(engine.render(tpl, scope, { globals: scope }), THEME_LIMITS.renderTimeoutMs + 250)); // globals → visible inside partials
      } catch (e) {
        const line = errorLine(e);
        const file = (e as { token?: { file?: string } })?.token?.file;
        return fail([`${file ?? "render"}${line ? `:${line}` : ""}: ${errorMessage(e)}`]);
      }
      out = sanitizePrintMarkup(out, base).split(token).join(qr);
      const faceAttrs = `data-face="${face}" data-index="${i + 1}" data-generic="${label ? "false" : "true"}"`;
      const cardHtml = `<div class="vm-card" ${faceAttrs}>${out}</div>`;
      parts.push(layout.tent ? `<div class="vm-face vm-face-${face}">${cardHtml}</div>` : cardHtml);
    }
    const unit = layout.tent ? `${parts.join("")}<div class="vm-fold" aria-hidden="true"></div>` : parts.join("");
    bytes += unit.length;
    if (bytes > PRINT_LIMITS.maxOutputBytes) return fail([`output too large (> ${PRINT_LIMITS.maxOutputBytes} bytes)`]);
    units.push(unit);
  }

  // ---- impose units on sheets
  const perPage = layout.slots.length;
  const marks = layout.marks.map((m) => `<i class="vm-mark" style="left:${mm(m.x)};top:${mm(m.y)};width:${mm(m.w)};height:${mm(m.h)}"></i>`).join("");
  const sheets: string[] = [];
  for (let p = 0; p * perPage < units.length; p++) {
    const slots = units
      .slice(p * perPage, (p + 1) * perPage)
      .map((u, k) => `<div class="vm-slot" style="left:${mm(layout.slots[k].x)};top:${mm(layout.slots[k].y)}">${u}</div>`)
      .join("\n");
    sheets.push(`<section class="vm-sheet" data-page="${p + 1}">\n${slots}\n${marks}</section>`);
  }

  // ---- head: fonts, engine base, settings vars, theme CSS (sanitised)
  const css = Object.keys(files)
    .filter((p) => /^assets\/[a-z0-9_-]+\.css$/.test(p))
    .sort((a, b) => (a === "assets/theme.css" ? -1 : b === "assets/theme.css" ? 1 : a.localeCompare(b)))
    .map((p) => sanitizePrintCss(files[p], base))
    .join("\n");
  const head = [
    `<style id="vm-fonts">${fontFaceCss(usedFontIds(manifest, settings), base)}</style>`,
    `<style id="vm-base">${baseCss(layout)}\n${settingsCssVars(manifest, settings, fontStack)}</style>`,
    `<style id="vm-theme">\n${css}\n</style>`,
  ].join("\n");

  const html = documentShell({
    lang: locale,
    title,
    attrs: {
      "data-kind": "print",
      "data-mode": mode,
      "data-format": layout.format,
      "data-sheet": layout.sheet,
      ...settingsDataAttrs(manifest, settings),
    },
    head,
    body: `${sheets.join("\n")}\n${opts.hostBodyEnd ?? ""}`,
    csp,
  });
  if (html.length > PRINT_LIMITS.maxOutputBytes) return fail([`output too large (${html.length} > ${PRINT_LIMITS.maxOutputBytes} bytes)`]);
  return { html, errors, ok: true };
}
