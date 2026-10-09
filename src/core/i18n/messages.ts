import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Messages live in src/messages/<locale>/<namespace>.json (one file per namespace so modules
 * own their strings). The namespace is the file name: guest.json → t("guest.xyz").
 * English is the fallback for every locale.
 */
const ROOT = path.join(process.cwd(), "src", "messages");
const cache = new Map<string, Record<string, unknown>>();

function loadLocale(locale: string): Record<string, unknown> {
  const dir = path.join(ROOT, locale);
  if (!fs.existsSync(dir)) return {};
  const out: Record<string, unknown> = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    out[file.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return out;
}

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object"
        ? deepMerge(b as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}

export function getMessages(locale: string): Record<string, unknown> {
  const dev = process.env.NODE_ENV !== "production";
  if (!dev && cache.has(locale)) return cache.get(locale)!;
  const merged = locale === "en" ? loadLocale("en") : deepMerge(loadLocale("en"), loadLocale(locale));
  cache.set(locale, merged);
  return merged;
}

/** Only a subset of namespaces, e.g. for the guest menu client bundle. */
export function getNamespaces(locale: string, namespaces: string[]) {
  const all = getMessages(locale);
  return Object.fromEntries(namespaces.map((n) => [n, all[n] ?? {}]));
}
