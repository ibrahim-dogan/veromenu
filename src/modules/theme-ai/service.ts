import "server-only";
import sharp from "sharp";
import { and, count, eq, inArray } from "drizzle-orm";
import { Liquid } from "liquidjs";
import { db } from "@/core/db";
import { items, media, restaurants, tables } from "@/core/db/schema";
import { aiChat, aiJson, type ChatMessage, type ContentPart } from "@/core/ai";
import { AppError } from "@/core/http/errors";
import { env } from "@/core/env";
import { getMessages } from "@/core/i18n/messages";
import { readMediaBuffer } from "@/core/storage/media";
import { planHas } from "@/modules/billing/plans";
import { renderThemeDocument, resolveSettings, sampleThemeView, validatePackage } from "@/modules/theme-engine";
import { QR_COLOR_SETTINGS, qrSvgMarkup, renderPrintDocument, samplePrintViews } from "@/modules/theme-engine/print";
import type { PrintFormat, PrintSpec, ThemeKind, ThemeManifest, ThemePackage, ThemeView } from "@/modules/theme-engine/types";
import { createTheme, getThemeWithPackage } from "@/modules/theme-engine/service";
import { analyzeSystemPrompt, designBriefSchema, languageName, normalizeBrief, type DesignBrief } from "./brief";
import { assemblePackage, defaultSheet, packageBytes, PRINT_CARD_MM, printQualityChecks, qualityChecks } from "./package";
import { filesToBlocks, parseThemeOutput, type ParsedThemeOutput } from "./parse";
import { buildEditSystemPrompt, buildGenerateSystemPrompt, buildPrintEditSystemPrompt, buildPrintGenerateSystemPrompt } from "./prompts";

/**
 * Theme AI: design brief from files (`theme_analyze`), theme generation and chat edits (`theme_generate`).
 * Pipeline: prompt → file blocks → parse → sanitize/assemble → validatePackage + quality checks + render test
 * (sample data, two variants) → ONE repair round with the exact errors → save (generation) / propose (edit).
 */

export const MAX_THEME_FILES = 6;
const MAX_IMAGE_EDGE = 1600;
const MAX_PDF_BYTES_TOTAL = 18 * 1024 * 1024;
/** Reasoning models (Sonnet 5.5 thinks adaptively) spend part of this before writing; a theme itself is ~6–12k tokens. */
const GENERATE_MAX_TOKENS = 24_000;
const EDIT_MAX_TOKENS = 16_000;
/** Above this, edits only get the main files in full (others listed by name). */
const EDIT_FULL_CONTEXT_BYTES = 70_000;

// ------------------------------------------------------------------ context

export type RestaurantThemeContext = {
  name: string;
  cuisine: string | null;
  defaultLocale: string;
  locales: string[];
  itemCount: number;
  imageCount: number;
  hasLogo: boolean;
  hasCover: boolean;
  orderingEnabled: boolean;
};

export async function loadRestaurantThemeContext(restaurantId: string): Promise<RestaurantThemeContext> {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) throw new AppError("notFound");
  const [stats] = await db
    .select({ n: count(), img: count(items.imageMediaId) })
    .from(items)
    .where(eq(items.restaurantId, restaurantId));
  return {
    name: r.name,
    cuisine: r.settings.cuisine?.trim() || null,
    defaultLocale: r.defaultLocale,
    locales: r.enabledLocales,
    itemCount: Number(stats?.n ?? 0),
    imageCount: Number(stats?.img ?? 0),
    hasLogo: !!r.settings.logoMediaId,
    hasCover: !!r.settings.coverMediaId,
    orderingEnabled: !!r.settings.ordering?.enabled && planHas(r.plan, "ordering"),
  };
}

function contextBlock(c: RestaurantThemeContext) {
  const rtl = c.locales.some((l) => ["ar", "fa", "he", "ur"].includes(l));
  return [
    `Restaurant: ${c.name}${c.cuisine ? ` (${c.cuisine})` : ""}`,
    `Menu source language: ${c.defaultLocale}; guest languages: ${c.locales.join(", ")}${rtl ? " – includes a right-to-left language, the layout MUST work with dir=rtl" : ""}`,
    `Items: ${c.itemCount}; items with photos: ${c.imageCount}${c.imageCount === 0 ? " (design must look complete WITHOUT photos; keep image support for later)" : c.imageCount < c.itemCount / 3 ? " (few photos – items without photo must look intentional, never show empty boxes)" : ""}`,
    `Logo uploaded: ${c.hasLogo ? "yes (restaurant.logo_url)" : "no – use the restaurant name as a wordmark"}; cover image: ${c.hasCover ? "yes (restaurant.cover_url)" : "no"}`,
    `Online ordering: ${c.orderingEnabled ? "enabled – show an add button per orderable item (data-vm-add) and a cart button (data-vm-cart, count from html[data-cart-count])" : "disabled (still keep the add-button markup conditional on item.orderable)"}`,
  ].join("\n");
}

// ------------------------------------------------------------------ files → model parts

type FileParts = { parts: ContentPart[]; imageParts: ContentPart[] };

/** Owned media → model parts. Images downscaled to ≤1600 px JPEG, PDFs as file parts. */
export async function mediaToParts(restaurantId: string, mediaIds: string[], opts: { allowPdf: boolean }): Promise<FileParts> {
  const ids = [...new Set(mediaIds)].slice(0, MAX_THEME_FILES);
  if (!ids.length) return { parts: [], imageParts: [] };
  const rows = await db.select().from(media).where(and(inArray(media.id, ids), eq(media.restaurantId, restaurantId)));
  if (rows.length !== ids.length) throw new AppError("notFound", "media");
  const byId = new Map(rows.map((r) => [r.id, r]));
  const parts: ContentPart[] = [];
  const imageParts: ContentPart[] = [];
  let pdfBytes = 0;
  for (const [idx, id] of ids.entries()) {
    const m = byId.get(id)!;
    const buf = await readMediaBuffer(m);
    if (!buf) throw new AppError("notFound", "file missing");
    if (m.mime === "application/pdf") {
      if (!opts.allowPdf) throw new AppError("validation", "pdf");
      pdfBytes += buf.length;
      if (pdfBytes > MAX_PDF_BYTES_TOTAL) throw new AppError("validation", "pdf too large");
      parts.push({ type: "file", file: { filename: `design-${idx + 1}.pdf`, file_data: `data:application/pdf;base64,${buf.toString("base64")}` } });
    } else if (m.mime.startsWith("image/")) {
      let jpeg: Buffer;
      try {
        jpeg = await sharp(buf, { failOn: "none" })
          .rotate()
          .resize({ width: MAX_IMAGE_EDGE, height: MAX_IMAGE_EDGE, fit: "inside", withoutEnlargement: true })
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch {
        throw new AppError("validation", "image");
      }
      const part: ContentPart = { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } };
      parts.push(part);
      imageParts.push(part);
    } else throw new AppError("validation", "mime");
  }
  return { parts, imageParts };
}

// ------------------------------------------------------------------ analyze

export async function analyzeDesignFiles(opts: { restaurantId: string; userId: string; mediaIds: string[]; notes?: string; locale: string; files?: FileParts; kind?: ThemeKind }) {
  const files = opts.files ?? (await mediaToParts(opts.restaurantId, opts.mediaIds, { allowPdf: true }));
  const { data, model } = await aiJson(
    "theme_analyze",
    {
      messages: [
        { role: "system", content: analyzeSystemPrompt(opts.locale, opts.kind ?? "menu") },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyse the design of these ${files.parts.length} file(s).${opts.notes?.trim() ? `\nOwner's notes (respect them): ${opts.notes.trim()}` : ""}`,
            },
            ...files.parts,
          ],
        },
      ],
      maxTokens: 4000,
    },
    designBriefSchema,
    { restaurantId: opts.restaurantId, userId: opts.userId },
    "design_brief",
  );
  return { brief: normalizeBrief(data), model };
}

// ------------------------------------------------------------------ checks

export type PackageCheck = { errors: string[]; warnings: string[] };

let localLiquid: Liquid | null = null;
function localValidate(pkg: ThemePackage): string[] {
  localLiquid ??= new Liquid();
  const errors: string[] = [];
  for (const [p, c] of Object.entries(pkg.files)) {
    if (!p.endsWith(".liquid")) continue;
    try {
      localLiquid.parse(c, p);
    } catch (e) {
      errors.push(`${p}: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    }
  }
  return errors;
}

const PROMOTED_WARNINGS = /unknown filter|unbalanced braces|possible syntax error/;

const notImplemented = (e: unknown) => e instanceof Error && /not implemented/.test(e.message);

function guestMessages(locale = "de"): Record<string, string> {
  const flat: Record<string, string> = {};
  const walk = (o: unknown, prefix: string) => {
    if (typeof o === "string") flat[prefix] = o;
    else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, prefix ? `${prefix}.${k}` : k);
  };
  walk(getMessages(locale).guest, "");
  return flat;
}

/** Second render variant: RTL, no photos, ordering on, unconfirmed allergens – catches branches the sample may skip. */
function variantView(v: ThemeView): ThemeView {
  const clone = structuredClone(v);
  clone.dir = "rtl";
  clone.locale = "ar";
  clone.ordering = { enabled: true };
  clone.table = clone.table ?? { label: "7" };
  clone.restaurant.logo_url = null;
  clone.restaurant.cover_url = null;
  for (const m of clone.menus)
    for (const c of m.categories) {
      c.image_url = null;
      for (const [i, it] of c.items.entries()) {
        it.image_url = null;
        it.image_url_large = null;
        if (i % 3 === 1) it.allergens_confirmed = false;
        if (i % 4 === 2) it.available = false;
      }
    }
  return clone;
}

export async function checkPackage(pkg: ThemePackage, assembleErrors: string[] = []): Promise<PackageCheck & { rendered: boolean }> {
  if (pkg.manifest?.kind === "print") return checkPrintPackage(pkg, assembleErrors);
  const errors = [...assembleErrors];
  const warnings: string[] = [];
  try {
    const v = validatePackage(pkg);
    for (const e of v.errors) errors.push(`${e.file ?? ""}${e.line ? `:${e.line}` : ""}${e.file ? " – " : ""}${e.message}`);
    for (const w of v.warnings) {
      const msg = `${w.file ? `${w.file}: ` : ""}${w.message}`;
      // For AI output these are real bugs (silently ignored filter, broken CSS/JS) → worth the repair round.
      (PROMOTED_WARNINGS.test(w.message) ? errors : warnings).push(msg);
    }
  } catch (e) {
    if (!notImplemented(e)) throw e;
    errors.push(...localValidate(pkg));
  }
  const q = qualityChecks(pkg);
  errors.push(...q.errors);
  warnings.push(...q.warnings);

  let rendered = false;
  if (!errors.length) {
    try {
      const base = sampleThemeView();
      const msgs = guestMessages("de");
      for (const [label, view] of [
        ["sample", base],
        ["rtl/no-photos variant", variantView(base)],
      ] as const) {
        const r = await renderThemeDocument({ pkg, view, assetBaseUrl: env().APP_URL, guestMessages: msgs });
        for (const e of r.errors.slice(0, 10)) errors.push(`render (${label}): ${e}`);
        if (r.ok === false) errors.push(`render (${label}): the theme could not be rendered`);
        else if (!r.html || r.html.length < 200) errors.push(`render (${label}): output is empty`);
      }
      rendered = true;
    } catch (e) {
      if (!notImplemented(e)) errors.push(`render: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], rendered };
}

/** Engine validation (kind-aware) → errors/warnings; falls back to a local Liquid parse while the engine stub is in place. */
function engineValidation(pkg: ThemePackage, errors: string[], warnings: string[]) {
  try {
    const v = validatePackage(pkg);
    for (const e of v.errors) errors.push(`${e.file ?? ""}${e.line ? `:${e.line}` : ""}${e.file ? " – " : ""}${e.message}`);
    for (const w of v.warnings) {
      const msg = `${w.file ? `${w.file}: ` : ""}${w.message}`;
      (PROMOTED_WARNINGS.test(w.message) ? errors : warnings).push(msg);
    }
  } catch (e) {
    if (!notImplemented(e)) throw e;
    errors.push(...localValidate(pkg));
  }
}

const EXTERNAL_IN_HTML = /\b(?:src|href|srcset|poster)\s*=\s*["'](?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\//i;


/** Print variants: defaults · everything optional switched on (Wi-Fi filled) · everything optional off. */
function printSettingVariants(manifest: ThemeManifest): [string, Record<string, unknown>][] {
  const fields = manifest.settings ?? [];
  const all: Record<string, unknown> = {};
  const none: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "checkbox" && f.id.startsWith("show_")) {
      all[f.id] = true;
      none[f.id] = false;
    }
    if (f.type === "text" && /wifi|wlan/.test(f.id)) all[f.id] = /pass|pw|key/.test(f.id) ? "linde2026" : "Zur-Linde-Gaeste";
    else if (f.type === "text" && !f.default) all[f.id] = "Lorem ipsum dolor";
  }
  return [
    ["defaults", resolveSettings(manifest, {})],
    ["all optional elements on", resolveSettings(manifest, all)],
    ["all optional elements off", resolveSettings(manifest, none)],
  ];
}

/** Renders a print package with sample cards (generic + tables) in three setting variants and checks the output. */
export async function checkPrintPackage(pkg: ThemePackage, assembleErrors: string[] = []): Promise<PackageCheck & { rendered: boolean }> {
  const errors = [...assembleErrors];
  const warnings: string[] = [];
  engineValidation(pkg, errors, warnings);
  const q = printQualityChecks(pkg);
  errors.push(...q.errors);
  warnings.push(...q.warnings);

  let rendered = false;
  if (!errors.length) {
    try {
      const views = samplePrintViews();
      const msgs = guestMessages("de");
      for (const [label, settings] of printSettingVariants(pkg.manifest)) {
        const r = await renderPrintDocument({
          pkg,
          views: views.map((v) => ({ ...v, settings })),
          assetBaseUrl: env().APP_URL,
          guestMessages: msgs,
          mode: "preview",
        });
        for (const e of r.errors.slice(0, 10)) errors.push(`render (${label}): ${e}`);
        if (r.ok === false) errors.push(`render (${label}): the design could not be rendered`);
        else if (!r.html || r.html.length < 200) errors.push(`render (${label}): output is empty`);
        else {
          // The engine renders the QR from table.url with the design's QR colours – the exact markup must appear.
          const colors = { dark: settings[QR_COLOR_SETTINGS.dark], light: settings[QR_COLOR_SETTINGS.light] };
          const missing = views.filter((v) => v.table.url && !r.html.includes(qrSvgMarkup(v.table.url, colors)));
          if (missing.length) errors.push(`render (${label}): the QR code is missing on ${missing.length} of ${views.length} cards – always output {{ table.qr_svg }} (also on the generic card and on both tent faces).`);
          // own origin (fonts, media) is fine – everything else would be blocked by the CSP
          if (EXTERNAL_IN_HTML.test(r.html.split(env().APP_URL.replace(/\/+$/, "")).join(""))) errors.push(`render (${label}): the output references external URLs – remove them (no network in print documents).`);
        }
      }
      rendered = true;
    } catch (e) {
      if (!notImplemented(e)) errors.push(`render: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], rendered };
}

// ------------------------------------------------------------------ model round trips

type RoundResult = { parsed: ParsedThemeOutput; raw: string; model: string };

async function callModel(restaurantId: string, userId: string, messages: ChatMessage[], maxTokens: number, billAs?: string): Promise<RoundResult> {
  // Low reasoning: thinking tokens otherwise eat the output budget and blow the timeout on long code answers.
  const res = await aiChat(
    "theme_generate",
    { messages, maxTokens, reasoning: { effort: "low" }, timeoutMs: 300_000 },
    { restaurantId, userId, billAs },
  );
  const dir = process.env.THEME_AI_DEBUG_DIR; // dev only: keep raw model output for prompt tuning
  if (dir) await import("node:fs/promises").then((fs) => fs.writeFile(`${dir}/raw-${Date.now()}.txt`, res.text)).catch(() => {});
  return { parsed: parseThemeOutput(res.text), raw: res.text, model: res.model };
}

function repairMessage(errors: string[], parsed: ParsedThemeOutput, mode: "generate" | "edit") {
  const cut = parsed.truncated ? "\nYour answer was CUT OFF (token limit). Re-send the cut-off file(s) completely and write more compact code." : "";
  return `The theme does not pass validation. Fix exactly these problems:\n${errors
    .slice(0, 25)
    .map((e) => `- ${e}`)
    .join("\n")}${cut}\n\nReturn ONLY the files you change (each COMPLETE, in <file> blocks), the full <manifest> only if it changes, and a new <summary> (${mode === "edit" ? "of the whole edit" : "of the theme"}). Do not repeat unchanged files.`;
}

const parseProblems = (p: ParsedThemeOutput) => [
  ...(p.manifestError ? [`<manifest> is not valid JSON: ${p.manifestError}`] : []),
  ...(p.truncated ? ["the answer was cut off before the end"] : []),
];

type BuildResult = { pkg: ThemePackage; summary: string; warnings: string[]; errors: string[]; repaired: boolean; model: string };

/** Runs model → assemble → check → (one repair) for both generation (base = null) and edits (base = current package). */
async function buildWithRepair(opts: {
  restaurantId: string;
  userId: string;
  messages: ChatMessage[];
  base: ThemePackage | null;
  fallbackName: string;
  maxTokens: number;
  mode: "generate" | "edit";
  kind?: ThemeKind;
  print?: Partial<PrintSpec>;
}): Promise<BuildResult> {
  const shape = opts.kind === "print" ? { kind: "print" as const, print: opts.print } : {};
  const first = await callModel(opts.restaurantId, opts.userId, opts.messages, opts.maxTokens, opts.mode === "edit" ? "theme_edit" : undefined);
  if (!Object.keys(first.parsed.files).length && !first.parsed.manifest && !first.parsed.deleted.length) {
    if (opts.mode === "edit" && first.parsed.summary) {
      // The model answered without changes (e.g. the instruction is already satisfied or impossible).
      return { pkg: opts.base!, summary: first.parsed.summary, warnings: [], errors: [], repaired: false, model: first.model };
    }
    throw new AppError("aiFailed", `model returned no files (${first.raw.length} chars: ${first.raw.slice(0, 160).replace(/\s+/g, " ")})`);
  }
  let a = assemblePackage({ files: first.parsed.files, manifest: first.parsed.manifest, deleted: first.parsed.deleted, base: opts.base, fallbackName: opts.fallbackName, ...shape });
  let check = await checkPackage(a.pkg, [...a.errors, ...parseProblems(first.parsed)]);
  let summary = first.parsed.summary;
  let model = first.model;
  let repaired = false;

  // THEME_AI_NO_REPAIR: dev/test switch to cap model calls while tuning prompts.
  if (check.errors.length && !process.env.THEME_AI_NO_REPAIR) {
    repaired = true;
    const second = await callModel(
      opts.restaurantId,
      opts.userId,
      [...opts.messages, { role: "assistant", content: first.raw }, { role: "user", content: repairMessage(check.errors, first.parsed, opts.mode) }],
      opts.maxTokens,
      "theme_repair",
    );
    const b = assemblePackage({
      files: second.parsed.files,
      manifest: second.parsed.manifest,
      deleted: second.parsed.deleted,
      base: a.pkg,
      fallbackName: opts.fallbackName,
      ...shape,
    });
    const check2 = await checkPackage(b.pkg, [...b.errors, ...(second.parsed.manifestError ? [`manifest: ${second.parsed.manifestError}`] : [])]);
    a = { pkg: b.pkg, warnings: [...a.warnings, ...b.warnings], errors: b.errors };
    check = check2;
    summary = second.parsed.summary ?? summary;
    model = second.model;
  }
  return { pkg: a.pkg, summary: summary ?? "", warnings: [...a.warnings, ...check.warnings], errors: check.errors, repaired, model };
}

/** Errors that make a package unusable (vs. product-quality gaps we can still save with a warning). */
const isFatal = (e: string) => !/^(Allergens are never shown|item\.allergens_confirmed|No element has data-vm-item|Sold-out state|Hard-coded UI text)/.test(e);
/** Print: a missing QR code, scripts or broken rendering are fatal; product-quality gaps are saved with a warning. */
const isFatalPrint = (e: string) => !/^(Hard-coded text|Add show_\* checkbox|The table number is never shown)/.test(e);

// ------------------------------------------------------------------ generate

function briefBlock(b: DesignBrief) {
  return `DESIGN BRIEF (extracted from the owner's printed material – recreate this look faithfully, adapted to a phone screen):\n${JSON.stringify(b, null, 1)}`;
}

export type GenerateResult = { themeId: string; versionId: string; summary: string; warnings: string[]; model: string; repaired: boolean; bytes: number };

export async function generateTheme(opts: {
  restaurantId: string;
  userId: string;
  locale: string;
  prompt?: string;
  brief?: DesignBrief | null;
  notes?: string;
  referenceImages?: ContentPart[];
  origin: "ai_prompt" | "ai_file";
}): Promise<GenerateResult> {
  const ctx = await loadRestaurantThemeContext(opts.restaurantId);
  const system = await buildGenerateSystemPrompt();
  const lang = languageName(opts.locale);
  const sections = [
    "Create a complete new guest-menu theme.",
    "RESTAURANT CONTEXT\n" + contextBlock(ctx),
    opts.brief ? briefBlock(opts.brief) : "",
    opts.prompt?.trim() ? `OWNER'S DESCRIPTION (may be in any language; it is the primary design direction):\n"""${opts.prompt.trim()}"""` : "",
    opts.notes?.trim() ? `OWNER'S NOTES:\n"""${opts.notes.trim()}"""` : "",
    opts.referenceImages?.length
      ? `${opts.referenceImages.length} reference image(s) attached – take colours, typography, ornaments and layout cues from them (not the dishes).`
      : "",
    `Write the <summary> in ${lang}: 2–4 short sentences for the restaurant owner describing the look and which settings they can adjust. Name the theme (manifest.name) evocatively in the restaurant's spirit (max 4 words).`,
  ].filter(Boolean);
  const userContent: ContentPart[] = [{ type: "text", text: sections.join("\n\n") }, ...(opts.referenceImages ?? []).slice(0, 4)];

  const result = await buildWithRepair({
    restaurantId: opts.restaurantId,
    userId: opts.userId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    base: null,
    fallbackName: `${ctx.name} KI`,
    maxTokens: GENERATE_MAX_TOKENS,
    mode: "generate",
  });
  const fatal = result.errors.filter(isFatal);
  if (fatal.length) throw new AppError("aiFailed", `theme invalid after repair: ${fatal.slice(0, 5).join(" | ")}`);
  const warnings = [...result.warnings, ...result.errors];

  const saved = await createTheme({
    restaurantId: opts.restaurantId,
    name: result.pkg.manifest.name,
    description: result.pkg.manifest.description?.[opts.locale] ?? result.pkg.manifest.description?.de ?? null,
    pkg: result.pkg,
    origin: opts.origin,
    userId: opts.userId,
    note: result.summary.slice(0, 500) || undefined,
  });
  return {
    themeId: saved.themeId,
    versionId: saved.versionId,
    summary: result.summary,
    warnings,
    model: result.model,
    repaired: result.repaired,
    bytes: packageBytes(result.pkg),
  };
}

// ------------------------------------------------------------------ print designs

const FORMAT_LABEL: Record<PrintFormat, string> = {
  a6: "A6 portrait table card (105 × 148 mm)",
  "a6-landscape": "A6 landscape table card (148 × 105 mm)",
  a5: "A5 portrait card / small poster (148 × 210 mm)",
  "a5-landscape": "A5 landscape card (210 × 148 mm)",
  a4: "A4 portrait poster (210 × 297 mm) – e.g. for the shop window or the entrance",
  "a4-landscape": "A4 landscape poster (297 × 210 mm)",
  "tent-a6": "standing table tent (A5 sheet folded; two A6 LANDSCAPE faces of 148 × 105 mm: card.face front/back)",
};

type PrintContext = RestaurantThemeContext & { tableCount: number; hasWebsite: boolean };

async function loadPrintContext(restaurantId: string): Promise<PrintContext> {
  const base = await loadRestaurantThemeContext(restaurantId);
  const [r] = await db.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  const [t] = await db.select({ n: count() }).from(tables).where(and(eq(tables.restaurantId, restaurantId), eq(tables.isActive, true)));
  return { ...base, tableCount: Number(t?.n ?? 0), hasWebsite: !!r?.settings.website };
}

function printContextBlock(c: PrintContext, format: PrintFormat | undefined) {
  const card = format ? PRINT_CARD_MM[format] : null;
  return [
    `Restaurant: ${c.name}${c.cuisine ? ` (${c.cuisine})` : ""}`,
    format && card ? `Format: ${FORMAT_LABEL[format]} → manifest.print.format "${format}", card trim ${card.w} × ${card.h} mm` : "",
    `Tables: ${c.tableCount} (one card per table + one generic restaurant card without table number)`,
    `Guest languages of the digital menu: ${c.locales.join(", ")} (the languages line lists them)`,
    `Logo uploaded: ${c.hasLogo ? "yes (restaurant.logo_url – show_logo default true)" : "no – use the restaurant name as a wordmark (keep show_logo for later uploads)"}`,
    `Contact data: address/phone ${c.hasWebsite ? "+ website " : ""}available via restaurant.* (show_* toggles, default off except where it fits the concept)`,
    `Online ordering at the table: ${c.orderingEnabled ? "enabled – offer show_ordering_hint (default true)" : "disabled (keep the ordering hint conditional on ordering.enabled, default false)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generatePrintTheme(opts: {
  restaurantId: string;
  userId: string;
  locale: string;
  format: PrintFormat;
  prompt?: string;
  brief?: DesignBrief | null;
  notes?: string;
  referenceImages?: ContentPart[];
  origin: "ai_prompt" | "ai_file";
}): Promise<GenerateResult> {
  const ctx = await loadPrintContext(opts.restaurantId);
  const system = await buildPrintGenerateSystemPrompt(opts.format);
  const lang = languageName(opts.locale);
  const sections = [
    `Create a complete new PRINT design (kind "print") for QR table cards: ${FORMAT_LABEL[opts.format]}.`,
    "RESTAURANT CONTEXT\n" + printContextBlock(ctx, opts.format),
    opts.brief
      ? `DESIGN BRIEF (extracted from the owner's printed material – recreate this look faithfully as a QR table card; ignore list/price layout details that don't apply):\n${JSON.stringify(opts.brief, null, 1)}`
      : "",
    opts.prompt?.trim() ? `OWNER'S DESCRIPTION (may be in any language; it is the primary design direction):\n"""${opts.prompt.trim()}"""` : "",
    opts.notes?.trim() ? `OWNER'S NOTES:\n"""${opts.notes.trim()}"""` : "",
    opts.referenceImages?.length
      ? `${opts.referenceImages.length} reference image(s) attached – take colours, typography, ornaments and composition cues from them. Never copy a QR code from them (the engine renders the real one).`
      : "",
    `Set manifest.print to { "format": "${opts.format}", "sheet": "${defaultSheet(opts.format)}", "safeMm": 5 }.`,
    `Name the design (manifest.name) evocatively (max 4 words). Default values of text settings are German (printed for German guests); setting labels in de, en and tr.`,
    `LANGUAGE OF THE <summary>: ${lang} – the owner reads it in the dashboard (${lang}, NOT German unless ${lang} is German). 2–4 short sentences describing the look and which elements they can switch on/off.`,
  ].filter(Boolean);
  const userContent: ContentPart[] = [{ type: "text", text: sections.join("\n\n") }, ...(opts.referenceImages ?? []).slice(0, 4)];

  const result = await buildWithRepair({
    restaurantId: opts.restaurantId,
    userId: opts.userId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    base: null,
    fallbackName: `${ctx.name} Tischkarte`,
    maxTokens: GENERATE_MAX_TOKENS,
    mode: "generate",
    kind: "print",
    print: { format: opts.format, sheet: defaultSheet(opts.format) },
  });
  const fatal = result.errors.filter(isFatalPrint);
  if (fatal.length) throw new AppError("aiFailed", `print design invalid after repair: ${fatal.slice(0, 5).join(" | ")}`);

  const saved = await createTheme({
    restaurantId: opts.restaurantId,
    name: result.pkg.manifest.name,
    description: result.pkg.manifest.description?.[opts.locale] ?? result.pkg.manifest.description?.de ?? null,
    pkg: result.pkg,
    origin: opts.origin,
    kind: "print",
    userId: opts.userId,
    note: result.summary.slice(0, 500) || undefined,
  });
  return {
    themeId: saved.themeId,
    versionId: saved.versionId,
    summary: result.summary,
    warnings: [...result.warnings, ...result.errors],
    model: result.model,
    repaired: result.repaired,
    bytes: packageBytes(result.pkg),
  };
}

// ------------------------------------------------------------------ edit

export type EditProposal = {
  changedFiles: Record<string, string>;
  deletedFiles: string[];
  manifest?: ThemeManifest;
  summary: string;
  warnings: string[];
  model: string;
};

function editContext(pkg: ThemePackage): { text: string; partial: boolean } {
  const total = packageBytes(pkg);
  const manifest = `<manifest>\n${JSON.stringify(pkg.manifest, null, 1)}\n</manifest>`;
  if (total <= EDIT_FULL_CONTEXT_BYTES) return { text: `${manifest}\n\n${filesToBlocks(pkg.files)}`, partial: false };
  const main = Object.fromEntries(Object.entries(pkg.files).filter(([p]) => p === "templates/menu.liquid" || p === "templates/print.liquid" || p === "assets/theme.css"));
  const others = Object.keys(pkg.files).filter((p) => !(p in main));
  return {
    text: `${manifest}\n\n${filesToBlocks(main)}\n\nOther files (not shown, keep them unless the instruction requires otherwise): ${others.join(", ")}`,
    partial: true,
  };
}

export async function proposeEdit(opts: { restaurantId: string; userId: string; themeId: string; versionId: string; instruction: string; locale: string }): Promise<EditProposal> {
  const { pkg: base } = await getThemeWithPackage(opts.restaurantId, opts.themeId, opts.versionId);
  const isPrint = base.manifest.kind === "print";
  const ctxText = isPrint ? printContextBlock(await loadPrintContext(opts.restaurantId), base.manifest.print?.format) : contextBlock(await loadRestaurantThemeContext(opts.restaurantId));
  const system = isPrint ? await buildPrintEditSystemPrompt() : await buildEditSystemPrompt();
  const current = editContext(base);
  const lang = languageName(opts.locale);
  const user = [
    "RESTAURANT CONTEXT\n" + ctxText,
    `CURRENT ${isPrint ? "PRINT DESIGN" : "THEME"} PACKAGE${current.partial ? " (large – main files only)" : ""}:\n${current.text}`,
    `OWNER'S CHANGE REQUEST (any language):\n"""${opts.instruction.trim()}"""`,
    `Write the <summary> in ${lang}: 1–3 short sentences describing what you changed.`,
  ].join("\n\n");

  const result = await buildWithRepair({
    restaurantId: opts.restaurantId,
    userId: opts.userId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    base,
    fallbackName: base.manifest.name,
    maxTokens: EDIT_MAX_TOKENS,
    mode: "edit",
    ...(isPrint ? { kind: "print" as const } : {}),
  });
  const fatal = result.errors.filter(isPrint ? isFatalPrint : isFatal);
  if (fatal.length) throw new AppError("aiFailed", `edit invalid after repair: ${fatal.slice(0, 5).join(" | ")}`);

  const changedFiles: Record<string, string> = {};
  for (const [p, c] of Object.entries(result.pkg.files)) if (base.files[p] !== c) changedFiles[p] = c;
  const deletedFiles = Object.keys(base.files).filter((p) => !(p in result.pkg.files));
  const manifestChanged = JSON.stringify(base.manifest) !== JSON.stringify(result.pkg.manifest);
  return {
    changedFiles,
    deletedFiles,
    ...(manifestChanged ? { manifest: result.pkg.manifest } : {}),
    summary: result.summary,
    warnings: [...result.warnings, ...result.errors],
    model: result.model,
  };
}

/** Exposed for scripts/tests. */
export const __test = { contextBlock, variantView, guestMessages, isFatal, isFatalPrint, printContextBlock, printSettingVariants };
