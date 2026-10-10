/**
 * Realistic German sample menu (isomorphic) – studio previews without real data and AI validation.
 * Covers: variants, sold-out item, price on request, AI image, confirmed + unconfirmed allergens,
 * additives, tags, two menus (one scheduled), table + ordering.
 */
import { ADDITIVES, ALLERGENS } from "@/modules/allergens/catalog";
import type { ThemeLabel, ThemeView } from "./types";
import { makeMoney } from "./liquid";
import { weekdayName } from "./view";

const money = makeMoney("de", "EUR");

/** Small inline SVG placeholder "photo" (data: URLs are allowed by the frame CSP). */
function photo(emoji: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><radialGradient id="g" cx="35%" cy="30%" r="90%"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></radialGradient></defs><rect width="400" height="300" fill="url(#g)"/><circle cx="200" cy="160" r="96" fill="#fff" fill-opacity=".18"/><text x="200" y="196" font-size="112" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const A = (code: string): ThemeLabel => {
  const e = ALLERGENS.find((x) => x.code === code)!;
  return { code: e.code, letter: e.letter, label: e.labels.de };
};
const Z = (code: string): ThemeLabel => {
  const e = ADDITIVES.find((x) => x.code === code)!;
  return { code: e.code, letter: e.letter, label: e.labels.de };
};

type SampleItem = ThemeView["menus"][number]["categories"][number]["items"][number];
let n = 0;
function item(p: Partial<SampleItem> & { name: string }): SampleItem {
  n++;
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const variants = (p.variants ?? []).map((v, i) => ({ ...v, id: `${id.slice(0, -2)}${String(50 + i)}`, price_formatted: money(v.price) }));
  const price = p.price === undefined ? null : p.price;
  return {
    id,
    description: null,
    image_url: null,
    image_url_large: null,
    image_is_ai: false,
    tags: [],
    allergens_confirmed: true,
    allergens: [],
    additives: [],
    available: true,
    orderable: (p.available ?? true) && (price != null || variants.length > 0),
    ...p,
    price,
    price_formatted: money(price),
    variants,
  };
}

export function sampleThemeView(): ThemeView {
  n = 0;
  const brezel = photo("🥨", "#f6d9a8", "#b8732f");
  const schnitzel = photo("🍖", "#f3c98b", "#9a5a22");
  const pizza = photo("🍕", "#ffd0a1", "#c2412d");
  const salad = photo("🥗", "#d9f2c4", "#4f8a3a");
  const cake = photo("🍰", "#fde2e4", "#c76b8a");
  const beer = photo("🍺", "#ffe9a8", "#d18b12");

  const menus: ThemeView["menus"] = [
    {
      id: "00000000-0000-4000-a000-000000000001",
      name: "Speisekarte",
      description: "Regional, saisonal und mit Liebe gekocht.",
      active_now: true,
      categories: [
        {
          id: "00000000-0000-4000-b000-000000000001",
          name: "Vorspeisen",
          description: "Zum Teilen oder für den kleinen Hunger",
          image_url: null,
          items: [
            item({
              name: "Obatzda mit Laugenbrezel",
              description: "Hausgemachter bayerischer Käseaufstrich mit roten Zwiebeln und Schnittlauch",
              price: 790,
              image_url: brezel,
              image_url_large: brezel,
              tags: ["vegetarian"],
              allergens: [A("gluten"), A("milk")],
            }),
            item({
              name: "Kürbiscremesuppe",
              description: "Hokkaido-Kürbis, Ingwer, Kürbiskernöl",
              price: 650,
              tags: ["vegan", "gluten_free", "new"],
              allergens: [A("celery")],
            }),
            item({
              name: "Bunter Marktsalat",
              description: "Blattsalate, Radieschen, Kirschtomaten, Senf-Honig-Dressing",
              price: 890,
              image_url: salad,
              image_url_large: salad,
              image_is_ai: true,
              tags: ["vegetarian"],
              allergens: [A("mustard")],
            }),
          ],
        },
        {
          id: "00000000-0000-4000-b000-000000000002",
          name: "Hauptgerichte",
          description: null,
          image_url: null,
          items: [
            item({
              name: "Wiener Schnitzel vom Kalb",
              description: "Mit Kartoffel-Gurken-Salat und Preiselbeeren",
              price: 2390,
              image_url: schnitzel,
              image_url_large: schnitzel,
              tags: ["recommended"],
              allergens: [A("gluten"), A("eggs"), A("milk")],
            }),
            item({
              name: "Käsespätzle",
              description: "Bergkäse, Röstzwiebeln, kleiner Salat",
              price: 1490,
              tags: ["vegetarian"],
              allergens: [A("gluten"), A("eggs"), A("milk")],
            }),
            item({
              name: "Rinderroulade nach Omas Rezept",
              description: "Rotkohl, Kartoffelklöße, Rotweinsoße",
              price: 2190,
              available: false,
              allergens: [A("celery"), A("mustard"), A("sulphites")],
            }),
            item({
              name: "Fisch des Tages",
              description: "Fragen Sie unser Team nach der heutigen Empfehlung",
              price: null,
              allergens_confirmed: false,
            }),
          ],
        },
        {
          id: "00000000-0000-4000-b000-000000000003",
          name: "Pizza aus dem Steinofen",
          description: "Teig 48 Stunden gereift",
          image_url: pizza,
          items: [
            item({
              name: "Pizza Margherita",
              description: "San-Marzano-Tomaten, Fior di Latte, Basilikum",
              price: null,
              image_url: pizza,
              image_url_large: pizza,
              tags: ["vegetarian"],
              allergens: [A("gluten"), A("milk")],
              variants: [
                { id: "", name: "Ø 26 cm", price: 990, price_formatted: "" },
                { id: "", name: "Ø 32 cm", price: 1290, price_formatted: "" },
              ],
            }),
            item({
              name: "Pizza Diavola",
              description: "Scharfe Salami, Chili, Mozzarella",
              price: null,
              tags: ["spicy2"],
              allergens: [A("gluten"), A("milk")],
              additives: [Z("preservative"), Z("antioxidant")],
              variants: [
                { id: "", name: "Ø 26 cm", price: 1190, price_formatted: "" },
                { id: "", name: "Ø 32 cm", price: 1490, price_formatted: "" },
              ],
            }),
          ],
        },
        {
          id: "00000000-0000-4000-b000-000000000004",
          name: "Desserts",
          description: null,
          image_url: null,
          items: [
            item({
              name: "Apfelstrudel",
              description: "Mit Vanillesoße und Sahne",
              price: 750,
              image_url: cake,
              image_url_large: cake,
              allergens: [A("gluten"), A("eggs"), A("milk"), A("nuts")],
            }),
            item({ name: "Hausgemachtes Sorbet", description: "Tagesauswahl, eine Kugel", price: 290, tags: ["vegan"], allergens_confirmed: false }),
          ],
        },
        {
          id: "00000000-0000-4000-b000-000000000005",
          name: "Getränke",
          description: null,
          image_url: null,
          items: [
            item({
              name: "Helles vom Fass",
              description: "Augustiner Lagerbier Hell",
              price: null,
              image_url: beer,
              image_url_large: beer,
              tags: ["alcohol"],
              allergens: [A("gluten")],
              variants: [
                { id: "", name: "0,3 l", price: 390, price_formatted: "" },
                { id: "", name: "0,5 l", price: 520, price_formatted: "" },
              ],
            }),
            item({
              name: "Cola",
              description: "0,33 l Flasche",
              price: 350,
              additives: [Z("colorant"), Z("caffeine")],
            }),
            item({ name: "Apfelschorle", description: "0,4 l", price: 420, tags: ["vegan"] }),
          ],
        },
      ],
    },
    {
      id: "00000000-0000-4000-a000-000000000002",
      name: "Mittagstisch",
      description: "Mo–Fr 11:30–14:30",
      active_now: false,
      categories: [
        {
          id: "00000000-0000-4000-b000-000000000006",
          name: "Tagesgerichte",
          description: "Inklusive Tagessuppe",
          image_url: null,
          items: [item({ name: "Gemüsecurry mit Basmatireis", description: "Kokosmilch, Koriander", price: 1150, tags: ["vegan", "spicy1"], allergens: [] })],
        },
      ],
    },
  ];

  const used = new Map<string, ThemeLabel>();
  const usedAdd = new Map<string, ThemeLabel>();
  for (const m of menus)
    for (const c of m.categories)
      for (const i of c.items) {
        i.allergens.forEach((a) => used.set(a.code, a));
        i.additives.forEach((a) => usedAdd.set(a.code, a));
      }

  const hours = [1, 2, 3, 4, 5].map((day) => ({ day, open: "11:30", close: "22:00" })).concat([{ day: 6, open: "12:00", close: "23:00" }, { day: 0, open: "12:00", close: "21:00" }]);

  return {
    restaurant: {
      name: "Gasthaus Zur Linde",
      slug: "zur-linde",
      cuisine: "Bayerisch · Saisonal",
      logo_url: photo("🌳", "#e8f0dc", "#5b7c3a"),
      cover_url: photo("🍽️", "#f4e3c8", "#8a5a2b"),
      address: "Lindenstraße 12, 80331 München",
      phone: "+49 89 1234567",
      opening_hours: hours.map((h) => ({ ...h, day_name: weekdayName(h.day, "de") })),
    },
    locale: "de",
    dir: "ltr",
    languages: [
      { code: "de", name: "Deutsch", flag: "🇩🇪", active: true },
      { code: "en", name: "English", flag: "🇬🇧", active: false },
      { code: "tr", name: "Türkçe", flag: "🇹🇷", active: false },
    ],
    table: { label: "12" },
    ordering: { enabled: true },
    menus,
    settings: {},
    mode: "preview",
    currency: "EUR",
    legend: {
      allergens: ALLERGENS.filter((a) => used.has(a.code)).map((a) => used.get(a.code)!),
      additives: ADDITIVES.filter((a) => usedAdd.has(a.code)).map((a) => usedAdd.get(a.code)!),
    },
    has_unconfirmed_allergens: true,
    show_branding: false,
  };
}
