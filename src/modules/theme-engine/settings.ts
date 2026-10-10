/**
 * Manifest schema (zod) + customizer settings helpers (isomorphic).
 */
import { z } from "zod";
import { THEME_API_VERSION, type ThemeManifest, type ThemeSettingField } from "./types";
import { isFontId } from "./fonts";

export const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const SETTING_ID = /^[a-z][a-z0-9_]{0,39}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const label = z
  .record(z.string().regex(/^[a-z]{2}$/), z.string().min(1).max(120))
  .refine((l) => Object.keys(l).length > 0, "label needs at least one language (de/en)");
const base = { id: z.string().regex(SETTING_ID, "setting id must match ^[a-z][a-z0-9_]{0,39}$"), label };

export const settingFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("color"), default: z.string().regex(HEX_COLOR, "color default must be a hex color (#rrggbb)") }),
  z.object({ ...base, type: z.literal("font"), default: z.string().refine(isFontId, "unknown font id (see FONT_LIBRARY)") }),
  z
    .object({
      ...base,
      type: z.literal("select"),
      default: z.string().max(60),
      options: z
        .array(z.object({ value: z.string().regex(/^[a-z0-9_-]{1,40}$/, "option values: a-z 0-9 _ -"), label }))
        .min(1)
        .max(30),
    })
    .refine((f) => f.options.some((o) => o.value === f.default), "select default must be one of the option values"),
  z.object({ ...base, type: z.literal("checkbox"), default: z.boolean() }),
  z
    .object({
      ...base,
      type: z.literal("range"),
      default: z.number(),
      min: z.number(),
      max: z.number(),
      step: z.number().positive(),
      unit: z.string().regex(/^[a-z%]{0,4}$/, "unit must be a CSS unit like px, rem, % or empty").optional(),
    })
    .refine((f) => f.min < f.max && f.default >= f.min && f.default <= f.max, "range needs min < max and min ≤ default ≤ max"),
  z.object({ ...base, type: z.literal("text"), default: z.string().max(500), maxLength: z.number().int().min(1).max(500).optional() }),
  z.object({ ...base, type: z.literal("image"), default: z.null() }),
]);

export const manifestSchema = z.object({
  apiVersion: z.literal(THEME_API_VERSION),
  name: z.string().trim().min(1).max(60),
  version: z.string().max(20),
  author: z.string().max(80).optional(),
  description: z.record(z.string().regex(/^[a-z]{2}$/), z.string().max(400)).optional(),
  settings: z
    .array(settingFieldSchema)
    .max(60)
    .refine((s) => new Set(s.map((f) => f.id)).size === s.length, "setting ids must be unique"),
  fonts: z.array(z.string().refine(isFontId, "unknown font id (see FONT_LIBRARY)")).max(8),
  controls: z
    .object({ languageSwitcher: z.enum(["theme", "host"]).optional(), cartButton: z.enum(["theme", "host"]).optional() })
    .optional(),
  assets: z
    .record(z.string().regex(/^[a-z0-9_-]{1,40}$/, "asset names: a-z 0-9 _ -"), z.string().regex(UUID, "asset value must be a media id"))
    .refine((a) => Object.keys(a).length <= 20, "max 20 named assets")
    .optional(),
});

// ---------------------------------------------------------------- values

export type SettingValue = string | number | boolean | null;

function sanitizeValue(f: ThemeSettingField, v: unknown): SettingValue {
  switch (f.type) {
    case "color":
      return typeof v === "string" && HEX_COLOR.test(v) ? v.toLowerCase() : f.default;
    case "font":
      return isFontId(v) ? v : f.default;
    case "select":
      return typeof v === "string" && f.options.some((o) => o.value === v) ? v : f.default;
    case "checkbox":
      return typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : f.default;
    case "range": {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      return Number.isFinite(n) ? Math.min(f.max, Math.max(f.min, n)) : f.default;
    }
    case "text":
      return typeof v === "string" ? v.slice(0, f.maxLength ?? 500) : f.default;
    case "image":
      return typeof v === "string" && UUID.test(v) ? v : null;
  }
}

/** Customizer values: only known ids, valid values, defaults for the rest. Never trust stored/URL config. */
export function resolveSettings(manifest: Pick<ThemeManifest, "settings">, raw: unknown): Record<string, SettingValue> {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const fields = Array.isArray(manifest.settings) ? manifest.settings : [];
  return Object.fromEntries(fields.map((f) => [f.id, sanitizeValue(f, src[f.id])]));
}

export const defaultSettings = (manifest: Pick<ThemeManifest, "settings">) => resolveSettings(manifest, {});

/** Setting id → CSS custom property name: color_primary → --vm-color-primary */
export const settingCssVar = (id: string) => `--vm-${id.replace(/_/g, "-")}`;

/**
 * CSS custom properties for color / font / range / checkbox settings (theme.css is static, so settings reach
 * CSS this way). Values are validated → cannot break out of the declaration.
 */
export function settingsCssVars(manifest: Pick<ThemeManifest, "settings">, values: Record<string, SettingValue>, fontStack: (id: unknown) => string) {
  const decl: string[] = [];
  for (const f of manifest.settings) {
    const v = values[f.id];
    if (f.type === "color" && typeof v === "string" && HEX_COLOR.test(v)) decl.push(`${settingCssVar(f.id)}:${v}`);
    else if (f.type === "font") decl.push(`${settingCssVar(f.id)}:${fontStack(v)}`);
    else if (f.type === "range" && typeof v === "number" && Number.isFinite(v)) decl.push(`${settingCssVar(f.id)}:${v}${/^[a-z%]{0,4}$/.test(f.unit ?? "") ? (f.unit ?? "") : ""}`);
    else if (f.type === "checkbox") decl.push(`${settingCssVar(f.id)}:${v ? 1 : 0}`);
  }
  return decl.length ? `:root{${decl.join(";")}}` : "";
}

/** data-setting-* attributes for select / checkbox settings on <html> (CSS: [data-setting-density="compact"]). */
export function settingsDataAttrs(manifest: Pick<ThemeManifest, "settings">, values: Record<string, SettingValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of manifest.settings) {
    if (f.type === "select" && typeof values[f.id] === "string") out[`data-setting-${f.id.replace(/_/g, "-")}`] = String(values[f.id]);
    if (f.type === "checkbox") out[`data-setting-${f.id.replace(/_/g, "-")}`] = values[f.id] ? "true" : "false";
  }
  return out;
}

/** Font ids a package needs: manifest.fonts + every font setting value. */
export function usedFontIds(manifest: Pick<ThemeManifest, "settings" | "fonts">, values: Record<string, SettingValue>): string[] {
  const ids = new Set<string>((manifest.fonts ?? []).filter(isFontId));
  for (const f of manifest.settings ?? []) if (f.type === "font" && isFontId(values[f.id])) ids.add(values[f.id] as string);
  return [...ids];
}

/**
 * Host overlay colors (cart, item sheet, info) follow the theme when it declares these well-known color
 * settings: color_primary, color_accent, color_background, color_surface, color_text.
 */
export const HOST_COLOR_SETTINGS = {
  "--g-primary": "color_primary",
  "--g-accent": "color_accent",
  "--g-bg": "color_background",
  "--g-surface": "color_surface",
  "--g-text": "color_text",
} as const;
