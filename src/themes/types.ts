import type { ComponentType } from "react";
import type { GuestMenuData } from "@/modules/guest/types";
import type { GuestT } from "@/modules/guest/t";

/**
 * Theme plugin contract (see src/themes/README.md).
 *
 * A theme is a folder `src/themes/<id>/` with
 *   - `manifest.ts` – pure data (no React, no fonts): metadata + config fields. Imported by the design page.
 *   - `index.tsx`   – default export `ThemeModule`: the server component that renders the guest menu.
 * `pnpm themes:sync` scans the folders and regenerates `registry.generated.ts`.
 */

/** Localized text: at least `de` and `en`; falls back to en → de. */
export type Localized = Record<string, string>;

type FieldBase = {
  /** Config key, stored in restaurants.theme_config. */
  key: string;
  label: Localized;
  hint?: Localized;
};

export type ThemeField =
  | (FieldBase & { type: "color"; default: string })
  | (FieldBase & { type: "select"; default: string; options: { value: string; label: Localized }[] })
  /** A font pairing id from src/themes/font-pairings.ts. */
  | (FieldBase & { type: "font"; default: string; options?: string[] })
  | (FieldBase & { type: "boolean"; default: boolean })
  | (FieldBase & { type: "range"; default: number; min: number; max: number; step?: number; unit?: string });

export type ThemeManifest = {
  id: string;
  name: string;
  version: string;
  author: string;
  description: Localized;
  /** Public path of a preview image, e.g. "/themes/classic.svg". */
  preview: string;
  fields: ThemeField[];
};

export type ThemeConfigValue = string | number | boolean;
export type ThemeConfig = Record<string, ThemeConfigValue>;

export type ThemeProps = {
  data: GuestMenuData;
  /** Sanitized config with defaults applied (see config.ts). */
  config: ThemeConfig;
  /** Guest UI strings in the guest's language. */
  t: GuestT;
};

export type ThemeModule = {
  manifest: ThemeManifest;
  Component: ComponentType<ThemeProps>;
  /** CSS custom properties for the theme root (also used by status / imprint pages). */
  cssVars: (config: ThemeConfig) => Record<string, string>;
  /** Extra class names for the theme root (fonts, base styles). */
  rootClassName?: (config: ThemeConfig) => string;
};

export const localized = (l: Localized | undefined, locale: string) => (l ? (l[locale] ?? l.en ?? l.de ?? Object.values(l)[0] ?? "") : "");
