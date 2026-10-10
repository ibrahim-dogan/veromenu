/**
 * Design brief = structured visual analysis of a printed menu / flyer / brand material (`theme_analyze`).
 * Shown to the owner (free text in their UI locale) and fed into `theme_generate`.
 *
 * Schema rules (provider structured-output limits, see assistant/plan-schema.ts): flat, every field required,
 * no nullables / unions; enums are fine. Hex colours are validated leniently AFTER parsing (normalizeBrief),
 * because regex `pattern` support differs between providers.
 */
import { z } from "zod";
import { STATIC_FONT_IDS } from "./package";

const fontEnum = z.enum(STATIC_FONT_IDS);

export const designBriefSchema = z.object({
  summary: z.string().describe("2–4 sentences: the overall look & feel, as a designer would brief a developer"),
  mood: z.array(z.string()).describe("3–6 mood keywords"),
  palette: z.object({
    background: z.string().describe("page background, hex #rrggbb"),
    surface: z.string().describe("cards / panels / boxes, hex"),
    text: z.string().describe("main text, hex"),
    muted: z.string().describe("secondary text (descriptions), hex"),
    primary: z.string().describe("headlines / brand colour, hex"),
    accent: z.string().describe("prices, ornaments, highlights, hex"),
  }),
  paletteNotes: z.string().describe("how the colours are used (e.g. 'gold only for thin rules and prices')"),
  typography: z.object({
    headlineDescription: z.string().describe("what the headline lettering looks like (classification, weight, case, quirks)"),
    bodyDescription: z.string().describe("what the body text looks like"),
    headlineFont: fontEnum.describe("closest match from the font library"),
    bodyFont: fontEnum.describe("closest match from the font library – must be very readable at 15–16px"),
    accentFont: z.enum(["none", ...STATIC_FONT_IDS]).describe("optional third font for small accents (e.g. handwritten notes), else none"),
    headlineCase: z.enum(["normal", "uppercase", "small-caps"]),
    letterSpacing: z.enum(["tight", "normal", "wide"]),
  }),
  layout: z.object({
    columns: z.enum(["single", "two"]).describe("columns on the printed page (the theme stays single-column on phones)"),
    itemStyle: z.enum(["list", "cards", "grid"]),
    priceAlignment: z.enum(["right", "inline", "below"]),
    dottedLeaders: z.boolean().describe("dots/dashes connecting item name and price"),
    alignment: z.enum(["left", "center"]),
    density: z.enum(["compact", "comfortable", "airy"]),
    categoryHeaderStyle: z.string().describe("how section headings are styled (size, rules above/below, ornaments, numbering, banners …)"),
    separators: z.string().describe("separators between items / sections"),
  }),
  ornaments: z.string().describe("frames, borders, dividers, flourishes, icons, corner pieces – described precisely enough to rebuild with CSS/inline SVG"),
  textures: z.string().describe("paper/background texture or pattern (recreate with CSS gradients), or 'none'"),
  imagery: z.object({
    usesPhotos: z.boolean(),
    style: z.string().describe("photo/illustration usage and style, or 'none'"),
  }),
  header: z.string().describe("the top of the menu: logo/name placement, tagline, decorations"),
  logo: z.object({
    present: z.boolean(),
    description: z.string().describe("logo look (shape, colours, lettering) or 'none'"),
  }),
  notes: z.string().describe("anything else important for faithfully recreating the style; mention what NOT to copy (e.g. bad contrast)"),
});

export type DesignBrief = z.infer<typeof designBriefSchema>;

const LANG_NAMES: Record<string, string> = { de: "German", en: "English", tr: "Turkish" };
export const languageName = (locale: string) => LANG_NAMES[locale] ?? "German";

const hex = (v: string, fallback: string) => {
  const s = v.trim().toLowerCase();
  const m = /#?([0-9a-f]{6}|[0-9a-f]{3})\b/.exec(s);
  if (!m) return fallback;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return `#${h}`;
};

/** Clamps lengths and fixes colours so a sloppy (but schema-valid) answer still produces a usable brief. */
export function normalizeBrief(b: DesignBrief): DesignBrief {
  const t = (s: string, n = 600) => s.replace(/\s+/g, " ").trim().slice(0, n);
  return {
    ...b,
    summary: t(b.summary, 800),
    mood: b.mood.map((m) => t(m, 40)).filter(Boolean).slice(0, 8),
    palette: {
      background: hex(b.palette.background, "#fbf8f2"),
      surface: hex(b.palette.surface, "#ffffff"),
      text: hex(b.palette.text, "#1f1a17"),
      muted: hex(b.palette.muted, "#6b625a"),
      primary: hex(b.palette.primary, "#7a2e1f"),
      accent: hex(b.palette.accent, "#b8893b"),
    },
    paletteNotes: t(b.paletteNotes),
    typography: { ...b.typography, headlineDescription: t(b.typography.headlineDescription), bodyDescription: t(b.typography.bodyDescription) },
    layout: { ...b.layout, categoryHeaderStyle: t(b.layout.categoryHeaderStyle), separators: t(b.layout.separators) },
    ornaments: t(b.ornaments, 1000),
    textures: t(b.textures),
    imagery: { usesPhotos: b.imagery.usesPhotos, style: t(b.imagery.style) },
    header: t(b.header),
    logo: { present: b.logo.present, description: t(b.logo.description, 300) },
    notes: t(b.notes, 1000),
  };
}

export function analyzeSystemPrompt(locale: string, kind: "menu" | "print" = "menu") {
  if (kind === "print") return analyzePrintSystemPrompt(locale);
  return `You are a senior brand & menu designer. You receive photos / PDF pages of a restaurant's printed menu, flyer or brand material.
Extract the VISUAL DESIGN LANGUAGE (not the dishes) so a front-end developer can recreate the look as a mobile web menu theme.

Be concrete and faithful:
- Colours: sample the real colours you see (paper tone, ink colour, brand colour, accent such as gold foil or a red stamp). Return hex #rrggbb. "surface" may equal or be slightly lighter/darker than "background". Ensure text vs background would reach WCAG AA (4.5:1); if the print has poor contrast, pick a slightly adjusted text colour and say so in notes.
- Typography: describe the lettering precisely (e.g. "condensed bold sans in all caps, wide tracking", "high-contrast didone serif", "brush script for section titles"), then choose the closest ids from the font library. The body font must stay highly readable on a phone.
- Layout: how items, prices and sections are arranged; leaders, rules, numbering, boxes, columns, alignment, white space.
- Ornaments/textures: describe frames, dividers, flourishes, stamps, illustrations or paper textures so they can be rebuilt with CSS (borders, gradients) or tiny inline SVG. Do not invent decorations that are not there.
- If the material is brand material rather than a menu (logo, flyer, sign), infer a menu style that fits the brand.
- Never transcribe dish lists or prices; mention content only when it matters for design (e.g. "item numbers in circles").

Write ALL free-text fields in ${languageName(locale)} (the restaurant owner reads this brief). Keep font ids and enum values exactly as specified.
Return only the JSON object.`;
}

/** Same schema, but the brief is for a printed QR table card / tent / poster (fields keep their names). */
function analyzePrintSystemPrompt(locale: string) {
  return `You are a senior brand & print designer. You receive photos / PDF pages of a restaurant's printed material: a menu, flyer, existing table card, sign, business card or other brand material.
Extract the VISUAL DESIGN LANGUAGE so a developer can build a matching printed QR TABLE CARD / TABLE TENT / POSTER (HTML/CSS, printed on paper) for this restaurant.

Be concrete and faithful:
- Colours: sample the real paper tone, ink colour, brand colour and accents (gold foil, stamp red …) as hex #rrggbb. Text vs background must reach high contrast on paper (≥ 7:1 for small text) – adjust and say so in notes if the original is weak. "surface" = colour of boxes/panels (e.g. the white field behind a QR code).
- Typography: describe the lettering precisely (classification, weight, case, tracking, quirks) and choose the closest ids from the font library; also note how NUMBERS look (they will be used for big table numbers).
- Layout (map the menu-oriented fields sensibly): columns = how many text columns the material uses; itemStyle/priceAlignment/dottedLeaders = how lists look (use "list"/"inline"/false when there is no list); alignment and density = overall composition; categoryHeaderStyle = how headlines/labels are styled; separators = rules, frames and dividers.
- Ornaments/textures: frames, corner pieces, rules, stamps, icons, patterns – precise enough to rebuild with CSS borders or tiny inline SVG. Note which ones are ink-heavy.
- header = how the brand/name/logo is placed; logo = describe the logo if present.
- If an existing table card or QR sign is shown, describe its composition (where the QR code, table number and texts sit) and what to improve (QR too small, low contrast, cluttered).
- Never transcribe dish lists or prices.

Write ALL free-text fields in ${languageName(locale)} (the restaurant owner reads this brief). Keep font ids and enum values exactly as specified.
Return only the JSON object.`;
}
