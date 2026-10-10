/**
 * Parser for the theme-AI output format (pure, isomorphic, no server deps → unit-testable offline).
 *
 *   <file path="templates/menu.liquid"> … </file>
 *   <file path="assets/theme.css"> … </file>
 *   <delete path="templates/partials/old.liquid" />        (edits only)
 *   <manifest>{ … json … }</manifest>
 *   <summary> … </summary>
 *
 * File blocks are far more robust than JSON for code (no escaping of quotes/newlines). The parser tolerates
 * what models actually do: markdown fences around the whole answer or inside a block, CDATA wrappers,
 * single quotes / `name=` instead of `path=`, a missing closing tag (block ends at the next tag or at EOF →
 * `truncated`), prose before/after the blocks, trailing commas / comments in the manifest JSON.
 */

export type ParsedThemeOutput = {
  files: Record<string, string>;
  deleted: string[];
  manifest: unknown | null;
  manifestError: string | null;
  summary: string | null;
  /** A block was not closed – the answer was probably cut off by the token limit. */
  truncated: boolean;
  warnings: string[];
};

const OPEN_TAG = /<(file|manifest|summary|delete|plan)\b([^>]*?)(\/?)>/gi;

function attr(attrs: string, ...names: string[]): string | null {
  for (const n of names) {
    const m = new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s/>]+))`, "i").exec(attrs);
    if (m) return (m[1] ?? m[2] ?? m[3] ?? "").trim();
  }
  return null;
}

export function normalizePath(p: string): string {
  return p
    .trim()
    .replace(/\\/g, "/")
    .replace(/^(\.\/|\/)+/, "")
    .replace(/\/{2,}/g, "/");
}

/** Removes a CDATA wrapper and a single markdown fence wrapping the whole block content. */
export function unwrapContent(raw: string): string {
  let s = raw.replace(/^\r?\n/, "");
  const trimmed = s.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)(?:\]\]>)?$/.exec(trimmed);
  if (cdata) s = cdata[1];
  const t = s.trim();
  const fence = /^```[\w-]*[^\S\n]*\n([\s\S]*?)\n?```$/.exec(t);
  if (fence) s = fence[1];
  else if (/^```[\w-]*[^\S\n]*\n/.test(t) && !t.slice(3).includes("```")) s = t.replace(/^```[\w-]*[^\S\n]*\n/, ""); // opened, never closed
  return s.replace(/^\r?\n/, "").replace(/\s+$/, "") + "\n";
}

/** Lenient JSON parse: fences, prose around the object, // and /* *\/ comments, trailing commas. */
export function parseLenientJson(raw: string): unknown {
  let s = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object found");
  s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    const cleaned = stripJsonComments(s).replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(cleaned);
  }
}

function stripJsonComments(s: string): string {
  let out = "";
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\") out += s[++i] ?? "";
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && s[i + 1] === "*") {
      i = s.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else out += c;
  }
  return out;
}

export function parseThemeOutput(text: string): ParsedThemeOutput {
  const out: ParsedThemeOutput = { files: {}, deleted: [], manifest: null, manifestError: null, summary: null, truncated: false, warnings: [] };
  const src = text.replace(/\r\n/g, "\n");

  // Collect all opening tags first; each block's content runs to its own closing tag, or – if missing – to the
  // next opening tag (truncation / sloppy output).
  const tags: { kind: string; attrs: string; selfClosing: boolean; start: number; end: number }[] = [];
  OPEN_TAG.lastIndex = 0;
  for (let m: RegExpExecArray | null; (m = OPEN_TAG.exec(src)); ) {
    tags.push({ kind: m[1].toLowerCase(), attrs: m[2] ?? "", selfClosing: m[3] === "/", start: m.index, end: m.index + m[0].length });
  }

  let cursor = 0;
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (tag.start < cursor) continue; // inside a previous block (e.g. "<summary>" mentioned in CSS comment)
    if (tag.kind === "delete") {
      const p = attr(tag.attrs, "path", "name");
      if (p) out.deleted.push(normalizePath(p));
      cursor = tag.end;
      if (!tag.selfClosing) {
        const close = src.indexOf("</delete>", tag.end);
        if (close >= 0 && close - tag.end < 200) cursor = close + "</delete>".length;
      }
      continue;
    }
    if (tag.selfClosing) {
      cursor = tag.end;
      continue;
    }
    if (tag.kind === "plan") {
      // Model's design notes – ignored, but consumed so tag names mentioned inside don't start blocks.
      const close = indexOfCI(src, "</plan>", tag.end);
      cursor = close >= 0 ? close + "</plan>".length : tag.end;
      continue;
    }
    const closeTag = `</${tag.kind}>`;
    const closeIdx = indexOfCI(src, closeTag, tag.end);
    // A closing tag only counts if no other block-starting tag appears before it (otherwise it belongs to a later
    // block). HTML has a real <summary> element (<details><summary>…), so inside a file only `<file path=…>` and
    // `<manifest>` start a new block.
    const nextOpen = tags
      .slice(i + 1)
      .find(
        (t) =>
          t.start >= tag.end &&
          !t.selfClosing &&
          ((t.kind === "file" && attr(t.attrs, "path", "name")) || (t.kind === "manifest" && tag.kind !== "manifest") || (t.kind === "summary" && tag.kind === "manifest")),
      );
    let contentEnd: number;
    let closed = true;
    if (closeIdx >= 0 && (!nextOpen || closeIdx < nextOpen.start)) {
      contentEnd = closeIdx;
      cursor = closeIdx + closeTag.length;
    } else {
      closed = false;
      contentEnd = nextOpen ? nextOpen.start : src.length;
      cursor = contentEnd;
    }
    let raw = src.slice(tag.end, contentEnd);
    if (!closed) {
      raw = raw.replace(/\n```\s*$/, "\n"); // a fence that wrapped the whole answer
      if (!nextOpen) out.truncated = true;
      out.warnings.push(`<${tag.kind}${tag.kind === "file" ? ` ${attr(tag.attrs, "path", "name") ?? ""}` : ""}> was not closed`);
    }

    if (tag.kind === "file") {
      const p = attr(tag.attrs, "path", "name");
      if (!p) {
        out.warnings.push("file block without path ignored");
        continue;
      }
      const path = normalizePath(p);
      if (out.files[path] !== undefined) out.warnings.push(`duplicate file ${path} – last one wins`);
      out.files[path] = unwrapContent(raw);
    } else if (tag.kind === "manifest") {
      try {
        out.manifest = parseLenientJson(raw);
        out.manifestError = null;
      } catch (e) {
        out.manifestError = e instanceof Error ? e.message : String(e);
      }
    } else if (tag.kind === "summary") {
      const s = raw.replace(/```/g, "").trim();
      out.summary = s ? s.slice(0, 2000) : null;
    }
  }

  // Fallback: a ```json fenced manifest without the tag.
  if (out.manifest === null && !out.manifestError && !tags.some((t) => t.kind === "manifest")) {
    const m = /```json\s*(\{[\s\S]*?"apiVersion"[\s\S]*?\})\s*```/.exec(src);
    if (m) {
      try {
        out.manifest = parseLenientJson(m[1]);
        out.warnings.push("manifest taken from a ```json block");
      } catch {
        /* ignore */
      }
    }
  }
  // Fallback: markdown style ("### templates/menu.liquid" / "**assets/theme.css**" followed by a fenced block).
  if (!Object.keys(out.files).length) {
    const re = /(?:^|\n)[#*`\s>-]*((?:templates\/(?:partials\/)?[a-z0-9_-]+\.liquid|assets\/[a-z0-9_-]+\.(?:css|js)|locales\/[a-z]{2}\.json))[`*:\s]*\n+```[\w-]*\n([\s\S]*?)(?:\n```|$)/gi;
    for (const m of src.matchAll(re)) out.files[normalizePath(m[1])] = m[2].replace(/\s+$/, "") + "\n";
    if (Object.keys(out.files).length) out.warnings.push("files parsed from markdown sections (model ignored the block format)");
  }
  out.deleted = [...new Set(out.deleted)].filter((p) => out.files[p] === undefined);
  return out;
}

function indexOfCI(haystack: string, needle: string, from: number) {
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"), "ig");
  re.lastIndex = from;
  const m = re.exec(haystack);
  return m ? m.index : -1;
}

/** Serializes files back into the block format (used to show the model the current package for edits). */
export function filesToBlocks(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([p, c]) => `<file path="${p}">\n${c.replace(/\s+$/, "")}\n</file>`)
    .join("\n\n");
}
