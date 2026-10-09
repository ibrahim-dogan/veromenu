/** Pure price helpers for bulk price changes (safe to import anywhere). */

export type Rounding = "none" | "0.10" | "0.50" | "0.90";

export const MAX_PRICE_CENTS = 100_000; // 1.000 € – anything above is treated as a model error

const STEP: Record<Rounding, number> = { none: 1, "0.10": 10, "0.50": 50, "0.90": 100 };

function roundTo(raw: number, rounding: Rounding): number {
  switch (rounding) {
    case "none":
      return Math.round(raw);
    case "0.10":
      return Math.round(raw / 10) * 10;
    case "0.50":
      return Math.round(raw / 50) * 50;
    case "0.90": {
      // nearest price ending in ,90
      const base = Math.floor(raw / 100) * 100 + 90;
      const candidates = [base - 100, base, base + 100].filter((c) => c >= 0);
      return candidates.reduce((best, c) => (Math.abs(c - raw) < Math.abs(best - raw) ? c : best), candidates[0] ?? 90);
    }
  }
}

/**
 * Applies a percentage and/or absolute change and rounds. Rounding never moves the price against the
 * direction of the change (a +5 % increase is never rounded below the old price).
 */
export function adjustPrice(
  cents: number,
  opts: { percent?: number | null; amountCents?: number | null; rounding?: Rounding | null },
): number {
  const rounding = opts.rounding ?? "none";
  let raw = cents;
  if (opts.percent) raw = raw * (1 + opts.percent / 100);
  if (opts.amountCents) raw = raw + opts.amountCents;
  const dir = Math.sign(raw - cents);
  let r = roundTo(raw, rounding);
  const step = STEP[rounding];
  if (dir > 0) while (r < cents) r += step;
  if (dir < 0) while (r > cents && r - step >= 0) r -= step;
  return Math.max(0, r);
}

export function isSanePrice(cents: unknown): cents is number {
  return typeof cents === "number" && Number.isInteger(cents) && cents >= 0 && cents <= MAX_PRICE_CENTS;
}
