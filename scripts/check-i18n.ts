/**
 * i18n consistency check:  pnpm i18n:check   (add --verbose to list every key)
 *
 * - Every namespace in src/messages/<ui-locale>/ must have the same keys in de / en / tr
 *   (German is the reference – it is the source language).
 * - The `guest` namespace must exist with the same keys in every CONTENT_LOCALE (16 guest languages).
 * - Flags: missing keys, extra keys, empty strings, dots inside keys, missing files,
 *   and ICU placeholder mismatches ({name}, {count, plural, …}) against the reference.
 * Exits with code 1 when anything is wrong.
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT_LOCALE_CODES, DEFAULT_LOCALE, UI_LOCALES } from "../src/core/i18n/locales";

const ROOT = path.join(process.cwd(), "src", "messages");
const REF = DEFAULT_LOCALE; // "de"
const GUEST_NS = "guest";
const verbose = process.argv.includes("--verbose");

type Flat = Map<string, string>;
type Issue = { ns: string; locale: string; kind: "missingFile" | "missing" | "extra" | "empty" | "dotKey" | "placeholders" | "invalidJson"; key?: string; detail?: string };

const issues: Issue[] = [];

function readNs(locale: string, ns: string): Flat | null {
  const file = path.join(ROOT, locale, `${ns}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return flatten(JSON.parse(fs.readFileSync(file, "utf8")), "", ns, locale);
  } catch (e) {
    issues.push({ ns, locale, kind: "invalidJson", detail: (e as Error).message });
    return new Map();
  }
}

function flatten(obj: unknown, prefix: string, ns: string, locale: string, out: Flat = new Map()): Flat {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (k.includes(".")) issues.push({ ns, locale, kind: "dotKey", key: prefix + k });
      flatten(v, `${prefix}${k}.`, ns, locale, out);
    }
  } else out.set(prefix.slice(0, -1), typeof obj === "string" ? obj : JSON.stringify(obj));
  return out;
}

/** Collects ICU argument names, descending into plural/select branches (branch texts are ignored). */
function icuArgs(msg: string): string[] {
  const names = new Set<string>();
  let i = 0;
  const parseMessage = (): void => {
    while (i < msg.length) {
      const c = msg[i];
      if (c === "'" && (msg[i + 1] === "{" || msg[i + 1] === "}")) {
        // ICU quoting: '{literal}'
        const end = msg.indexOf("'", i + 1);
        i = end < 0 ? msg.length : end + 1;
      } else if (c === "{") {
        i++;
        parseArgument();
      } else if (c === "}") return;
      else i++;
    }
  };
  const readUntil = (stops: string) => {
    const start = i;
    while (i < msg.length && !stops.includes(msg[i])) i++;
    return msg.slice(start, i).trim();
  };
  const parseArgument = () => {
    const name = readUntil(",}");
    if (name && name !== "#") names.add(name);
    if (msg[i] === "}") return void i++;
    i++; // ,
    const type = readUntil(",}");
    if (msg[i] === "}") return void i++;
    i++; // ,
    if (["plural", "select", "selectordinal"].includes(type)) {
      while (i < msg.length) {
        readUntil("{}");
        if (msg[i] === "}") return void i++;
        i++; // {
        parseMessage();
        i++; // }
      }
    } else {
      let depth = 1; // skip style
      while (i < msg.length && depth) {
        depth += msg[i] === "{" ? 1 : msg[i] === "}" ? -1 : 0;
        i++;
      }
    }
  };
  parseMessage();
  return [...names].sort();
}

function compare(ns: string, locales: readonly string[], reference: string) {
  const ref = readNs(reference, ns);
  if (!ref) return;
  for (const [k, v] of ref) if (!v.trim()) issues.push({ ns, locale: reference, kind: "empty", key: k });
  for (const locale of locales) {
    if (locale === reference) continue;
    const cur = readNs(locale, ns);
    if (!cur) {
      issues.push({ ns, locale, kind: "missingFile" });
      continue;
    }
    for (const k of ref.keys()) if (!cur.has(k)) issues.push({ ns, locale, kind: "missing", key: k });
    for (const [k, v] of cur) {
      if (!ref.has(k)) issues.push({ ns, locale, kind: "extra", key: k });
      else {
        if (!v.trim()) issues.push({ ns, locale, kind: "empty", key: k });
        const a = icuArgs(ref.get(k)!).join(",");
        const b = icuArgs(v).join(",");
        if (a !== b) issues.push({ ns, locale, kind: "placeholders", key: k, detail: `${reference}{${a}} vs ${locale}{${b}}` });
      }
    }
  }
}

// ---------------------------------------------------------------- run
const namespaces = new Set<string>();
for (const l of UI_LOCALES) {
  const dir = path.join(ROOT, l);
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith(".json")) namespaces.add(f.slice(0, -5));
}
const uiNamespaces = [...namespaces].filter((n) => n !== GUEST_NS).sort();

for (const ns of uiNamespaces) {
  // A namespace that only exists in en/tr still has to exist in the reference locale.
  if (!fs.existsSync(path.join(ROOT, REF, `${ns}.json`))) {
    issues.push({ ns, locale: REF, kind: "missingFile" });
    const alt = UI_LOCALES.find((l) => fs.existsSync(path.join(ROOT, l, `${ns}.json`)))!;
    compare(ns, UI_LOCALES, alt);
  } else compare(ns, UI_LOCALES, REF);
}

const guestLocales = [...new Set([...UI_LOCALES, ...CONTENT_LOCALE_CODES])];
const guestRef = fs.existsSync(path.join(ROOT, REF, `${GUEST_NS}.json`)) ? REF : "en";
if (fs.existsSync(path.join(ROOT, guestRef, `${GUEST_NS}.json`))) compare(GUEST_NS, guestLocales, guestRef);
else issues.push({ ns: GUEST_NS, locale: guestRef, kind: "missingFile" });

// ---------------------------------------------------------------- report
const KINDS = ["missingFile", "missing", "extra", "empty", "placeholders", "dotKey", "invalidJson"] as const;
const LABEL: Record<(typeof KINDS)[number], string> = {
  missingFile: "file",
  missing: "missing",
  extra: "extra",
  empty: "empty",
  placeholders: "icu",
  dotKey: "dot-key",
  invalidJson: "json",
};

const allNs = [...uiNamespaces, GUEST_NS];
const rows: string[][] = [];
for (const ns of allNs) {
  const locs = ns === GUEST_NS ? guestLocales : [...UI_LOCALES];
  for (const locale of locs) {
    const mine = issues.filter((x) => x.ns === ns && x.locale === locale);
    if (!mine.length) continue;
    rows.push([ns, locale, ...KINDS.map((k) => String(mine.filter((x) => x.kind === k).length || ""))]);
  }
}

const keyCount = (ns: string, l: string) => readNs(l, ns)?.size ?? 0;
console.log(`\ni18n check – reference "${REF}", UI locales ${UI_LOCALES.join("/")}, guest locales ${guestLocales.length}`);
console.log(`namespaces: ${allNs.map((n) => `${n}(${keyCount(n, n === GUEST_NS ? guestRef : REF)})`).join(", ")}\n`);

if (!rows.length) {
  console.log("✔ all message catalogs are consistent\n");
  process.exit(0);
}

const header = ["namespace", "locale", ...KINDS.map((k) => LABEL[k])];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join("  ");
console.log(line(header));
console.log(widths.map((w) => "─".repeat(w)).join("  "));
rows.forEach((r) => console.log(line(r)));

const LIMIT = verbose ? Infinity : 8;
console.log("\nDetails:");
for (const ns of allNs) {
  const byLocale = new Map<string, Issue[]>();
  for (const x of issues.filter((y) => y.ns === ns)) byLocale.set(x.locale, [...(byLocale.get(x.locale) ?? []), x]);
  for (const [locale, list] of byLocale) {
    const shown = list.slice(0, LIMIT).map((x) => `${LABEL[x.kind]}${x.key ? ` ${x.key}` : ""}${x.detail ? ` (${x.detail})` : ""}`);
    const more = list.length > LIMIT ? `  … +${list.length - LIMIT} more (--verbose)` : "";
    console.log(`  ${ns}/${locale}: ${shown.join("; ")}${more}`);
  }
}
console.log(`\n✖ ${issues.length} problem(s) found\n`);
process.exit(1);
