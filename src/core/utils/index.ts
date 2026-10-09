import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function formatPrice(cents: number | null | undefined, locale = "de-DE", currency = "EUR") {
  if (cents == null) return "";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** "12,50" | "12.5" | "12" → 1250 */
export function parsePriceToCents(input: string | number | null | undefined): number | null {
  if (input == null || input === "") return null;
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input.replace(/[^\d,.-]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const toBcp47 = (locale: string) =>
  ({ de: "de-DE", en: "en-GB", tr: "tr-TR", fr: "fr-FR", it: "it-IT", es: "es-ES", nl: "nl-NL", pl: "pl-PL" })[
    locale
  ] ?? locale;
