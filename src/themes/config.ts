import { FONT_PAIRING_IDS } from "./font-pairings";
import type { ThemeConfig, ThemeField, ThemeManifest } from "./types";

/** Client-safe helpers around theme config (defaults, sanitizing, preview encoding, colors). */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function defaultConfig(manifest: ThemeManifest): ThemeConfig {
  return Object.fromEntries(manifest.fields.map((f) => [f.key, f.default]));
}

function sanitizeValue(f: ThemeField, v: unknown): ThemeConfig[string] {
  switch (f.type) {
    case "color":
      return typeof v === "string" && HEX.test(v) ? v.toLowerCase() : f.default;
    case "select":
      return typeof v === "string" && f.options.some((o) => o.value === v) ? v : f.default;
    case "font": {
      const allowed = f.options ?? FONT_PAIRING_IDS;
      return typeof v === "string" && (allowed as string[]).includes(v) ? v : f.default;
    }
    case "boolean":
      return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : f.default;
    case "range": {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      return Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.default;
    }
  }
}

/** Only known keys, valid values; unknown/invalid → defaults. Never trust stored or URL config. */
export function sanitizeConfig(manifest: ThemeManifest, raw: unknown): ThemeConfig {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(manifest.fields.map((f) => [f.key, sanitizeValue(f, src[f.key])]));
}

// ---------------------------------------------------------------- preview param (base64url JSON)

export function encodeConfigParam(config: ThemeConfig): string {
  const json = JSON.stringify(config);
  const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeConfigParam(param: string | null | undefined): unknown {
  if (!param || param.length > 4000) return null;
  try {
    const b64 = param.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- colors

function rgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable text color (near-black or white) on the given background. */
export function onColor(hex: string, dark = "#111111", light = "#ffffff") {
  const L = luminance(HEX.test(hex) ? hex : "#000000");
  const cWhite = 1.05 / (L + 0.05);
  const cBlack = (L + 0.05) / 0.05;
  return cBlack >= cWhite ? dark : light;
}

/** Common config → shared CSS variables used by the guest building blocks. */
export function commonVars(c: ThemeConfig): Record<string, string> {
  const primary = String(c.primaryColor ?? "#7a3e1d");
  const accent = String(c.accentColor ?? primary);
  const dense = c.density === "dense";
  return {
    "--g-primary": primary,
    "--g-on-primary": onColor(primary),
    "--g-accent": accent,
    "--g-on-accent": onColor(accent),
    "--g-radius": `${Number(c.radius ?? 12)}px`,
    "--g-gap": dense ? "0.5rem" : "1rem",
    "--g-pad": dense ? "0.625rem" : "1rem",
  };
}
