/**
 * Turns parsed model output into a safe ThemePackage (pure, isomorphic → testable offline):
 * allowed paths only, size limits, external resources stripped (the CSP blocks them anyway – this keeps the
 * code clean and honest), manifest normalized so small model mistakes don't fail the whole generation.
 */
import { FONT_LIBRARY } from "@/modules/theme-engine";
import { THEME_API_VERSION, THEME_FILE_PATTERNS, THEME_LIMITS, type ThemeManifest, type ThemePackage, type ThemeSettingField } from "@/modules/theme-engine/types";

/** Fallback while FONT_LIBRARY is not populated (same ids as the self-hosted library). */
export const STATIC_FONT_IDS = [
  "inter", "poppins", "montserrat", "raleway", "nunito", "josefin-sans", "space-grotesk", "dm-sans", "work-sans",
  "playfair-display", "lora", "cormorant-garamond", "fraunces", "dm-serif-display", "merriweather", "libre-baskerville",
  "eb-garamond", "abril-fatface", "bebas-neue", "oswald", "caveat", "pacifico", "amatic-sc", "lobster", "righteous",
] as const;

export const fontIds = (): string[] => (FONT_LIBRARY.length ? FONT_LIBRARY.map((f) => f.id) : [...STATIC_FONT_IDS]);

/** Soft budget we ask the model for; the hard limits are THEME_LIMITS. */
export const AI_TARGET_PACKAGE_BYTES = 60_000;

export const isAllowedPath = (p: string) => THEME_FILE_PATTERNS.some((re) => re.test(p));
const bytes = (s: string) => new TextEncoder().encode(s).length;

// ------------------------------------------------------------------ external resources

const EXTERNAL = String.raw`(?:https?:)?\/\/[^\s"'()<>]+`;

/** Removes references to external resources. Liquid expressions ({{ item.image_url }}) are untouched. */
export function stripExternal(path: string, content: string): { content: string; removed: number } {
  let removed = 0;
  const count = <T,>(v: T) => {
    removed++;
    return v;
  };
  let s = content;
  if (path.endsWith(".css") || path.endsWith(".liquid")) {
    s = s.replace(/@import\s+[^;]+;?/gi, () => count(""));
    s = s.replace(/@font-face\s*\{[^}]*\}/gi, () => count("")); // fonts come only from the self-hosted library
    s = s.replace(new RegExp(String.raw`url\(\s*(["']?)${EXTERNAL}\1\s*\)`, "gi"), () => count("none"));
  }
  if (path.endsWith(".liquid")) {
    s = s.replace(/<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script\s*>/gi, () => count(""));
    s = s.replace(/<script\b[^>]*\bsrc\s*=[^>]*\/?>/gi, () => count(""));
    s = s.replace(/<(iframe|object|embed|frame|frameset|applet|portal)\b[\s\S]*?(?:<\/\1\s*>|\/>)/gi, () => count(""));
    s = s.replace(/<(link|base|meta)\b[^>]*>/gi, (m) => (/^<meta\b/i.test(m) && /charset|viewport/i.test(m) && !/http-equiv/i.test(m) ? m : count("")));
    s = s.replace(/<form\b/gi, () => count("<div")).replace(/<\/form\s*>/gi, "</div>");
    s = s.replace(new RegExp(String.raw`<(img|source|video|audio)\b[^>]*\bsrc\s*=\s*(["'])${EXTERNAL}[^"']*\2[^>]*>`, "gi"), () => count(""));
    s = s.replace(new RegExp(String.raw`\b(href|xlink:href)\s*=\s*(["'])${EXTERNAL}\2`, "gi"), (_m, a: string, q: string) => count(`${a}=${q}#${q}`));
    s = s.replace(new RegExp(String.raw`\b(src|srcset|poster|action|formaction|data|background)\s*=\s*(["'])${EXTERNAL}[^"']*\2`, "gi"), (_m, a: string, q: string) =>
      count(`${a}=${q}${q}`),
    );
  }
  return { content: s, removed };
}

// ------------------------------------------------------------------ manifest

type Labels = Record<string, string>;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function labels(v: unknown, fallback: string): Labels {
  if (typeof v === "string" && v.trim()) return { de: v.trim().slice(0, 120) };
  const out: Labels = {};
  if (v && typeof v === "object")
    for (const [k, val] of Object.entries(v)) if (/^[a-z]{2}$/.test(k) && typeof val === "string" && val.trim()) out[k] = val.trim().slice(0, 120);
  if (!out.de) out.de = out.en ?? Object.values(out)[0] ?? fallback;
  return out;
}

const optValue = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const toId = (v: unknown) =>
  typeof v === "string"
    ? v
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^[^a-z]+/, "")
        .slice(0, 40)
    : "";

function normalizeSetting(raw: unknown, fonts: string[], allFonts: Set<string>, warn: (m: string) => void): ThemeSettingField | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const id = toId(f.id);
  if (!id) {
    warn("setting without id dropped");
    return null;
  }
  const label = labels(f.label, id);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : d);
  switch (f.type) {
    case "color": {
      const d = typeof f.default === "string" ? f.default.trim() : "";
      if (!HEX.test(d)) warn(`setting ${id}: invalid color default "${String(f.default)}"`);
      return { id, type: "color", label, default: HEX.test(d) ? d.toLowerCase() : "#333333" };
    }
    case "font": {
      let d = typeof f.default === "string" ? f.default.trim() : "";
      if (!allFonts.has(d)) {
        warn(`setting ${id}: unknown font "${d}"`);
        d = fonts[0] ?? "inter";
      }
      if (!fonts.includes(d)) fonts.push(d);
      return { id, type: "font", label, default: d };
    }
    case "select": {
      const options = (Array.isArray(f.options) ? f.options : [])
        .map((o) =>
          typeof o === "string"
            ? { value: optValue(o), label: { de: o } }
            : o && typeof o === "object" && typeof (o as { value?: unknown }).value === "string"
              ? { value: optValue((o as { value: string }).value), label: labels((o as { label?: unknown }).label, (o as { value: string }).value) }
              : null,
        )
        .filter((o): o is { value: string; label: Labels } => !!o && !!o.value)
        .filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i)
        .slice(0, 20);
      if (!options.length) {
        warn(`setting ${id}: select without options dropped`);
        return null;
      }
      const want = typeof f.default === "string" ? optValue(f.default) : "";
      const d = options.some((o) => o.value === want) ? want : options[0].value;
      return { id, type: "select", label, default: d, options };
    }
    case "checkbox":
      return { id, type: "checkbox", label, default: f.default === true || f.default === "true" };
    case "range": {
      let min = num(f.min, 0);
      let max = num(f.max, 100);
      if (max < min) [min, max] = [max, min];
      const step = Math.max(num(f.step, 1), 0.001);
      const d = Math.min(max, Math.max(min, num(f.default, min)));
      const unit = typeof f.unit === "string" && /^[a-z%]{1,4}$/.test(f.unit) ? f.unit : undefined;
      return { id, type: "range", label, default: d, min, max, step, ...(unit ? { unit } : {}) };
    }
    case "text": {
      const maxLength = Math.min(500, Math.max(1, num(f.maxLength, 120)));
      return { id, type: "text", label, default: typeof f.default === "string" ? f.default.slice(0, maxLength) : "", maxLength };
    }
    case "image":
      return { id, type: "image", label, default: null };
    default:
      warn(`setting ${id}: unknown type "${String(f.type)}" dropped`);
      return null;
  }
}

export function normalizeManifest(raw: unknown, opts: { fallbackName: string; base?: ThemeManifest | null }): { manifest: ThemeManifest; warnings: string[] } {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const base = opts.base ?? null;
  const m = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const all = new Set(fontIds());
  const fontsIn = Array.isArray(m.fonts) ? m.fonts : (base?.fonts ?? []);
  const fonts = [...new Set(fontsIn.filter((x): x is string => typeof x === "string").map((x) => x.trim()))].filter((x) => {
    if (!all.has(x)) warn(`unknown font "${x}" removed`);
    return all.has(x);
  });
  const settingsIn = Array.isArray(m.settings) ? m.settings : (base?.settings ?? []);
  const seen = new Set<string>();
  const settings: ThemeSettingField[] = [];
  for (const s of settingsIn.slice(0, 40)) {
    const f = normalizeSetting(s, fonts, all, warn);
    if (!f) continue;
    if (seen.has(f.id)) {
      warn(`duplicate setting ${f.id} dropped`);
      continue;
    }
    seen.add(f.id);
    settings.push(f);
  }
  const description = m.description !== undefined ? labels(m.description, "") : base?.description;
  const controls = m.controls && typeof m.controls === "object" ? (m.controls as Record<string, unknown>) : (base?.controls ?? undefined);
  const ctl = (v: unknown) => (v === "theme" || v === "host" ? v : undefined);
  const manifest: ThemeManifest = {
    apiVersion: THEME_API_VERSION,
    name: (typeof m.name === "string" && m.name.trim() ? m.name.trim() : (base?.name ?? opts.fallbackName)).slice(0, 60),
    version: typeof m.version === "string" && m.version.trim() ? m.version.trim().slice(0, 20) : (base?.version ?? "1.0.0"),
    author: base?.author ?? "VeroMenu KI",
    ...(description && Object.values(description).some(Boolean) ? { description: Object.fromEntries(Object.entries(description).map(([k, v]) => [k, v.slice(0, 400)])) } : {}),
    settings,
    fonts: fonts.length ? fonts.slice(0, 8) : ["inter"],
    ...(controls ? { controls: { languageSwitcher: ctl(controls.languageSwitcher), cartButton: ctl(controls.cartButton) } } : {}),
    // Named assets map to media ids – the model can't create media, so only keep what the base already had.
    ...(base?.assets ? { assets: base.assets } : {}),
  };
  if (manifest.controls && !manifest.controls.languageSwitcher && !manifest.controls.cartButton) delete manifest.controls;
  return { manifest, warnings };
}

// ------------------------------------------------------------------ package assembly

export type AssembleResult = { pkg: ThemePackage; warnings: string[]; errors: string[] };

/**
 * Builds a package from model files (+ manifest) on top of an optional base package (edits).
 * Errors = things that make the package unusable (missing template, limits). Warnings = silently fixed.
 */
export function assemblePackage(opts: {
  files: Record<string, string>;
  manifest: unknown | null;
  deleted?: string[];
  base?: ThemePackage | null;
  fallbackName: string;
}): AssembleResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const files: Record<string, string> = { ...(opts.base?.files ?? {}) };
  for (const p of opts.deleted ?? []) {
    if (p === "templates/menu.liquid") warnings.push("refused to delete templates/menu.liquid");
    else delete files[p];
  }
  for (const [rawPath, content] of Object.entries(opts.files)) {
    const p = rawPath === "theme.css" ? "assets/theme.css" : rawPath === "menu.liquid" ? "templates/menu.liquid" : rawPath;
    if (!isAllowedPath(p)) {
      warnings.push(`file "${p}" is not an allowed path – dropped`);
      continue;
    }
    if (p.startsWith("locales/") && /^\s*\{\s*\}\s*$/.test(content)) continue; // empty locale file – noise
    const { content: clean, removed } = stripExternal(p, content);
    if (removed) warnings.push(`${p}: removed ${removed} external reference(s)`);
    files[p] = clean;
  }
  const { manifest, warnings: mw } = opts.manifest
    ? normalizeManifest(opts.manifest, { fallbackName: opts.fallbackName, base: opts.base?.manifest })
    : opts.base
      ? { manifest: opts.base.manifest, warnings: [] }
      : normalizeManifest({}, { fallbackName: opts.fallbackName });
  warnings.push(...mw);
  if (!opts.manifest && !opts.base) errors.push("<manifest> is missing or not valid JSON");

  if (!files["templates/menu.liquid"]?.trim()) errors.push("templates/menu.liquid is missing");
  const paths = Object.keys(files);
  if (paths.length > THEME_LIMITS.maxFiles) errors.push(`too many files (${paths.length} > ${THEME_LIMITS.maxFiles})`);
  let total = 0;
  for (const p of paths) {
    const b = bytes(files[p]);
    total += b;
    if (b > THEME_LIMITS.maxFileBytes) errors.push(`${p} is too large (${b} bytes > ${THEME_LIMITS.maxFileBytes})`);
  }
  if (total > THEME_LIMITS.maxPackageBytes) errors.push(`package too large (${total} bytes)`);
  else if (total > AI_TARGET_PACKAGE_BYTES * 2) warnings.push(`package is large (${Math.round(total / 1000)} KB)`);
  return { pkg: { manifest, files }, warnings, errors };
}

export const packageBytes = (pkg: ThemePackage) => Object.values(pkg.files).reduce((n, c) => n + bytes(c), 0) + bytes(JSON.stringify(pkg.manifest));

/**
 * Product requirements we check statically (cheap, no rendering). `errors` trigger the repair round,
 * `warnings` are only reported. Keep in sync with the HARD RULES in prompts.ts.
 */
export function qualityChecks(pkg: ThemePackage): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const liquid = Object.entries(pkg.files)
    .filter(([p]) => p.endsWith(".liquid"))
    .map(([, c]) => c)
    .join("\n");
  const css = Object.entries(pkg.files)
    .filter(([p]) => p.endsWith(".css"))
    .map(([, c]) => c)
    .join("\n");
  const has = (re: RegExp) => re.test(liquid);
  if (!has(/\.allergens\b/)) errors.push("Allergens are never shown – render item.allergens (letters) and a legend (LMIV requirement).");
  if (!has(/allergens_confirmed/)) errors.push("item.allergens_confirmed is never checked – unconfirmed items must show the 'allergenUnknown' hint instead of letters.");
  if (!has(/data-vm-item/)) errors.push("No element has data-vm-item – guests can't open item details.");
  if (has(/href="#c(at)?-/) && !has(/data-vm-catnav/)) errors.push('The category navigation <nav> must carry data-vm-catnav (engine handles sticky + active category).');
  if (/scrollIntoView|IntersectionObserver/.test(pkg.files["assets/theme.js"] ?? "")) warnings.push("theme.js re-implements scroll handling – the engine's data-vm-catnav already does this.");
  if (!has(/\.available\b/)) errors.push("Sold-out state missing – check item.available and show 'soldOut'.");
  const text = hardcodedText(pkg);
  if (text.length) errors.push(`Hard-coded UI text found: ${text.map((t) => `"${t}"`).join(", ")} – every visible word must come from data or {{ 'key' | t }} (add own keys to locales/de.json, en.json, tr.json).`);
  if (!has(/\.variants\b/)) warnings.push("variants are not rendered");
  if (!has(/\.additives\b/)) warnings.push("additives are not rendered");
  if (/(margin|padding)-(left|right)\b/.test(css) || /text-align\s*:\s*(left|right)\b/.test(css) || /float\s*:\s*(left|right)\b/.test(css))
    warnings.push("physical left/right CSS found – prefer logical properties (inline-start/end) for RTL");
  if (has(/<script\b/i) && !pkg.files["assets/theme.js"]) warnings.push("inline <script> in template – prefer assets/theme.js or data-vm-* hooks");
  return { errors, warnings };
}

/** Visible words written directly into templates (outside Liquid, tags, attributes, style/script). */
export function hardcodedText(pkg: ThemePackage): string[] {
  const found = new Set<string>();
  for (const [p, c] of Object.entries(pkg.files)) {
    if (!p.endsWith(".liquid")) continue;
    const stripped = c
      .replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, " ")
      .replace(/<(style|script|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, " ")
      .replace(/<[^>]*>/g, " ");
    for (const m of stripped.matchAll(/[\p{L}][\p{L}'’.-]{2,}(?:\s+[\p{L}][\p{L}'’.-]*)*/gu)) {
      const t = m[0].trim();
      if (t && !/^(amp|nbsp|quot|middot|ndash|mdash|hellip)$/i.test(t)) found.add(t.slice(0, 40));
      if (found.size >= 6) break;
    }
  }
  return [...found];
}
