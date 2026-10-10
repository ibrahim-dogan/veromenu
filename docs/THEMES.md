# VeroMenu Studio Themes – author guide (API v1)

A studio theme renders the guest menu. It is a **package of text files**, rendered with **Liquid** (liquidjs) into an HTML document that runs in a **sandboxed iframe** (`sandbox="allow-scripts"`, opaque origin, strict CSP). Theme code can never reach the platform: no network, no cookies/storage, no parent access, no navigation. Cart, item details, checkout, language and legal info are platform UI reached through `data-vm-*` hooks.

## Package layout

| Path | Purpose |
|---|---|
| `manifest.json` | metadata, settings, fonts (stored as `pkg.manifest`) |
| `templates/menu.liquid` | **required** – renders the BODY content (no `<html>/<head>/<body>`) |
| `templates/partials/<name>.liquid` | `{% render 'name', item: item %}` (names: `a-z 0-9 _ -`) |
| `assets/theme.css`, `assets/<name>.css` | inlined in `<head>` (theme.css first) |
| `assets/theme.js` | optional, inlined after the platform bridge |
| `locales/<xx>.json` | theme strings for `{{ 'key' \| t }}` |

Limits: 40 files, 200 KB per file, 800 KB per package, 2 MB output, render ≤ 1.5 s.

## manifest.json

```json
{ "apiVersion": 1, "name": "My Theme", "version": "1.0.0", "author": "…",
  "description": { "de": "…", "en": "…" },
  "fonts": ["caveat"],
  "controls": { "languageSwitcher": "host", "cartButton": "host" },
  "settings": [ … ] }
```

- `fonts`: ids from the self-hosted library (the `@font-face` CSS is injected automatically; fonts of `font` settings too). Available: abril-fatface, amatic-sc, bebas-neue, caveat, cormorant-garamond, dm-sans, dm-serif-display, eb-garamond, fraunces, inter, josefin-sans, libre-baskerville, lobster, lora, merriweather, montserrat, nunito, oswald, pacifico, playfair-display, poppins, raleway, righteous, space-grotesk, work-sans. Never load fonts from Google or any CDN.
- `controls`: `"host"` (default) = the platform renders the language switcher / floating cart bar; `"theme"` = your template renders them via `data-vm-lang` / `data-vm-cart`.
- `assets`: optional `{ "paper": "<media id>" }` → `{{ 'paper' | asset_url }}`.

### Settings (customizer)
Every field: `id` (`^[a-z][a-z0-9_]{0,39}$`, unique), `type`, `label` (`{ "de": "…", "en": "…" }`), `default`.

| type | extra | value |
|---|---|---|
| `color` | – | `#rrggbb` |
| `font` | – | font id |
| `select` | `options: [{ value, label }]` | option value (`a-z0-9_-`) |
| `checkbox` | – | boolean |
| `range` | `min, max, step, unit?` | number |
| `text` | `maxLength?` (≤ 500) | string |
| `image` | default `null` | media id → `{{ settings.x \| image_url }}` |

Values are available as `settings.<id>` in Liquid **and in CSS**: color/font/range/checkbox become `--vm-<id with - instead of _>` on `:root` (font → full font stack, range → value+unit, checkbox → 1/0); select/checkbox also become `<html data-setting-<id>="value">`.
```css
h1 { color: var(--vm-color-primary); font-family: var(--vm-heading-font); }
[data-setting-density="compact"] .item { padding-block: .5rem; }
```
Well-known ids `color_background`, `color_surface`, `color_text`, `color_primary`, `color_accent` also color the platform overlays (cart, item sheet, info) – use them.

## Data model (Liquid globals, also visible inside partials)

```
restaurant: { name, slug, cuisine, logo_url, cover_url, address, phone,
              opening_hours: [{ day (1=Mon…7/0=Sun), day_name, open "11:30", close }] }
locale: "de"        dir: "ltr" | "rtl"        mode: "live" | "preview"     currency: "EUR"
languages: [{ code, name, flag, active }]
table: { label } | null                       ordering: { enabled }
menus: [{ id, name, description, active_now,
  categories: [{ id, name, description, image_url,
    items: [{ id, name, description,
      price (cents|null), price_formatted ("8,90 €" or "" → price on request / variants only),
      image_url (small), image_url_large, image_is_ai, tags ["vegan","spicy2",…],
      allergens_confirmed, allergens: [{ code, letter "A", label }], additives: [{ code, letter "2", label }],
      available (false = sold out), orderable,
      variants: [{ id, name, price, price_formatted }] }] }] }]
legend: { allergens: [{ code, letter, label }], additives: [...] }
has_unconfirmed_allergens   show_branding   settings
```
Tags: vegan, vegetarian, halal, gluten_free, lactose_free, spicy1–3, new, recommended, alcohol → label `{{ 'tags.' | append: tag | t }}`.

## Output & filters

`{{ }}` output is **HTML-escaped automatically**; use `| raw` only for trusted markup. Standard Liquid tags/filters work (`for`, `if`, `unless`, `case`, `assign`, `capture`, `render`, `size`, `append`, `default`, `upcase`, `date` …). Not supported: `{% layout %}`, dynamic partial names. Unknown filters are ignored (and reported).

| filter | example | result |
|---|---|---|
| `money` | `{{ item.price \| money }}` | `8,90 €` (guest locale) |
| `t` | `{{ 'soldOut' \| t }}`, `{{ 'table' \| t: label: table.label }}` | theme locale → platform guest strings → key |
| `image_url` | `{{ item.image_url \| image_url: 'large' }}` | absolute URL (`small`/`large`/`original`; media ids from image settings) |
| `asset_url` | `{{ 'paper' \| asset_url }}` | URL of a manifest asset |
| `font_family` | `{{ settings.heading_font \| font_family }}` | `'Playfair Display', ui-serif, …` |
| `json` | `<script>var d = {{ menus \| json }};</script>` | safe JSON |
| `contrast_color` | `{{ settings.color_primary \| contrast_color }}` | `#111111` or `#ffffff` |

Platform strings (all 16 guest languages): `soldOut, priceOnRequest, from, allergens, additives, allergenUnknown, allergenNotice, allergenLegend, pricesInclVat, pricesInclVatGeneric, openingHours, closed, table, imprint, privacy, poweredBy, aiImage, quickAdd, viewCart, categories, language, skipToMenu, notAvailableNow, info, menu, close`. Theme `locales/de.json` etc. may add or override keys (`{ "chefTip": "Tipp vom Chef" }`).

## Hooks (`data-vm-*`) and JavaScript

Work without any JS – the platform bridge handles clicks and Enter/Space:

| attribute | action |
|---|---|
| `data-vm-item="{{ item.id }}"` | opens the item sheet (details, allergens, variants, add) |
| `data-vm-add="{{ item.id }}"` (+ `data-vm-variant="{{ v.id }}"`) | adds to the cart (items with variants open the sheet unless a variant is given) |
| `data-vm-lang="{{ l.code }}"` | switches language |
| `data-vm-cart` | opens the cart; `data-vm-cart-count` / `data-vm-cart-total` elements get live text |
| `data-vm-info` | opens legal info (imprint, allergens, prices) |
| `data-vm-ai-label` | marks your own AI-image label |

Put hooks on `<button type="button">`. `<html data-cart-count="N">` updates live (`html[data-cart-count="0"] .cartbar{display:none}`). After a successful add, the element gets `data-vm-added` for ~1 s.

`assets/theme.js` runs inside the sandbox after the bridge: `window.VeroMenu.{openItem(id), addToCart(id, variantId?, qty?), setLanguage(code), openCart(), openInfo(), track('item_view'|'category_view', id), getCart(), onCart(fn)}`, plus `VeroMenu.mode`/`locale`; `window` also fires a `vm:cart` event. Not available: fetch/XHR/WebSocket, cookies, localStorage, alert, popups, forms, parent window. Links other than `#anchors` are blocked.

## Layout rules

- Mobile-first (320–430 px), no horizontal scroll; use logical CSS (`margin-inline`, `padding-inline-start`, `inset-inline-end`, `text-align: start`) so RTL (Arabic) works.
- Keep the **top-end corner free**: host controls (ⓘ, language) sit there; its width is `var(--vm-host-top-end)` → e.g. `padding-inline-end: calc(var(--vm-host-top-end) + .5rem)` on header rows and sticky navs.
- With `cartButton: "host"` the platform cart bar covers the bottom while the cart is not empty (a spacer is added automatically).
- Semantic HTML (`header, nav, main, section, h1–h4, ul`), visible `:focus-visible`, contrast ≥ 4.5:1, `prefers-reduced-motion`.
- Category navigation: `<a href="#c-{{ category.id }}">` + `id="c-{{ category.id }}"` on sections, `scroll-margin-top` for sticky headers.

## Security model (enforced, not optional)

Sandbox `allow-scripts` only + CSP `default-src 'none'; img-src <app>/media/ data: blob:; font-src <app>/theme-fonts/ data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'`. External URLs never load. Rejected at validation: `<base>`, `<meta http-equiv>`, `<iframe>/<object>/<embed>`, `<script src>`, `<link rel=stylesheet>`, `</style>` in CSS, `</script>` in JS. Messages to the platform are validated (ids must exist, rate limited).

## Legal requirements (Germany)

1. Show allergen letters only when `item.allergens_confirmed`; otherwise show `{{ 'allergenUnknown' | t }}`. Never claim "free of …".
2. Render the legend (`legend.allergens` + `legend.additives`) and `{{ 'pricesInclVat' | t }}` (EUR) near the end; `{{ 'allergenNotice' | t }}` when `has_unconfirmed_allergens`.
3. AI images: when `item.image_is_ai`, show `{{ 'aiImage' | t }}` on the image with `data-vm-ai-label` (the platform injects a label if missing).
4. Mark sold-out items (`available == false`) and never offer them for ordering (`orderable`).
5. The platform always shows the ⓘ button (imprint, privacy). A `data-vm-info` link in the footer is recommended.

## Checklist
- [ ] `menu.liquid` renders every menu/category/item, prices, variants, sold-out, tags
- [ ] `data-vm-item` on every item, `data-vm-add` when `item.orderable`
- [ ] allergen rules 1–3 above, legend, VAT note
- [ ] settings used via `--vm-*` variables; defaults look good
- [ ] RTL-safe, mobile-first, host corner free, focus styles
- [ ] no external URLs, no `fetch`, fonts only from `manifest.fonts`/font settings

## Minimal complete example

`manifest.json`
```json
{ "apiVersion": 1, "name": "Minimal", "version": "1.0.0", "fonts": [],
  "settings": [
    { "id": "color_background", "type": "color", "label": { "de": "Hintergrund", "en": "Background" }, "default": "#ffffff" },
    { "id": "color_text", "type": "color", "label": { "de": "Text", "en": "Text" }, "default": "#1c1917" },
    { "id": "color_primary", "type": "color", "label": { "de": "Akzent", "en": "Accent" }, "default": "#9a3412" },
    { "id": "heading_font", "type": "font", "label": { "de": "Überschriften", "en": "Headings" }, "default": "playfair-display" }
  ] }
```
`templates/menu.liquid`
```liquid
<header class="top"><h1>{{ restaurant.name }}</h1></header>
<main>
{%- for menu in menus -%}{%- for category in menu.categories -%}
  <section id="c-{{ category.id }}"><h2>{{ category.name }}</h2>
    <ul>{%- for item in category.items -%}{% render 'item', item: item %}{%- endfor -%}</ul>
  </section>
{%- endfor -%}{%- endfor -%}
</main>
<footer>
  <p>{{ 'pricesInclVat' | t }}</p>
  {%- if has_unconfirmed_allergens -%}<p>{{ 'allergenNotice' | t }}</p>{%- endif -%}
  <dl>{%- for a in legend.allergens -%}<dt>{{ a.letter }}</dt><dd>{{ a.label }}</dd>{%- endfor -%}
      {%- for a in legend.additives -%}<dt>{{ a.letter }}</dt><dd>{{ a.label }}</dd>{%- endfor -%}</dl>
  <button type="button" data-vm-info>{{ 'imprint' | t }}</button>
</footer>
```
`templates/partials/item.liquid`
```liquid
<li class="item{% unless item.available %} soldout{% endunless %}">
  {%- if item.image_url -%}<figure><img src="{{ item.image_url }}" alt="" loading="lazy">
    {%- if item.image_is_ai -%}<figcaption data-vm-ai-label>{{ 'aiImage' | t }}</figcaption>{%- endif -%}</figure>{%- endif -%}
  <button type="button" data-vm-item="{{ item.id }}">{{ item.name }}</button>
  {%- if item.allergens_confirmed -%}<sup>{% for a in item.allergens %}{{ a.letter }}{% endfor %}{% for a in item.additives %}{{ a.letter }}{% endfor %}</sup>
  {%- else -%}<small>{{ 'allergenUnknown' | t }}</small>{%- endif -%}
  {%- if item.variants.size > 0 -%}{% for v in item.variants %}<span>{{ v.name }} {{ v.price_formatted }}</span>{% endfor %}
  {%- elsif item.price -%}<span>{{ item.price_formatted }}</span>{%- else -%}<span>{{ 'priceOnRequest' | t }}</span>{%- endif -%}
  {%- unless item.available -%}<strong>{{ 'soldOut' | t }}</strong>{%- endunless -%}
  {%- if item.orderable -%}<button type="button" data-vm-add="{{ item.id }}" aria-label="{{ 'quickAdd' | t: name: item.name }}">+</button>{%- endif -%}
</li>
```
`assets/theme.css`
```css
body { margin: 0; background: var(--vm-color-background); color: var(--vm-color-text); font: 16px/1.5 system-ui, sans-serif; }
.top { padding: 1rem; padding-inline-end: calc(var(--vm-host-top-end) + .5rem); }
h1, h2 { font-family: var(--vm-heading-font); color: var(--vm-color-primary); }
main, footer { padding-inline: 1rem; }
ul { list-style: none; padding: 0; }
.item { display: flex; flex-wrap: wrap; gap: .5rem; align-items: baseline; padding-block: .75rem; border-block-end: 1px solid #0001; }
.item figure { position: relative; margin: 0; width: 72px; } .item img { width: 72px; height: 72px; object-fit: cover; }
.item figcaption { position: absolute; inset-inline: 0; bottom: 0; font-size: 10px; background: #000a; color: #fff; }
.soldout { opacity: .55; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
:focus-visible { outline: 2px solid var(--vm-color-primary); outline-offset: 2px; }
```
