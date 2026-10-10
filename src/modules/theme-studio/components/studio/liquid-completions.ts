/** Autocomplete for the ThemeView data model + VeroMenu filters inside Liquid templates. */
import type { LiquidCompletionConfig } from "@codemirror/lang-liquid";

const v = (label: string, detail?: string) => ({ label, type: "variable", detail });
const p = (label: string, detail?: string) => ({ label, type: "property", detail });

const ITEM = [
  p("id"),
  p("name"),
  p("description"),
  p("price", "cents"),
  p("price_formatted", "8,90 €"),
  p("image_url"),
  p("image_url_large"),
  p("image_is_ai"),
  p("tags"),
  p("allergens_confirmed"),
  p("allergens"),
  p("additives"),
  p("available"),
  p("orderable"),
  p("variants"),
];
const CATEGORY = [p("id"), p("name"), p("description"), p("image_url"), p("items")];
const MENU = [p("id"), p("name"), p("description"), p("categories"), p("active_now")];
const RESTAURANT = [p("name"), p("slug"), p("cuisine"), p("logo_url"), p("cover_url"), p("address"), p("phone"), p("opening_hours")];
const LABEL = [p("code"), p("letter"), p("label")];

const PROPS: Record<string, ReturnType<typeof p>[]> = {
  restaurant: RESTAURANT,
  menu: MENU,
  category: CATEGORY,
  item: ITEM,
  variant: [p("id"), p("name"), p("price"), p("price_formatted")],
  allergen: LABEL,
  additive: LABEL,
  table: [p("label")],
  ordering: [p("enabled")],
  language: [p("code"), p("name"), p("flag"), p("active")],
  legend: [p("allergens"), p("additives")],
  hours: [p("day"), p("day_name"), p("open"), p("close")],
};

export const liquidCompletions: LiquidCompletionConfig = {
  variables: [
    v("restaurant"),
    v("menus"),
    v("languages"),
    v("locale"),
    v("dir"),
    v("table"),
    v("ordering"),
    v("settings", "customizer values"),
    v("mode", "live | preview"),
    v("currency"),
    v("legend"),
    v("has_unconfirmed_allergens"),
    v("show_branding"),
  ],
  filters: [
    { label: "money", type: "function", detail: "cents → 8,90 €" },
    { label: "t", type: "function", detail: "'key' | t" },
    { label: "image_url", type: "function", detail: "media id | image_url: 'md'" },
    { label: "asset_url", type: "function", detail: "'name' | asset_url" },
    { label: "font_family", type: "function", detail: "font id → CSS stack" },
    { label: "json", type: "function" },
    { label: "contrast_color", type: "function", detail: "#hex → #111 / #fff" },
  ],
  properties: (path) => {
    const last = path[path.length - 1];
    if (!last) return [];
    if (PROPS[last]) return PROPS[last];
    // loop variables: {% for item in category.items %} → common names
    if (/item|dish/.test(last)) return ITEM;
    if (/categor/.test(last)) return CATEGORY;
    if (/menu/.test(last)) return MENU;
    if (/allergen|additive|label/.test(last)) return LABEL;
    return [];
  },
};
