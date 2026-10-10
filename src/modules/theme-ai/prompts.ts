import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { FONT_LIBRARY } from "@/modules/theme-engine";
import { THEME_LIMITS } from "@/modules/theme-engine/types";
import { getStarterPackages } from "@/modules/theme-engine/service";
import type { ThemePackage } from "@/modules/theme-engine/types";
import { AI_TARGET_PACKAGE_BYTES, STATIC_FONT_IDS } from "./package";
import { filesToBlocks } from "./parse";

/**
 * Prompt kit for `theme_generate`. The system prompt is assembled from:
 *   1. role + runtime/security model
 *   2. the theme API reference = docs/THEMES.md (read at runtime; embedded condensed fallback below)
 *   3. font library table (ids + real weights → no faux bold)
 *   4. HARD RULES (mirrored by package.ts qualityChecks / stripExternal)
 *   5. design quality bar
 *   6. output format (file blocks)
 *   7. one starter package as a few-shot example (getStarterPackages)
 * Cached per process; re-read when docs/THEMES.md changes.
 */

const DOC_PATH = path.join(process.cwd(), "docs", "THEMES.md");
/** Keep the system prompt affordable: THEMES.md and the example are trimmed to these sizes. */
const MAX_DOC_CHARS = 45_000;
const MAX_EXAMPLE_CHARS = 32_000;

// ------------------------------------------------------------------ sections

const ROLE = `You are the senior front-end designer-developer of VeroMenu, a German QR-menu SaaS. You write complete guest-menu THEMES as code (Liquid templates + CSS) for real restaurants. Your themes must look like the work of a top design studio: distinctive, coherent, appetising – and flawless on a phone in a dim restaurant.

RUNTIME (why the rules exist): the theme is rendered server-side with Liquid (sandboxed liquidjs) into an HTML document that runs inside a sandboxed iframe with a strict Content-Security-Policy: no network access at all (no external fonts, images, scripts, stylesheets), no cookies, no forms, no access to the parent page. The platform injects the font CSS, your CSS, the rendered template and a small bridge script. Guests interact through data-vm-* attributes that the bridge forwards to the host app (item sheet, cart, language). You do not need JavaScript.`;

/** Condensed API reference used while docs/THEMES.md is missing (kept in sync with theme-engine/types.ts). */
const FALLBACK_REFERENCE = `THEME API REFERENCE (condensed)

PACKAGE FILES (only these paths are allowed):
- templates/menu.liquid  (required – the <body> content of the guest page; no <html>/<head>/<body> tags)
- templates/partials/<name>.liquid  → {% render 'name', item: item %} (partials see all globals; pass loop variables explicitly)
- assets/theme.css (+ optional assets/<name>.css) – injected automatically, plain CSS (no Liquid inside CSS)
- locales/<lang>.json – theme-specific strings for {{ 'key' | t }} (falls back to platform guest strings)
- manifest (JSON, separate block): { apiVersion: 1, name, version, description: {de,en,tr}, settings: [...], fonts: [font ids], controls?: { languageSwitcher: "theme"|"host", cartButton: "theme"|"host" } }

DATA (Liquid globals, snake_case):
restaurant { name, slug, cuisine, logo_url, cover_url, address, phone, opening_hours[] { day, day_name, open, close } }
locale (e.g. "de"), dir ("ltr"|"rtl"), currency ("EUR")
languages[] { code, name, flag, active }      table { label } | nil      ordering { enabled }
menus[] { id, name, description, active_now, categories[] { id, name, description, image_url, items[] {
  id, name, description, price (cents|nil), price_formatted ("8,90 €" or "" = price on request), image_url, image_url_large, image_is_ai,
  tags[] (e.g. vegan, vegetarian, spicy), allergens_confirmed, allergens[] { code, letter, label }, additives[] { code, letter, label },
  available, orderable, variants[] { id, name, price, price_formatted } } } }
legend { allergens[] { code, letter, label }, additives[] { … } }   has_unconfirmed_allergens   show_branding
settings.<id> – customizer values (manifest defaults merged)        mode ("live"|"preview")

FILTERS: all standard Liquid filters (escape, default, upcase, downcase, size, join, append, replace, truncate, strip, where, map, first, last, plus, minus …) plus
- {{ 'key' | t }} – translated UI string in the guest language (tags.<tag> for item tags). Keys: menu, categories, language, skipToMenu, imprint, privacy, soldOut, priceOnRequest, aiImage, allergens, additives, allergenUnknown, allergenLegend, allergenNotice, noAllergensDeclared, pricesInclVat, openingHours, closed, viewCart, poweredBy, notAvailableNow. Parameters: {{ 'from' | t: price: item.price_formatted }}, {{ 'table' | t: label: table.label }}, {{ 'quickAdd' | t: name: item.name }}
- {{ item.price | money }} – formats cents in the guest locale/currency (price_formatted is already formatted)
- {{ item.image_url | image_url: 'small' }} / {{ settings.hero_image | image_url }} – sized platform image URL;  {{ 'name' | asset_url }} – named theme asset
- {{ settings.font_heading | font_family }} – CSS font-family stack;  {{ settings.color_primary | contrast_color }} – readable text colour on that background

SETTINGS REACH CSS AUTOMATICALLY (theme.css is static – no Liquid in CSS):
- color / font / range / checkbox settings become CSS custom properties on :root: id color_primary → var(--vm-color-primary), font_heading → var(--vm-font-heading) (full font stack), range radius (unit px) → var(--vm-radius) = "8px", checkbox → 0/1
- select and checkbox settings become attributes on <html>: density=compact → html[data-setting-density="compact"], show_images → html[data-setting-show-images="false"]
- Well-known colour ids color_primary, color_accent, color_background, color_surface, color_text also theme the host overlays (item sheet, cart) – use exactly these ids.

BRIDGE HOOKS (work without JS):
data-vm-item="{{ item.id }}" → opens the host item sheet (details, all allergens, variants, add to cart)
data-vm-add="{{ item.id }}" [data-vm-variant="{{ v.id }}"] → adds to cart (only when ordering.enabled and item.orderable)
data-vm-lang="{{ l.code }}" → switch guest language     data-vm-cart → open cart (count: html[data-cart-count] attribute)
data-vm-info → opens the legal + allergen info sheet`;

const HARD_RULES = `HARD RULES (violations are rejected by the validator):
1. Files: only the allowed paths. templates/menu.liquid is required. Partials keep menu.liquid readable (item, footer …) but don't split for the sake of it.
2. Size: keep it compact – aim for 20–35 KB for all files together, never above ${Math.round(AI_TARGET_PACKAGE_BYTES / 1000)} KB. No dead code, no comments longer than one line, no repeated rule blocks.
3. Data: use only the documented variables/filters. {{ … }} output is HTML-escaped automatically (no | escape needed; never try to output raw HTML from data). Never hard-code dishes, prices, allergens or the restaurant name – everything comes from the data. Loop over ALL menus → categories → items.
4. Text: every UI string through {{ 'key' | t }} (German is the default; the platform translates). Never hard-code UI words like "Allergene", "vegan" or "Ausverkauft" in any language. Tags: {{ 'tags.' | append: tag | t }} (keys tags.vegan, vegetarian, halal, gluten_free, lactose_free, spicy1, spicy2, spicy3, new, recommended, alcohol) – style them as small badges, optionally with a CSS/SVG icon per tag-<name> class. Extra theme-specific strings go into locales/de.json + locales/en.json (+ tr) and are used via {{ 'key' | t }}.
5. Allergens (EU LMIV – legal requirement): for each item, if item.allergens_confirmed: show the allergen letters (and additive letters) compactly, e.g. a superscript "A, C, G"; if not confirmed: show the 'allergenUnknown' hint (small, muted). At the end of the menu render a legend from legend.allergens / legend.additives (letter + label) titled {{ 'allergenLegend' | t }}, plus {{ 'allergenNotice' | t }} when has_unconfirmed_allergens, plus {{ 'pricesInclVat' | t }}.
6. States: item.available == false → visibly sold out ({{ 'soldOut' | t }} badge, muted, no add button). price_formatted == "" → {{ 'priceOnRequest' | t }}. Variants: list every variant name + price_formatted (or "{{ 'from' | t: price: … }}" + the list). item.image_is_ai → small caption {{ 'aiImage' | t }} with data-vm-ai-label on the photo (styled to fit the theme).
7. Interaction: the whole item (or its name/photo) carries data-vm-item="{{ item.id }}" and must be a <button> or have role="button" tabindex="0". Add buttons (data-vm-add) only {% if ordering.enabled and item.orderable and item.available %}; they need an aria-label ({{ 'quickAdd' | t: name: item.name }}). Language switcher and cart bar: leave them to the platform (controls "host", the default) – keep the top-end corner free via var(--vm-host-top-end). Only render your own (controls "theme" + data-vm-lang / data-vm-cart) when the concept really needs it.
8. Images: only {{ item.image_url }}, {{ item.image_url_large }}, {{ category.image_url }}, {{ restaurant.logo_url }}, {{ restaurant.cover_url }}, {{ settings.x | image_url }} – always inside {% if %} so missing images leave no empty boxes; add loading="lazy", width/height or aspect-ratio, meaningful alt (item name). Respect the show_images setting: html[data-setting-show-images="false"] hides all item/category photos (CSS only).
9. Fonts: only ids from the FONT LIBRARY below, list every used id in manifest.fonts, use only the weights that exist for that font (no faux bold). Never use @font-face, @import or url() to external resources. Decorative textures/ornaments: CSS gradients, borders, box-shadows or small inline SVG (data: URIs in CSS are fine, keep each < 2 KB).
10. Forbidden: <script src>, <link>, <iframe>, <form>, <meta>, external URLs (http://, https://, //), position:fixed overlays that cover content, autoplaying animation loops. A tiny assets/theme.js is allowed but almost never needed.
11. Layout: mobile-first (design for 360–430 px, enhance with @media (min-width: 720px)); single column on phones. Use CSS logical properties (margin-inline-start, padding-inline, inset-inline-end, text-align: start/end, border-inline-start) so dir="rtl" works; set dir="{{ dir }}" and lang="{{ locale }}" on your root wrapper. No horizontal scrolling except an intentional category nav strip.
12. Accessibility: WCAG AA contrast (≥ 4.5:1 body text, ≥ 3:1 large text and UI) for every colour pair you define – including prices, muted text and badges; body text ≥ 16px with line-height ≥ 1.4; tap targets ≥ 44 px; visible :focus-visible styles; semantic headings (h1 restaurant, h2 menu/category, h3 item); @media (prefers-reduced-motion: reduce) disables transitions.
13. Settings (manifest.settings) – the owner's customizer. Always include: color_background, color_surface, color_text, color_primary, color_accent (exactly these ids), font_heading + font_body (type font), show_images (checkbox, default true), density (select: compact | comfortable | airy). Optional extras that fit the concept (e.g. a muted text colour, ornament on/off, radius). Labels as {"de": …, "en": …, "tr": …}. Use every setting via its CSS variable (var(--vm-…)) or html[data-setting-…] selector – never hard-code the same colour/font elsewhere. Every colour default must pass contrast with its counterpart.`;

const QUALITY_BAR = `DESIGN QUALITY BAR:
- Start from a clear concept (e.g. "Hanseatic tavern: dark oak, brass, chalk accents") and express it consistently: palette, type pairing, spacing rhythm, separators, ornaments, header.
- Typography does most of the work: a characterful heading font + a highly readable body font, a modular type scale, tabular numerals for prices (font-variant-numeric: tabular-nums), generous but not wasteful spacing.
- Header: restaurant wordmark (or logo_url image if present), optional cuisine/tagline, table label if table exists. Then a sticky, horizontally scrollable category navigation (anchor links #cat-{{ category.id }}, scroll-margin-top on sections) when there are more than 3 categories.
- Items: name, description (muted, max ~3 lines), price aligned consistently (right-aligned with dotted leaders for classic styles, or below the name for card styles), variants, tags, allergen letters. Photos (if enabled and present) must not break the rhythm for items without photos.
- Details matter: hover/active states, focus rings in the accent colour, subtle dividers between categories, a pleasant footer (legend, VAT note, opening hours when available, {{ 'poweredBy' | t }} only if show_branding).
- Never sacrifice legibility for style: script/display fonts only for big headings, never for descriptions or prices.`;

const OUTPUT_FORMAT_GENERATE = `OUTPUT FORMAT (exactly this, nothing else – no markdown fences, no explanations outside the blocks):
<plan>max 6 short lines, English: concept · palette (hex + the contrast ratios you checked) · type pairing + weights · layout/price style · ornaments · how settings map to CSS</plan>
<summary>…short summary for the owner (language given in the request)…</summary>
<manifest>
{ "apiVersion": 1, "name": "…", "version": "1.0.0", "description": { "de": "…", "en": "…", "tr": "…" }, "fonts": ["…"], "settings": [ … ] }
</manifest>
<file path="templates/menu.liquid">
…complete file…
</file>
<file path="assets/theme.css">
…complete file…
</file>
(+ optional partials / locales files, each in its own <file> block)

Setting field shapes: {"id":"color_background","type":"color","label":{…},"default":"#f6f1e7"} · {"id":"font_heading","type":"font","label":{…},"default":"<font id>"} · {"id":"density","type":"select","label":{…},"default":"comfortable","options":[{"value":"compact","label":{…}},…]} · {"id":"show_images","type":"checkbox","label":{…},"default":true} · {"id":"radius","type":"range","label":{…},"default":8,"min":0,"max":24,"step":1,"unit":"px"} · {"id":"tagline","type":"text","label":{…},"default":"","maxLength":80}`;

const OUTPUT_FORMAT_EDIT = `EDIT MODE – OUTPUT FORMAT (exactly this, nothing else):
<summary>…what you changed, for the owner (language given in the request)…</summary>
<file path="…">…the COMPLETE new content of each file you change or add…</file>
<manifest>{…complete manifest…}</manifest>   ← only if the manifest changes (e.g. new setting or font)
<delete path="…"/>                          ← only for files that must be removed

Rules for edits: change only what the request needs and keep everything else byte-identical (same class names, structure, settings ids). Every changed file is returned COMPLETE (never diffs, never "…rest unchanged…"). If the request is better solved with a new setting (e.g. a colour), add it to the manifest and use it. If nothing needs to change, return only the <summary> explaining why. All HARD RULES still apply.`;

// ------------------------------------------------------------------ assembly

function fontTable(): string {
  if (!FONT_LIBRARY.length) return `FONT LIBRARY (ids): ${STATIC_FONT_IDS.join(", ")}`;
  const rows = FONT_LIBRARY.map((f) => {
    const italic = (f as { italic?: number[] }).italic;
    return `${f.id} | ${f.family} | ${f.category} | ${f.weights.join("/")}${italic?.length ? ` (italic ${italic.join("/")})` : ""}`;
  });
  return `FONT LIBRARY (id | family | category | weights) – self-hosted, injected automatically for every id in manifest.fonts and every font setting:\n${rows.join("\n")}`;
}

async function readDoc(): Promise<{ text: string; mtime: number } | null> {
  try {
    const st = await fs.stat(DOC_PATH);
    const text = await fs.readFile(DOC_PATH, "utf8");
    return { text: text.length > MAX_DOC_CHARS ? `${text.slice(0, MAX_DOC_CHARS)}\n…(truncated)` : text, mtime: st.mtimeMs };
  } catch {
    return null;
  }
}

/** Picks the most instructive starter (full feature coverage, moderate size) as few-shot example. */
async function exampleBlock(): Promise<string> {
  let starters: { key: string; name: string; pkg: ThemePackage }[] = [];
  try {
    starters = await getStarterPackages();
  } catch {
    return "";
  }
  const size = (p: ThemePackage) => Object.values(p.files).reduce((n, c) => n + c.length, 0) + JSON.stringify(p.manifest).length;
  const candidates = starters.filter((s) => size(s.pkg) <= MAX_EXAMPLE_CHARS).sort((a, b) => size(b.pkg) - size(a.pkg));
  const pick = candidates[0];
  if (!pick) return "";
  return `EXAMPLE – a complete, valid starter theme ("${pick.name}") in the expected output format. It shows the correct use of the data model, filters, hooks and settings. Do NOT copy its look – create an original design for this restaurant.
<example>
<summary>Starter theme "${pick.name}".</summary>
<manifest>
${JSON.stringify(pick.pkg.manifest)}
</manifest>
${filesToBlocks(pick.pkg.files)}
</example>`;
}

type Cached = { key: string; prompt: string };
let genCache: Cached | null = null;
let editCache: Cached | null = null;

async function common(): Promise<{ key: string; parts: string[] }> {
  const doc = await readDoc();
  const example = await exampleBlock();
  const key = `${doc?.mtime ?? 0}|${example.length}|${FONT_LIBRARY.length}`;
  const reference = doc
    ? `THEME API REFERENCE (docs/THEMES.md – authoritative):\n<reference>\n${doc.text}\n</reference>`
    : FALLBACK_REFERENCE;
  return {
    key,
    parts: [ROLE, reference, fontTable(), `LIMITS: max ${THEME_LIMITS.maxFiles} files, ${THEME_LIMITS.maxFileBytes / 1000} KB per file.`, HARD_RULES, QUALITY_BAR, example],
  };
}

export async function buildGenerateSystemPrompt(): Promise<string> {
  const c = await common();
  if (genCache?.key === c.key) return genCache.prompt;
  const prompt = [...c.parts, OUTPUT_FORMAT_GENERATE].filter(Boolean).join("\n\n");
  genCache = { key: c.key, prompt };
  return prompt;
}

export async function buildEditSystemPrompt(): Promise<string> {
  const c = await common();
  if (editCache?.key === c.key) return editCache.prompt;
  // Edits don't need the few-shot example (the current package is the example).
  const prompt = [...c.parts.slice(0, -1), OUTPUT_FORMAT_EDIT].filter(Boolean).join("\n\n");
  editCache = { key: c.key, prompt };
  return prompt;
}
