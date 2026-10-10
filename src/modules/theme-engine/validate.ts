/**
 * Package validation (isomorphic): structure, limits, manifest schema, Liquid syntax (file + line),
 * cheap JS/CSS checks and authoring warnings. Never executes theme code.
 */
import { THEME_FILE_PATTERNS, THEME_LIMITS, type ThemePackage, type ThemeValidation } from "./types";
import { manifestSchema } from "./settings";
import { createEngine, errorLine, errorMessage, MENU_TEMPLATE, PARTIAL_PATH, parseLocaleFile, unknownFilters } from "./liquid";

type Err = ThemeValidation["errors"][number];
type Warn = ThemeValidation["warnings"][number];

const utf8Bytes = (s: string) => {
  // TextEncoder exists in browsers and Node ≥ 11
  return new TextEncoder().encode(s).length;
};

const lineOf = (src: string, index: number) => src.slice(0, index).split("\n").length;

/** Patterns that are blocked by the sandbox/CSP – flagged so authors know why something won't work. */
const HTML_ERRORS: { re: RegExp; message: string }[] = [
  { re: /<base[\s>]/i, message: "<base> is not allowed" },
  { re: /<meta[^>]+http-equiv/i, message: "<meta http-equiv> is not allowed (CSP/refresh are controlled by the platform)" },
  { re: /<(iframe|frame|object|embed|portal)[\s>]/i, message: "<iframe>/<object>/<embed> are not allowed in themes" },
  { re: /<script[^>]*\ssrc\s*=/i, message: "external scripts (<script src>) are not allowed – put code into assets/theme.js" },
  { re: /<link[^>]*rel\s*=\s*["']?stylesheet/i, message: "<link rel=stylesheet> is not allowed – put CSS into assets/*.css" },
];
const HTML_WARNINGS: { re: RegExp; message: string }[] = [
  { re: /<form[\s>]/i, message: "<form> submissions are blocked in the sandbox – use data-vm-* hooks" },
  { re: /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i, message: "menu.liquid renders the BODY content only – <!doctype>/<html>/<head>/<body> are added by the platform" },
  { re: /<(video|audio)[\s>]/i, message: "media elements are blocked by the CSP (media-src 'none')" },
];
const EXTERNAL_URL = /(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"')]*/i;
const JS_WARNINGS: { re: RegExp; message: string }[] = [
  { re: /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/, message: "network access is blocked in the sandbox (connect-src 'none')" },
  { re: /\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/, message: "storage/cookies are unavailable in the sandbox (opaque origin) – guard with try/catch" },
  { re: /\b(window\.top|window\.parent|parent\.document|top\.location)\b/, message: "the parent page is not accessible – use window.VeroMenu" },
  { re: /\b(eval|Function)\s*\(/, message: "eval/new Function are discouraged" },
  { re: /\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/, message: "alert/confirm/prompt are blocked in the sandbox" },
];

/**
 * Cheap, parser-free JS sanity check: balanced (), [], {} outside strings/comments/template literals.
 * Regex literals make this heuristic → result is reported as a warning, never as an error.
 */
function jsBalanceProblem(src: string): { message: string; line: number } | null {
  const stack: { c: string; i: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let i = 0;
  const n = src.length;
  const tpl: number[] = []; // brace depth at which a template literal expression started
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      if (end < 0) return { message: "unterminated /* comment", line: lineOf(src, i) };
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") i++;
        else if (src[i] === "\n") return { message: "unterminated string", line: lineOf(src, start) };
        i++;
      }
      i++;
      continue;
    }
    if (c === "`" || (c === "}" && tpl.length && tpl[tpl.length - 1] === stack.length)) {
      if (c === "}") tpl.pop();
      const start = i++;
      let closed = false;
      while (i < n) {
        if (src[i] === "\\") i += 2;
        else if (src[i] === "`") {
          i++;
          closed = true;
          break;
        } else if (src[i] === "$" && src[i + 1] === "{") {
          i += 2;
          tpl.push(stack.length);
          closed = true;
          break;
        } else i++;
      }
      if (!closed) return { message: "unterminated template literal", line: lineOf(src, start) };
      continue;
    }
    if (c === "(" || c === "[" || c === "{") stack.push({ c, i });
    else if (c === ")" || c === "]" || c === "}") {
      const top = stack.pop();
      if (!top || top.c !== pairs[c]) return { message: `unexpected "${c}"`, line: lineOf(src, i) };
    }
    i++;
  }
  if (stack.length) return { message: `unclosed "${stack[stack.length - 1].c}"`, line: lineOf(src, stack[stack.length - 1].i) };
  return null;
}

export function validatePackage(pkg: ThemePackage): ThemeValidation {
  const errors: Err[] = [];
  const warnings: Warn[] = [];
  const done = (): ThemeValidation => ({ ok: errors.length === 0, errors, warnings });

  if (!pkg || typeof pkg !== "object" || !pkg.files || typeof pkg.files !== "object" || Array.isArray(pkg.files)) {
    errors.push({ message: "package must be an object { manifest, files }" });
    return done();
  }

  // ---- manifest
  const parsed = manifestSchema.safeParse(pkg.manifest);
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 30)) errors.push({ file: "manifest.json", message: `${issue.path.join(".") || "manifest"}: ${issue.message}` });
  }

  // ---- files: paths, sizes
  const entries = Object.entries(pkg.files);
  if (entries.length > THEME_LIMITS.maxFiles) errors.push({ message: `too many files (${entries.length} > ${THEME_LIMITS.maxFiles})` });
  let total = utf8Bytes(JSON.stringify(pkg.manifest ?? {}));
  for (const [path, content] of entries) {
    if (!THEME_FILE_PATTERNS.some((re) => re.test(path))) {
      errors.push({ file: path, message: "file path not allowed (see THEME_FILE_PATTERNS)" });
      continue;
    }
    if (typeof content !== "string") {
      errors.push({ file: path, message: "file content must be a string" });
      continue;
    }
    const size = utf8Bytes(content);
    total += size;
    if (size > THEME_LIMITS.maxFileBytes) errors.push({ file: path, message: `file too large (${size} > ${THEME_LIMITS.maxFileBytes} bytes)` });
  }
  if (total > THEME_LIMITS.maxPackageBytes) errors.push({ message: `package too large (${total} > ${THEME_LIMITS.maxPackageBytes} bytes)` });
  if (typeof pkg.files[MENU_TEMPLATE] !== "string") errors.push({ file: MENU_TEMPLATE, message: "required template missing" });
  if (errors.some((e) => /too large|too many/.test(e.message))) return done(); // don't parse huge input

  // ---- Liquid
  const engine = createEngine({ pkg, locale: "de", currency: "EUR", assetBaseUrl: "https://x.invalid", guestMessages: {} });
  const partials = new Set(entries.map(([p]) => p.match(PARTIAL_PATH)?.[1]).filter(Boolean) as string[]);
  const usedPartials = new Set<string>();
  const liquidFiles = entries.filter(([p, c]) => p.endsWith(".liquid") && typeof c === "string") as [string, string][];
  let allTemplates = "";
  for (const [path, src] of liquidFiles) {
    allTemplates += src + "\n";
    try {
      const tpl = engine.parse(src, path);
      for (const f of unknownFilters(engine, tpl)) warnings.push({ file: path, message: `unknown filter "${f.name}"${f.line ? ` (line ${f.line})` : ""} – it will be ignored` });
    } catch (e) {
      errors.push({ file: path, line: errorLine(e), message: errorMessage(e) });
    }
    for (const m of src.matchAll(/\{%-?\s*(render|include)\s+["']([^"']+)["']/g)) {
      const name = m[2];
      usedPartials.add(name);
      if (!partials.has(name)) errors.push({ file: path, line: lineOf(src, m.index ?? 0), message: `partial "${name}" not found (expected templates/partials/${name}.liquid)` });
    }
    if (/\{%-?\s*(render|include)\s+[^"'\s]/.test(src)) errors.push({ file: path, message: "partial names must be string literals: {% render 'name' %}" });
    if (/\{%-?\s*layout\b/.test(src)) errors.push({ file: path, message: "{% layout %} is not supported – menu.liquid renders the body" });
    for (const r of HTML_ERRORS) {
      const m = r.re.exec(src);
      if (m) errors.push({ file: path, line: lineOf(src, m.index), message: r.message });
    }
    for (const r of HTML_WARNINGS) if (r.re.test(src)) warnings.push({ file: path, message: r.message });
    const ext = EXTERNAL_URL.exec(src.replace(/xmlns(:\w+)?="[^"]*"/g, ""));
    if (ext) warnings.push({ file: path, message: `external URL "${ext[0].slice(0, 60)}" will be blocked by the CSP – only platform media/fonts load` });
  }
  for (const p of partials) if (!usedPartials.has(p) && !new RegExp(`["']${p}["']`).test(allTemplates)) warnings.push({ file: `templates/partials/${p}.liquid`, message: "partial is never rendered" });

  if (allTemplates) {
    if (!/data-vm-item/.test(allTemplates)) warnings.push({ message: "no data-vm-item hook – guests cannot open item details (allergens, variants)" });
    if (!/data-vm-add/.test(allTemplates)) warnings.push({ message: "no data-vm-add hook – items can only be ordered from the item sheet" });
    if (!/image_is_ai/.test(allTemplates) && !/data-vm-ai-label/.test(allTemplates))
      warnings.push({ message: "AI images are not labelled by the theme – the platform injects 'KI-generiertes Symbolbild' labels automatically" });
    if (!/allergens_confirmed/.test(allTemplates)) warnings.push({ message: "item.allergens_confirmed is never checked – unconfirmed items must show the staff notice ('allergenUnknown' | t)" });
    if (!/available/.test(allTemplates)) warnings.push({ message: "item.available is never checked – sold-out items should be marked ('soldOut' | t)" });
    if (pkg.manifest?.controls?.languageSwitcher === "theme" && !/data-vm-lang/.test(allTemplates)) warnings.push({ message: 'controls.languageSwitcher is "theme" but no data-vm-lang hook found' });
    if (pkg.manifest?.controls?.cartButton === "theme" && !/data-vm-cart/.test(allTemplates)) warnings.push({ message: 'controls.cartButton is "theme" but no data-vm-cart hook found' });
  }

  // ---- CSS / JS / locales
  for (const [path, src] of entries) {
    if (typeof src !== "string") continue;
    if (path.endsWith(".css")) {
      if (/@import/i.test(src)) warnings.push({ file: path, message: "@import is blocked – inline the CSS" });
      if (/<\/style/i.test(src)) errors.push({ file: path, message: "CSS must not contain </style>" });
      const ext = EXTERNAL_URL.exec(src.replace(/xmlns(:\w+)?=\\?["'][^"']*["']/g, ""));
      if (ext) warnings.push({ file: path, message: `external URL "${ext[0].slice(0, 60)}" will be blocked by the CSP` });
      if (/@font-face/i.test(src)) warnings.push({ file: path, message: "@font-face is not needed – list font ids in manifest.fonts (self-hosted)" });
      const open = (src.match(/\{/g) ?? []).length;
      const close = (src.match(/\}/g) ?? []).length;
      if (open !== close) warnings.push({ file: path, message: `unbalanced braces in CSS ({: ${open}, }: ${close})` });
    } else if (path.endsWith(".js")) {
      if (/<\/script/i.test(src)) errors.push({ file: path, message: "JS must not contain </script>" });
      const p = jsBalanceProblem(src);
      if (p) warnings.push({ file: path, message: `possible syntax error: ${p.message} (line ${p.line})` });
      for (const w of JS_WARNINGS) if (w.re.test(src)) warnings.push({ file: path, message: w.message });
    } else if (path.startsWith("locales/")) {
      const obj = parseLocaleFile(src);
      if (!obj) errors.push({ file: path, message: "locale file must be a JSON object" });
      else {
        const bad: string[] = [];
        const check = (o: Record<string, unknown>, prefix: string, depth: number) => {
          for (const [k, v] of Object.entries(o)) {
            if (typeof v === "string") continue;
            if (v && typeof v === "object" && !Array.isArray(v) && depth < 3) check(v as Record<string, unknown>, `${prefix}${k}.`, depth + 1);
            else bad.push(prefix + k);
          }
        };
        check(obj, "", 0);
        if (bad.length) errors.push({ file: path, message: `locale values must be strings (or nested objects): ${bad.slice(0, 5).join(", ")}` });
      }
    }
  }
  if (!pkg.files["locales/de.json"] && entries.some(([p]) => p.startsWith("locales/"))) warnings.push({ message: "locales/de.json missing – German is the default guest language" });

  return done();
}
