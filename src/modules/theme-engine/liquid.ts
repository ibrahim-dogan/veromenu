/**
 * Sandboxed Liquid engine for theme packages (isomorphic). A fresh instance per render/validation:
 * in-memory templates only (no file system), own properties only, parse/render/memory limits,
 * HTML auto-escaping of {{ output }} (use `| raw` for trusted HTML).
 */
import { Filter, Liquid } from "liquidjs";
import type { ThemePackage } from "./types";
import { THEME_LIMITS } from "./types";
import { fontStack } from "./fonts";

/** Resolved media for image settings / named assets: media id → URLs (relative or absolute). */
export type ThemeMediaRef = { url: string; sm?: string | null; md?: string | null };

export type EngineContext = {
  pkg: ThemePackage;
  locale: string;
  currency: string;
  assetBaseUrl: string;
  guestMessages: Record<string, unknown>;
  media?: Record<string, ThemeMediaRef>;
};

/** Filters added by VeroMenu (documented in docs/THEMES.md). */
export const THEME_FILTERS = ["money", "t", "image_url", "asset_url", "font_family", "json", "contrast_color"] as const;

export const PARTIAL_PATH = /^templates\/partials\/([a-z0-9_-]+)\.liquid$/;
export const MENU_TEMPLATE = "templates/menu.liquid";

/** Liquid template map: "menu" + every partial by its name ({% render 'card' %}). */
export function templateMap(files: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [path, content] of Object.entries(files ?? {})) {
    const m = path.match(PARTIAL_PATH);
    if (m && typeof content === "string") map[m[1]] = content;
  }
  if (typeof files?.[MENU_TEMPLATE] === "string") map.menu = files[MENU_TEMPLATE];
  return map;
}

// ---------------------------------------------------------------- helpers

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** JSON safe for <script> and attribute contexts. */
export const safeJson = (v: unknown) =>
  (JSON.stringify(v ?? null) ?? "null").replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Lookup in flat ("tags.vegan": "…") or nested ({ tags: { vegan } }) message objects. */
export function lookupMessage(messages: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!messages) return undefined;
  const flat = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : undefined;
  if (typeof flat === "string") return flat;
  let cur: unknown = messages;
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function parseLocaleFile(content: string | undefined): Record<string, unknown> | null {
  if (typeof content !== "string") return null;
  try {
    const v = JSON.parse(content) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function makeMoney(locale: string, currency: string) {
  let nf: Intl.NumberFormat;
  try {
    nf = new Intl.NumberFormat(`${locale}-u-nu-latn`, { style: "currency", currency });
  } catch {
    nf = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  }
  return (cents: unknown) => {
    const n = typeof cents === "number" ? cents : typeof cents === "string" && cents.trim() !== "" ? Number(cents) : NaN;
    return Number.isFinite(n) ? nf.format(n / 100) : "";
  };
}

function luminance(hex: string) {
  let h = hex.replace("#", "").slice(0, 6);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return 0;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two hex colors (1–21). */
export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Readable text color (near-black or white) on a hex background. */
export function contrastColor(hex: unknown, dark = "#111111", light = "#ffffff") {
  if (typeof hex !== "string" || !/^#[0-9a-f]{3,8}$/i.test(hex)) return dark;
  const L = luminance(hex);
  return (L + 0.05) / 0.05 >= 1.05 / (L + 0.05) ? dark : light;
}

/** Makes app-relative URLs absolute; drops anything that is not ours (CSP would block it anyway). */
export function absUrl(url: unknown, assetBaseUrl: string): string {
  if (typeof url !== "string" || !url) return "";
  const base = assetBaseUrl.replace(/\/+$/, "");
  if (url.startsWith("data:image/")) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return base + url;
  if (url.startsWith(base + "/")) return url;
  return "";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sizedUrl(input: unknown, size: unknown, ctx: EngineContext): string {
  const s = String(size ?? "").toLowerCase();
  const want: "sm" | "md" | "orig" = s === "small" || s === "sm" || s === "thumb" ? "sm" : s === "original" || s === "orig" ? "orig" : s ? "md" : "md";
  if (typeof input === "string" && UUID.test(input)) {
    const m = ctx.media?.[input];
    if (!m) return "";
    return absUrl((want === "sm" ? m.sm : want === "md" ? m.md : null) ?? m.md ?? m.url, ctx.assetBaseUrl);
  }
  if (typeof input !== "string") return "";
  let url = input;
  // our media variants: <key>_sm.webp / <key>_md.webp
  if (size != null && /_(sm|md)\.webp$/.test(url) && want !== "orig") url = url.replace(/_(sm|md)\.webp$/, `_${want}.webp`);
  return absUrl(url, ctx.assetBaseUrl);
}

// ---------------------------------------------------------------- engine

export function createEngine(ctx: EngineContext, globals: object = {}): Liquid {
  const engine = new Liquid({
    templates: templateMap(ctx.pkg.files),
    ownPropertyOnly: true,
    strictFilters: false,
    strictVariables: false,
    outputEscape: "escape",
    globals,
    parseLimit: THEME_LIMITS.maxPackageBytes * 2,
    renderLimit: THEME_LIMITS.renderTimeoutMs,
    memoryLimit: 64 * 1024 * 1024,
    cache: false,
    jsTruthy: false,
    locale: ctx.locale,
  });

  const money = makeMoney(ctx.locale, ctx.currency || "EUR");
  const files = ctx.pkg.files ?? {};
  const themeLocale = parseLocaleFile(files[`locales/${ctx.locale}.json`]);
  const themeEn = parseLocaleFile(files["locales/en.json"]);
  const themeDe = parseLocaleFile(files["locales/de.json"]);
  const assets = ctx.pkg.manifest?.assets ?? {};

  const esc = { raw: true, handler: (v: unknown) => escapeHtml(v) };
  engine.registerFilter("escape", esc);
  engine.registerFilter("xml_escape", esc);
  engine.registerFilter("escape_once", { raw: true, handler: (v: unknown) => escapeHtml(String(v ?? "").replace(/&(amp|lt|gt|quot|#39);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]!)) });

  engine.registerFilter("money", (v: unknown) => money(v));
  engine.registerFilter("t", (key: unknown, ...args: unknown[]) => {
    const k = String(key ?? "");
    const s = lookupMessage(themeLocale ?? undefined, k) ?? lookupMessage(ctx.guestMessages, k) ?? lookupMessage(themeEn ?? undefined, k) ?? lookupMessage(themeDe ?? undefined, k) ?? k;
    const vars: Record<string, unknown> = {};
    for (const a of args) if (Array.isArray(a) && a.length === 2) vars[String(a[0])] = a[1];
    return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name] ?? "") : m));
  });
  engine.registerFilter("image_url", (v: unknown, size?: unknown) => sizedUrl(v, size, ctx));
  engine.registerFilter("asset_url", (name: unknown) => {
    const id = typeof name === "string" && Object.prototype.hasOwnProperty.call(assets, name) ? assets[name] : null;
    return id ? sizedUrl(id, "original", ctx) : "";
  });
  engine.registerFilter("font_family", { raw: true, handler: (id: unknown) => fontStack(id) });
  engine.registerFilter("json", { raw: true, handler: (v: unknown) => safeJson(v) });
  engine.registerFilter("contrast_color", (v: unknown) => contrastColor(v));
  return engine;
}

/** Names of filters used in a parsed template that the engine does not know (with position). */
export function unknownFilters(engine: Liquid, parsed: unknown): { name: string; line?: number }[] {
  const known = (engine as unknown as { filters: Record<string, unknown> }).filters;
  const out: { name: string; line?: number }[] = [];
  const seen = new Set<unknown>();
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== "object" || seen.has(o) || depth > 200) return;
    seen.add(o);
    if (o instanceof Filter) {
      if (typeof o.name === "string" && !o.name.startsWith("[object") && !Object.prototype.hasOwnProperty.call(known, o.name)) {
        const pos = (o as unknown as { token?: { getPosition?: () => number[] } }).token?.getPosition?.();
        out.push({ name: o.name, line: pos?.[0] });
      }
      return;
    }
    for (const k of Object.keys(o)) {
      if (k === "liquid" || k === "input" || k === "parser" || k === "context") continue;
      walk((o as Record<string, unknown>)[k], depth + 1);
    }
  };
  walk(parsed, 0);
  return out;
}

/** Line number of a liquidjs error (token position), if any. */
export function errorLine(e: unknown): number | undefined {
  const pos = (e as { token?: { getPosition?: () => number[] } })?.token?.getPosition?.();
  if (pos?.[0]) return pos[0];
  const m = /line:(\d+)/.exec(String((e as Error)?.message ?? ""));
  return m ? Number(m[1]) : undefined;
}

/** Error message without liquidjs' file/line suffix and stack noise. */
export function errorMessage(e: unknown): string {
  const msg = String((e as Error)?.message ?? e).split("\n")[0];
  return msg.replace(/,?\s*file:[^,]*,\s*line:\d+,\s*col:\d+/, "").replace(/,?\s*line:\d+,\s*col:\d+/, "").slice(0, 300);
}
