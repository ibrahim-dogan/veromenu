/**
 * Isomorphic helpers for theme packages used by the Theme Studio UI and its server actions.
 * No server-only imports – runs in the browser (editor, customizer) and on the server (actions).
 */
import {
  THEME_API_VERSION,
  THEME_FILE_PATTERNS,
  THEME_LIMITS,
  type PrintFormat,
  type ThemeKind,
  type ThemeManifest,
  type ThemePackage,
  type ThemeSettingField,
} from "@/modules/theme-engine/types";
import { resolveSettings, settingFields } from "@/modules/theme-engine/settings";

/** Virtual path for the manifest inside the studio file tree (it is not part of `files`). */
export const MANIFEST_PATH = "manifest.json";
export const MENU_TEMPLATE = "templates/menu.liquid";
export const PRINT_TEMPLATE_PATH = "templates/print.liquid";
export const kindOfPackage = (pkg: Pick<ThemePackage, "manifest"> | null | undefined): ThemeKind => (pkg?.manifest?.kind === "print" ? "print" : "menu");
/** The required main template of a package kind (cannot be deleted / renamed in the file tree). */
export const mainTemplate = (kind: ThemeKind) => (kind === "print" ? PRINT_TEMPLATE_PATH : MENU_TEMPLATE);

export type FileKind = "liquid" | "css" | "js" | "json";

export function fileKind(path: string): FileKind {
  if (path.endsWith(".liquid")) return "liquid";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".js")) return "js";
  return "json";
}

export const isAllowedPath = (p: string) => THEME_FILE_PATTERNS.some((r) => r.test(p));

/** Kinds of files the user can add in the file tree → folder prefix + extension. */
export const NEW_FILE_KINDS = {
  partial: { prefix: "templates/partials/", ext: ".liquid" },
  css: { prefix: "assets/", ext: ".css" },
  js: { prefix: "assets/", ext: ".js" },
  locale: { prefix: "locales/", ext: ".json" },
} as const;
export type NewFileKind = keyof typeof NEW_FILE_KINDS;
/** File kinds offered in the "new file" dialog: print designs have no JavaScript. */
export const newFileKindsFor = (kind: ThemeKind): NewFileKind[] => (kind === "print" ? ["partial", "css", "locale"] : (Object.keys(NEW_FILE_KINDS) as NewFileKind[]));

/** Builds a package path from a user-entered name; returns null when the result is not allowed. */
export function pathFor(kind: NewFileKind, rawName: string): string | null {
  const { prefix, ext } = NEW_FILE_KINDS[kind];
  let name = rawName.trim().toLowerCase();
  if (name.endsWith(ext)) name = name.slice(0, -ext.length);
  name = name.replace(/\s+/g, "-");
  const p = kind === "js" ? (name === "theme" ? "assets/theme.js" : "") : `${prefix}${name}${ext}`;
  return p && isAllowedPath(p) ? p : null;
}

/** Initial content for new files. */
export function starterContent(path: string): string {
  if (path.endsWith(".liquid")) return `{% comment %} ${path.split("/").pop()} {% endcomment %}\n<div>\n</div>\n`;
  if (path.endsWith(".css")) return "/* */\n";
  if (path.endsWith(".js")) return "// Runs inside the sandboxed preview frame only.\n// window.VeroMenu.{openItem, addToCart, setLanguage, openCart, openInfo, track}\n";
  return "{\n}\n";
}

const ORDER = [/^templates\/(menu|print)\.liquid$/, /^templates\/partials\//, /^assets\/theme\.css$/, /^assets\/.*\.css$/, /^assets\/.*\.js$/, /^locales\//];
const rank = (p: string) => {
  const i = ORDER.findIndex((r) => r.test(p));
  return i === -1 ? ORDER.length : i;
};
export const sortPaths = (paths: string[]) => [...paths].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

export const packageBytes = (pkg: ThemePackage) =>
  Object.values(pkg.files).reduce((n, s) => n + new TextEncoder().encode(s).length, 0) + new TextEncoder().encode(JSON.stringify(pkg.manifest)).length;

export function samePackage(a: ThemePackage | null | undefined, b: ThemePackage | null | undefined) {
  if (!a || !b) return a === b;
  if (JSON.stringify(a.manifest) !== JSON.stringify(b.manifest)) return false;
  const ka = Object.keys(a.files);
  const kb = Object.keys(b.files);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a.files[k] === b.files[k]);
}

export const localizedText = (l: Record<string, string> | undefined, locale: string) => (l ? (l[locale] ?? l.de ?? l.en ?? Object.values(l)[0] ?? "") : "");

// ------------------------------------------------------------------ settings (customizer values)

export function settingsDefaults(manifest: Pick<ThemeManifest, "settings">): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of settingFields(manifest)) out[f.id] = f.default;
  return out;
}

/** Only known setting ids with valid values (unknown keys dropped, invalid values → default). */
export function sanitizeSettings(manifest: Pick<ThemeManifest, "settings">, raw: unknown): Record<string, unknown> {
  return resolveSettings(manifest, raw);
}

/** Media ids a package references with the given settings (image settings + named assets). */
export function mediaIdsFor(manifest: Pick<ThemeManifest, "settings" | "assets">, settings: Record<string, unknown>): string[] {
  const assets = manifest.assets && typeof manifest.assets === "object" && !Array.isArray(manifest.assets) ? manifest.assets : {};
  const ids = Object.values(assets).filter((v): v is string => typeof v === "string");
  for (const f of settingFields(manifest)) if (f.type === "image" && typeof settings[f.id] === "string") ids.push(settings[f.id] as string);
  return [...new Set(ids)].sort();
}

/** Writes the given values into the manifest as new defaults ("save as theme default"). */
export function withSettingsAsDefaults(manifest: ThemeManifest, values: Record<string, unknown>): ThemeManifest {
  const clean = sanitizeSettings(manifest, values);
  return { ...manifest, settings: settingFields(manifest).map((f) => ({ ...f, default: clean[f.id] }) as ThemeSettingField) };
}

// ------------------------------------------------------------------ import / blank

/** Parses a .vmtheme.json file. Throws an Error with a short machine-readable message on bad input. */
export function parseVmTheme(text: string): ThemePackage {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("invalidJson");
  }
  if (!raw || typeof raw !== "object") throw new Error("invalidFormat");
  const o = raw as Record<string, unknown>;
  if (o.format !== undefined && o.format !== "vmtheme") throw new Error("invalidFormat");
  if (!o.manifest || typeof o.manifest !== "object" || !o.files || typeof o.files !== "object") throw new Error("invalidFormat");
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.files as Record<string, unknown>)) {
    if (typeof v !== "string") throw new Error("invalidFormat");
    files[k] = v;
  }
  if (Object.keys(files).length > THEME_LIMITS.maxFiles) throw new Error("tooManyFiles");
  return { manifest: o.manifest as ThemeManifest, files };
}

export const exportFileName = (name: string) =>
  `${
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "theme"
  }.vmtheme.json`;

/** Minimal valid package for "Leer starten": a clean single-column menu with three customizer settings. */
export function blankPackage(name: string): ThemePackage {
  return {
    manifest: {
      apiVersion: THEME_API_VERSION,
      name,
      version: "1.0.0",
      description: { de: "Leeres Theme", en: "Blank theme", tr: "Boş tema" },
      fonts: ["inter"],
      settings: [
        { id: "accent_color", type: "color", label: { de: "Akzentfarbe", en: "Accent colour", tr: "Vurgu rengi" }, default: "#9a3412" },
        { id: "background_color", type: "color", label: { de: "Hintergrund", en: "Background", tr: "Arka plan" }, default: "#fafaf9" },
        { id: "body_font", type: "font", label: { de: "Schrift", en: "Font", tr: "Yazı tipi" }, default: "inter" },
        { id: "show_descriptions", type: "checkbox", label: { de: "Beschreibungen zeigen", en: "Show descriptions", tr: "Açıklamaları göster" }, default: true },
      ],
    },
    files: {
      [MENU_TEMPLATE]: `<div class="page">
  <header class="hero">
    {% if restaurant.logo_url %}<img class="logo" src="{{ restaurant.logo_url }}" alt="">{% endif %}
    <h1>{{ restaurant.name }}</h1>
    {% if table %}<p class="table">{{ table.label }}</p>{% endif %}
  </header>

  <main id="vm-main">
    {% for menu in menus %}
      {% for category in menu.categories %}
        <section class="category" id="c-{{ category.id }}">
          <h2>{{ category.name }}</h2>
          {% for item in category.items %}
            {% render 'item', item: item, settings: settings %}
          {% endfor %}
        </section>
      {% endfor %}
    {% endfor %}
  </main>
</div>
`,
      "templates/partials/item.liquid": `<article class="item{% unless item.available %} is-off{% endunless %}" data-vm-item="{{ item.id }}">
  <div class="item-text">
    <h3>{{ item.name }}</h3>
    {% if settings.show_descriptions and item.description %}<p>{{ item.description }}</p>{% endif %}
  </div>
  <span class="price">{{ item.price_formatted }}</span>
</article>
`,
      "assets/theme.css": `/* Customizer settings are available as CSS variables: --vm-<setting-id> (underscores → dashes). */
.page { background: var(--vm-background-color); color: #1c1917; min-height: 100vh; font-family: var(--vm-body-font); }
.hero { padding: 2.5rem 1.25rem 1.5rem; text-align: center; }
.logo { width: 72px; height: 72px; object-fit: contain; }
h1 { margin: .5rem 0 0; font-size: 1.75rem; }
.table { color: #78716c; font-size: .875rem; }
main { max-width: 42rem; margin: 0 auto; padding: 0 1.25rem 4rem; }
.category h2 { color: var(--vm-accent-color); font-size: 1.125rem; border-bottom: 1px solid #e7e5e4; padding-bottom: .5rem; margin-top: 2rem; }
.item { display: flex; justify-content: space-between; gap: 1rem; padding: .75rem 0; cursor: pointer; }
.item h3 { margin: 0; font-size: 1rem; }
.item p { margin: .25rem 0 0; color: #57534e; font-size: .875rem; }
.price { font-weight: 600; white-space: nowrap; }
.is-off { opacity: .5; }
`,
    },
  };
}

// ------------------------------------------------------------------ print designs

/** Owner-facing format names are translated in the UI; these are the physical facts shown next to them. */
export const PRINT_FORMAT_OPTIONS: PrintFormat[] = ["a6", "a6-landscape", "tent-a6", "a5", "a5-landscape", "a4", "a4-landscape"];

const L = (de: string, en: string, tr: string) => ({ de, en, tr });

/**
 * Minimal valid print design for "Leer starten": one clean card (table number, QR, headline, languages, Wi-Fi,
 * contact) – every optional element is a show_* setting. Works for every format (sizes from the engine's CSS vars).
 */
export function blankPrintPackage(name: string, format: PrintFormat = "a6"): ThemePackage {
  const small = format === "a6" || format === "a6-landscape" || format === "tent-a6";
  return {
    manifest: {
      apiVersion: THEME_API_VERSION,
      kind: "print",
      name,
      version: "1.0.0",
      description: { de: "Schlichte QR-Tischkarte", en: "Simple QR table card", tr: "Sade QR masa kartı" },
      print: { format, sheet: small || format === "a5" || format === "a5-landscape" ? (format === "tent-a6" ? "card" : "a4") : "card", safeMm: 5 },
      fonts: ["dm-serif-display", "inter"],
      settings: [
        { id: "color_background", type: "color", label: L("Papier", "Paper", "Kâğıt"), default: "#ffffff" },
        { id: "color_text", type: "color", label: L("Text", "Text", "Metin"), default: "#1c1917" },
        { id: "color_primary", type: "color", label: L("Akzent", "Accent", "Vurgu"), default: "#9a3412" },
        { id: "font_heading", type: "font", label: L("Schrift Tischnummer", "Table number font", "Masa numarası yazı tipi"), default: "dm-serif-display" },
        { id: "font_body", type: "font", label: L("Schrift Text", "Body font", "Metin yazı tipi"), default: "inter" },
        { id: "show_logo", type: "checkbox", label: L("Logo zeigen", "Show logo", "Logoyu göster"), default: true },
        { id: "show_table_number", type: "checkbox", label: L("Tischnummer zeigen", "Show table number", "Masa numarasını göster"), default: true },
        { id: "show_headline", type: "checkbox", label: L("Überschrift zeigen", "Show headline", "Başlığı göster"), default: true },
        { id: "headline", type: "text", label: L("Überschrift", "Headline", "Başlık"), default: "Speisekarte scannen", maxLength: 60 },
        { id: "show_languages", type: "checkbox", label: L("Sprachen zeigen", "Show languages", "Dilleri göster"), default: true },
        { id: "show_ordering_hint", type: "checkbox", label: L("Bestell-Hinweis zeigen", "Show ordering hint", "Sipariş notunu göster"), default: true },
        { id: "show_wifi", type: "checkbox", label: L("WLAN zeigen", "Show Wi-Fi", "Wi-Fi göster"), default: false },
        { id: "wifi_ssid", type: "text", label: L("WLAN-Name", "Wi-Fi name", "Wi-Fi adı"), default: "", maxLength: 40 },
        { id: "wifi_password", type: "text", label: L("WLAN-Passwort", "Wi-Fi password", "Wi-Fi şifresi"), default: "", maxLength: 40 },
        { id: "show_contact", type: "checkbox", label: L("Adresse & Telefon zeigen", "Show address & phone", "Adres ve telefonu göster"), default: false },
      ],
    },
    files: {
      [PRINT_TEMPLATE_PATH]: `<div class="card{% if table.is_generic %} is-generic{% endif %}">
  <header class="brand">
    {%- if settings.show_logo and restaurant.logo_url -%}<img class="logo" src="{{ restaurant.logo_url }}" alt="{{ restaurant.name }}">
    {%- else -%}<p class="name">{{ restaurant.name }}</p>{%- endif -%}
  </header>

  {%- if settings.show_table_number and table.is_generic == false -%}
  <div class="table">
    <span class="table-word">{{ 'tableWord' | t }}</span>
    <span class="table-number">{{ table.number }}</span>
    {%- if table.area -%}<span class="table-area">{{ table.area }}</span>{%- endif -%}
  </div>
  {%- endif -%}

  <div class="scan">
    <div class="qr">{{ table.qr_svg }}</div>
    {%- if settings.show_headline and settings.headline != blank -%}<p class="headline">{{ settings.headline }}</p>{%- endif -%}
    {%- if settings.show_ordering_hint and ordering.enabled -%}<p class="hint">{{ 'orderAtTable' | t }}</p>{%- endif -%}
  </div>

  <footer class="extras">
    {%- if settings.show_languages and languages.size > 1 -%}
    <p class="langs">{% for l in languages %}<span>{{ l.flag }} {{ l.name }}</span>{% unless forloop.last %} · {% endunless %}{% endfor %}</p>
    {%- endif -%}
    {%- if settings.show_wifi and settings.wifi_ssid != blank -%}
    <p class="wifi"><strong>{{ 'wifi' | t }}</strong> {{ settings.wifi_ssid }}{% if settings.wifi_password != blank %} · {{ 'wifiPassword' | t }} {{ settings.wifi_password }}{% endif %}</p>
    {%- endif -%}
    {%- if settings.show_contact -%}
    <p class="contact">{{ restaurant.address }}{% if restaurant.address and restaurant.phone %} · {% endif %}{{ restaurant.phone }}</p>
    {%- endif -%}
  </footer>
</div>
`,
      "assets/theme.css": `/* Card size comes from the engine (--vm-card-w/--vm-card-h); keep content inside var(--vm-safe). */
.card { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 3mm;
  padding: var(--vm-safe); background: var(--vm-color-background); color: var(--vm-color-text); font-family: var(--vm-font-body); text-align: center; }
.brand { min-height: 10mm; display: flex; align-items: center; }
.logo { max-height: 14mm; max-width: 50mm; object-fit: contain; }
.name { margin: 0; font-family: var(--vm-font-heading); font-size: 13pt; letter-spacing: .02em; text-wrap: balance; }
.table { display: flex; flex-direction: column; align-items: center; line-height: 1; }
.table-word { font-size: 8pt; letter-spacing: .2em; text-transform: uppercase; }
.table-number { font-family: var(--vm-font-heading); font-size: ${small ? "40pt" : "72pt"}; color: var(--vm-color-primary); font-variant-numeric: lining-nums tabular-nums; }
.table-area { margin-top: 1mm; font-size: 8pt; opacity: .8; }
.scan { display: flex; flex-direction: column; align-items: center; gap: 2mm; }
.qr { width: ${small ? "40mm" : "70mm"}; min-width: var(--vm-qr-min); aspect-ratio: 1; padding: 3mm; background: #ffffff; border: .3mm solid var(--vm-color-primary); }
.qr svg { display: block; width: 100%; height: 100%; }
.headline { margin: 0; font-size: ${small ? "11pt" : "18pt"}; font-weight: 600; text-wrap: balance; }
.hint { margin: 0; font-size: 8pt; color: var(--vm-color-primary); }
.extras { display: flex; flex-direction: column; gap: 1mm; font-size: 7pt; line-height: 1.35; }
.extras p { margin: 0; }
.is-generic .scan { flex: 1; justify-content: center; }
`,
    },
  };
}
