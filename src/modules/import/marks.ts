import { ADDITIVES, ALLERGENS } from "@/modules/allergens/catalog";

/**
 * Printed allergen/additive footnote marks → catalog codes (pure, shared by server + tests).
 *
 * - With a printed legend the legend decides ("A = Glutenhaltiges Getreide" → gluten).
 * - Without a legend the German standard scheme is used when it is evident for the whole menu:
 *   letters A–H, L–P, R (optionally with sub numbers like A1 = Weizen) = the 14 allergens,
 *   numbers 1–14 = additives. "Evident" = every mark fits the scheme and at least one letter is used
 *   (numbers alone are ambiguous – some menus number the allergens 1–14).
 * - Otherwise nothing is mapped; the raw marks stay visible for a human.
 */

export type LegendEntry = { mark: string; label: string; code: string | null };
export type MarkScheme = "legend" | "standard" | "none";
export type MappedCodes = { allergens: string[]; additives: string[] };

const ALLERGEN_BY_LETTER = new Map(ALLERGENS.map((a) => [a.letter, a.code]));
const ADDITIVE_BY_NUMBER = new Map(ADDITIVES.map((a) => [a.letter, a.code]));
const ALLERGEN_CODES = new Set(ALLERGENS.map((a) => a.code));
const ADDITIVE_CODES = new Set(ADDITIVES.map((a) => a.code));

const SUPERSCRIPT: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

/** "(a)", " 1.", "A)" , "¹¹" → "A", "1", "A", "11". */
export function normalizeMark(raw: string): string {
  return raw
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUPERSCRIPT[c])
    .replace(/[()[\]{}.*:=\s]/g, "")
    .toUpperCase();
}

/** Splits combined marks ("A,C,G", "1/3") and normalises them; keeps order, drops duplicates/empties. */
export function splitMarks(marks: string[]): string[] {
  const out: string[] = [];
  for (const m of marks)
    for (const part of m.split(/[,;/|+\s]+/)) {
      const n = normalizeMark(part);
      if (n && n.length <= 6 && !out.includes(n)) out.push(n);
    }
  return out;
}

/** Standard German scheme for one normalised mark. */
export function standardCode(mark: string): { kind: "allergen" | "additive"; code: string } | null {
  const letter = /^([A-Z])(\d{1,2})?$/.exec(mark);
  if (letter) {
    const code = ALLERGEN_BY_LETTER.get(letter[1]);
    return code ? { kind: "allergen", code } : null;
  }
  if (/^\d{1,2}$/.test(mark)) {
    const code = ADDITIVE_BY_NUMBER.get(String(Number(mark)));
    return code ? { kind: "additive", code } : null;
  }
  return null;
}

/** Legend entries from the model, normalised; codes outside the catalog become null. */
export function cleanLegend(entries: { mark: string; meaning?: string; label?: string; code?: string }[]): LegendEntry[] {
  const out: LegendEntry[] = [];
  for (const e of entries) {
    const mark = normalizeMark(e.mark ?? "");
    const label = (e.meaning ?? e.label ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!mark || mark.length > 6 || out.some((x) => x.mark === mark)) continue;
    const code = (e.code ?? "").trim().toLowerCase();
    out.push({ mark, label, code: ALLERGEN_CODES.has(code) || ADDITIVE_CODES.has(code) ? code : null });
  }
  return out.slice(0, 60);
}

/** Decides how the marks of a whole menu are to be read. */
export function detectScheme(allMarks: string[], legend: LegendEntry[]): MarkScheme {
  if (legend.some((e) => e.code)) return "legend";
  const marks = splitMarks(allMarks);
  if (!marks.length) return "none";
  if (!marks.every((m) => standardCode(m))) return "none";
  return marks.some((m) => /^[A-Z]/.test(m)) ? "standard" : "none";
}

function push(target: MappedCodes, code: string) {
  if (ALLERGEN_CODES.has(code)) {
    if (!target.allergens.includes(code)) target.allergens.push(code);
  } else if (ADDITIVE_CODES.has(code) && !target.additives.includes(code)) target.additives.push(code);
}

/** Maps one item's marks with the detected scheme. */
export function mapMarks(marks: string[], scheme: MarkScheme, legend: LegendEntry[]): MappedCodes {
  const out: MappedCodes = { allergens: [], additives: [] };
  if (scheme === "none") return out;
  const byMark = new Map(legend.filter((e) => e.code).map((e) => [e.mark, e.code!]));
  for (const m of splitMarks(marks)) {
    if (scheme === "legend") {
      // exact entry, else the letter group of a sub mark ("A1" → "A")
      const code = byMark.get(m) ?? (/^[A-Z]\d+$/.test(m) ? byMark.get(m[0]) : undefined);
      if (code) push(out, code);
    } else {
      const s = standardCode(m);
      if (s) push(out, s.code);
    }
  }
  return out;
}
