/**
 * Theme engine v2 – CONTRACT shared by theme-engine (runtime), theme-studio (UI) and theme-ai (generation).
 * Keep these types stable; extend only additively.
 *
 * A theme is a PACKAGE of text files. It is rendered with Liquid (liquidjs, sandboxed, resource-limited)
 * into a full HTML document that runs inside a sandboxed iframe (`sandbox="allow-scripts"`, opaque origin,
 * strict CSP: no network, no cookies, no parent access). The only way out is the postMessage bridge
 * (see BridgeMessage). Therefore any code – human or LLM written – cannot affect the platform.
 */

export const THEME_API_VERSION = 1 as const;

/** Allowed file paths inside a package. */
export const THEME_FILE_PATTERNS = [
  /^templates\/menu\.liquid$/, // required – the guest menu page
  /^templates\/partials\/[a-z0-9_-]+\.liquid$/, // {% render 'name' %}
  /^assets\/theme\.css$/,
  /^assets\/[a-z0-9_-]+\.css$/,
  /^assets\/theme\.js$/, // optional, runs inside the sandbox only
  /^locales\/[a-z]{2}\.json$/, // theme-specific strings: {{ 'key' | t }} falls back to platform guest strings
] as const;

export const THEME_LIMITS = {
  maxFiles: 40,
  maxFileBytes: 200_000,
  maxPackageBytes: 800_000,
  renderTimeoutMs: 1500,
  maxOutputBytes: 2_000_000,
} as const;

export type ThemeSettingField =
  | { id: string; type: "color"; label: Record<string, string>; default: string }
  | { id: string; type: "font"; label: Record<string, string>; default: string } // font id from FONT_LIBRARY
  | { id: string; type: "select"; label: Record<string, string>; default: string; options: { value: string; label: Record<string, string> }[] }
  | { id: string; type: "checkbox"; label: Record<string, string>; default: boolean }
  | { id: string; type: "range"; label: Record<string, string>; default: number; min: number; max: number; step: number; unit?: string }
  | { id: string; type: "text"; label: Record<string, string>; default: string; maxLength?: number }
  | { id: string; type: "image"; label: Record<string, string>; default: null }; // value = media id → {{ settings.x | image_url }}

export type ThemeManifest = {
  apiVersion: typeof THEME_API_VERSION;
  name: string;
  version: string; // semver-ish, informational
  author?: string;
  description?: Record<string, string>; // per UI locale
  /** Customizer fields (like WordPress Customizer / Shopify settings_schema). Values: restaurants.themeConfig */
  settings: ThemeSettingField[];
  /** Font ids from the self-hosted FONT_LIBRARY that the theme may use (CSS is injected automatically). */
  fonts: string[];
  /** Who renders these controls: the theme itself, or the host overlay (default "host"). */
  controls?: { languageSwitcher?: "theme" | "host"; cartButton?: "theme" | "host" };
  /** Named theme images (textures, ornaments): name → media id. Template: {{ 'paper' | asset_url }} */
  assets?: Record<string, string>;
};

export type ThemePackage = {
  manifest: ThemeManifest;
  /** path → file content (see THEME_FILE_PATTERNS) */
  files: Record<string, string>;
};

export type ThemeValidation = {
  ok: boolean;
  errors: { file?: string; line?: number; message: string }[];
  warnings: { file?: string; message: string }[];
};

/**
 * Data available to Liquid templates (snake_case, documented in docs/THEMES.md and given to the LLM).
 * Built from GuestMenuData by theme-engine `buildThemeView()`.
 */
export type ThemeView = {
  restaurant: {
    name: string;
    slug: string;
    cuisine: string | null;
    logo_url: string | null;
    cover_url: string | null;
    address: string | null;
    phone: string | null;
    opening_hours: { day: number; day_name: string; open: string; close: string }[];
  };
  locale: string;
  dir: "ltr" | "rtl";
  languages: { code: string; name: string; flag: string; active: boolean }[];
  table: { label: string } | null;
  ordering: { enabled: boolean };
  menus: {
    id: string;
    name: string;
    description: string | null;
    categories: {
      id: string;
      name: string;
      description: string | null;
      image_url: string | null;
      items: {
        id: string;
        name: string;
        description: string | null;
        price: number | null; // cents
        price_formatted: string; // "8,90 €" (guest locale) or "" for "price on request"
        image_url: string | null;
        image_url_large: string | null;
        image_is_ai: boolean;
        tags: string[];
        allergens_confirmed: boolean;
        allergens: { code: string; letter: string; label: string }[];
        additives: { code: string; letter: string; label: string }[];
        available: boolean;
        orderable: boolean;
        variants: { id: string; name: string; price: number; price_formatted: string }[];
      }[];
    }[];
    /** additive: false when the menu has time windows and is currently closed. */
    active_now?: boolean;
  }[];
  /** Customizer values merged with manifest defaults. */
  settings: Record<string, unknown>;
  /** "preview" inside the studio, "live" for guests. */
  mode: "live" | "preview";
  // ---- additive (v1.1) – always filled by buildThemeView() / sampleThemeView()
  /** ISO currency of the prices (used by the `money` filter). Default "EUR". */
  currency?: string;
  /** Allergens / additives used by confirmed items on this menu (legend). */
  legend?: { allergens: ThemeLabel[]; additives: ThemeLabel[] };
  /** At least one item has unconfirmed allergen info → show the staff notice ('allergenNotice' | t). */
  has_unconfirmed_allergens?: boolean;
  /** Plan without custom branding → theme may show 'poweredBy' | t (the host info sheet always shows it). */
  show_branding?: boolean;
};

export type ThemeLabel = { code: string; letter: string; label: string };

/**
 * Bridge protocol. Elements with data attributes work without any theme JS:
 *   data-vm-item="<itemId>"                 → opens the host item sheet (details, allergens, variants)
 *   data-vm-add="<itemId>" [data-vm-variant] → adds to cart (host cart)
 *   data-vm-lang="<code>"                   → switches guest language
 *   data-vm-cart                            → opens the host cart
 *   data-vm-info                            → opens legal/allergen info sheet
 * Theme JS may call window.VeroMenu.{openItem, addToCart, setLanguage, openCart, openInfo, track}.
 * Host → frame: { type: "vm:cart", count, totalFormatted } (also sets <html data-cart-count>).
 */
export type BridgeMessage =
  | { type: "vm:ready"; height?: number }
  | { type: "vm:openItem"; itemId: string }
  | { type: "vm:addToCart"; itemId: string; variantId?: string | null; quantity?: number }
  | { type: "vm:setLanguage"; code: string }
  | { type: "vm:openCart" }
  | { type: "vm:openInfo" }
  | { type: "vm:track"; event: "item_view" | "category_view"; id: string };

/** Host → frame messages (frame validates `event.source === window.parent`). */
export type HostMessage = {
  type: "vm:cart";
  count: number;
  totalFormatted: string;
  /** Height (px) of host UI covering the bottom of the frame (cart bar) – the bridge adds a spacer. */
  insetBottom?: number;
};

/** Theme id stored in restaurants.themeId for studio themes. Built-in React themes keep plain ids ("classic"). */
export const studioThemeId = (themeId: string) => `studio:${themeId}`;
export const parseStudioThemeId = (v: string | null | undefined) => (v?.startsWith("studio:") ? v.slice(7) : null);
