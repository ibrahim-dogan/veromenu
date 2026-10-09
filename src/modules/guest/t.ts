/**
 * Tiny translator for the guest menu (client + server). The guest UI ships only its own
 * namespace ("guest") as a plain object instead of the full next-intl client runtime → less JS
 * for cheap phones. Keys may be nested paths ("tags.vegan"); `{name}` placeholders are replaced.
 */
export type GuestMessages = { [k: string]: string | GuestMessages };
export type GuestT = ((key: string, vars?: Record<string, string | number>) => string) & { has: (key: string) => boolean };

function lookup(m: GuestMessages, key: string): string | undefined {
  let cur: string | GuestMessages | undefined = m;
  for (const part of key.split(".")) {
    if (!cur || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function createGuestT(messages: GuestMessages): GuestT {
  const t = (key: string, vars?: Record<string, string | number>) => {
    const s = lookup(messages, key) ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
  };
  return Object.assign(t, { has: (key: string) => lookup(messages, key) !== undefined });
}

/** Price formatting with Latin digits in every locale (prices must be unambiguous). */
export function makePriceFormatter(locale: string, currency: string) {
  let nf: Intl.NumberFormat;
  try {
    nf = new Intl.NumberFormat(`${locale}-u-nu-latn`, { style: "currency", currency });
  } catch {
    nf = new Intl.NumberFormat("de-DE", { style: "currency", currency });
  }
  return (cents: number | null | undefined) => (cents == null ? "" : nf.format(cents / 100));
}

/** Search normalization shared by the server (data-q attributes) and the client filter. */
export const normalizeSearch = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
