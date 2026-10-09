/**
 * Demo guest-menu CONTENT for the landing-page phone mockup.
 * This is sample menu data (as a restaurant would enter it, plus its translations) – it intentionally shows
 * the same dishes in several guest languages regardless of the UI locale, so it lives here instead of in
 * the message catalogs. UI chrome around the mockup is translated via the "landing" namespace.
 */
export type DemoLang = "de" | "en" | "tr" | "fr";

export const DEMO_LANGS: { code: DemoLang; flag: string; intl: string }[] = [
  { code: "de", flag: "🇩🇪", intl: "de-DE" },
  { code: "en", flag: "🇬🇧", intl: "en-GB" },
  { code: "tr", flag: "🇹🇷", intl: "tr-TR" },
  { code: "fr", flag: "🇫🇷", intl: "fr-FR" },
];

type L = Record<DemoLang, string>;

export const DEMO_CHROME: Record<"table" | "allergens" | "vegan" | "order" | "staff", L> & { tabs: L[] } = {
  table: { de: "Tisch 7", en: "Table 7", tr: "Masa 7", fr: "Table 7" },
  allergens: { de: "Allergene", en: "Allergens", tr: "Alerjenler", fr: "Allergènes" },
  vegan: { de: "vegan", en: "vegan", tr: "vegan", fr: "végan" },
  order: { de: "Bestellung ansehen", en: "View order", tr: "Siparişi gör", fr: "Voir la commande" },
  staff: { de: "Allergene: A Gluten · C Eier · G Milch · L Sellerie", en: "Allergens: A gluten · C eggs · G milk · L celery", tr: "Alerjenler: A glüten · C yumurta · G süt · L kereviz", fr: "Allergènes : A gluten · C œufs · G lait · L céleri" },
  tabs: [
    { de: "Beliebt", en: "Popular", tr: "Popüler", fr: "Populaires" },
    { de: "Hauptgerichte", en: "Mains", tr: "Ana yemekler", fr: "Plats" },
    { de: "Desserts", en: "Desserts", tr: "Tatlılar", fr: "Desserts" },
  ],
};

export const DEMO_ITEMS: { name: L; desc: L; cents: number; allergens: string[]; vegan?: boolean; hue: string }[] = [
  {
    name: { de: "Flammkuchen Elsässer Art", en: "Alsatian tarte flambée", tr: "Alsace usulü Flammkuchen", fr: "Tarte flambée alsacienne" },
    desc: {
      de: "Crème fraîche, Speck, rote Zwiebeln",
      en: "Crème fraîche, bacon, red onions",
      tr: "Krem fraîche, domuz pastırması, kırmızı soğan",
      fr: "Crème fraîche, lardons, oignons rouges",
    },
    cents: 1150,
    allergens: ["A", "G"],
    hue: "from-amber-200 to-orange-300",
  },
  {
    name: {
      de: "Schweinebraten mit Kartoffelknödeln",
      en: "Roast pork with potato dumplings",
      tr: "Patates köfteli domuz rosto",
      fr: "Rôti de porc et knödels de pommes de terre",
    },
    desc: {
      de: "Dunkelbiersoße, Apfelrotkohl",
      en: "Dark beer gravy, apple red cabbage",
      tr: "Siyah biralı sos, elmalı kırmızı lahana",
      fr: "Sauce à la bière brune, chou rouge aux pommes",
    },
    cents: 1790,
    allergens: ["A", "L"],
    hue: "from-amber-700 to-stone-700",
  },
  {
    name: { de: "Kürbissuppe", en: "Pumpkin soup", tr: "Balkabağı çorbası", fr: "Velouté de potiron" },
    desc: {
      de: "Ingwer, Kokosmilch, geröstete Kürbiskerne",
      en: "Ginger, coconut milk, roasted pumpkin seeds",
      tr: "Zencefil, hindistan cevizi sütü, kavrulmuş kabak çekirdeği",
      fr: "Gingembre, lait de coco, graines de courge grillées",
    },
    cents: 750,
    allergens: ["L"],
    vegan: true,
    hue: "from-orange-300 to-amber-500",
  },
  {
    name: { de: "Apfelstrudel", en: "Apple strudel", tr: "Elmalı strudel", fr: "Strudel aux pommes" },
    desc: { de: "Mit Vanillesoße", en: "With vanilla custard", tr: "Vanilya soslu", fr: "Avec crème anglaise" },
    cents: 690,
    allergens: ["A", "C", "G"],
    hue: "from-yellow-200 to-amber-400",
  },
];

/** Translation-review example shown in the "quality" section (German source → English → back-translation). */
export const DEMO_REVIEW = {
  source: "Schweinebraten mit Kartoffelknödeln und Apfelrotkohl",
  target: "Roast pork with potato dumplings and apple red cabbage",
  back: "Schweinebraten mit Kartoffelknödeln und Apfelrotkohl",
  score: 4.8,
};
