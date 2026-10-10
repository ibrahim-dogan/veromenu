/**
 * Isomorphic helpers for theme packages used by the Theme Studio UI and its server actions.
 * No server-only imports – runs in the browser (editor, customizer) and on the server (actions).
 */
import { THEME_API_VERSION, THEME_FILE_PATTERNS, THEME_LIMITS, type ThemeManifest, type ThemePackage, type ThemeSettingField } from "@/modules/theme-engine/types";
import { resolveSettings, settingFields } from "@/modules/theme-engine/settings";

/** Virtual path for the manifest inside the studio file tree (it is not part of `files`). */
export const MANIFEST_PATH = "manifest.json";
export const MENU_TEMPLATE = "templates/menu.liquid";

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

const ORDER = [/^templates\/menu\.liquid$/, /^templates\/partials\//, /^assets\/theme\.css$/, /^assets\/.*\.css$/, /^assets\/.*\.js$/, /^locales\//];
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
