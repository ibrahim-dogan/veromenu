/**
 * EU-14 allergens (LMIV / VO (EU) 1169/2011 Anhang II) with the letter codes commonly used in Germany,
 * and declarable additives (Zusatzstoffe, §9 ZZulV / LMIDV) with the usual numeric footnotes.
 *
 * Labels for guest languages: `labels[locale]`, falls back to English then German.
 * These texts are legally relevant – keep them reviewed by a human.
 */
export type CatalogEntry = { code: string; letter: string; icon: string; labels: Record<string, string> };

export const ALLERGENS: CatalogEntry[] = [
  { code: "gluten", letter: "A", icon: "🌾", labels: { de: "Glutenhaltiges Getreide", en: "Cereals containing gluten", tr: "Glüten içeren tahıllar" } },
  { code: "crustaceans", letter: "B", icon: "🦐", labels: { de: "Krebstiere", en: "Crustaceans", tr: "Kabuklu deniz hayvanları" } },
  { code: "eggs", letter: "C", icon: "🥚", labels: { de: "Eier", en: "Eggs", tr: "Yumurta" } },
  { code: "fish", letter: "D", icon: "🐟", labels: { de: "Fisch", en: "Fish", tr: "Balık" } },
  { code: "peanuts", letter: "E", icon: "🥜", labels: { de: "Erdnüsse", en: "Peanuts", tr: "Yer fıstığı" } },
  { code: "soy", letter: "F", icon: "🫘", labels: { de: "Soja", en: "Soybeans", tr: "Soya" } },
  { code: "milk", letter: "G", icon: "🥛", labels: { de: "Milch (inkl. Laktose)", en: "Milk (incl. lactose)", tr: "Süt (laktoz dahil)" } },
  { code: "nuts", letter: "H", icon: "🌰", labels: { de: "Schalenfrüchte (Nüsse)", en: "Tree nuts", tr: "Sert kabuklu yemişler" } },
  { code: "celery", letter: "L", icon: "🥬", labels: { de: "Sellerie", en: "Celery", tr: "Kereviz" } },
  { code: "mustard", letter: "M", icon: "🟡", labels: { de: "Senf", en: "Mustard", tr: "Hardal" } },
  { code: "sesame", letter: "N", icon: "⚪", labels: { de: "Sesamsamen", en: "Sesame seeds", tr: "Susam" } },
  { code: "sulphites", letter: "O", icon: "🍷", labels: { de: "Schwefeldioxid und Sulfite", en: "Sulphur dioxide and sulphites", tr: "Kükürt dioksit ve sülfitler" } },
  { code: "lupin", letter: "P", icon: "🌼", labels: { de: "Lupinen", en: "Lupin", tr: "Acı bakla (lupin)" } },
  { code: "molluscs", letter: "R", icon: "🦪", labels: { de: "Weichtiere", en: "Molluscs", tr: "Yumuşakçalar" } },
];

export const ADDITIVES: CatalogEntry[] = [
  { code: "colorant", letter: "1", icon: "", labels: { de: "mit Farbstoff", en: "with colouring", tr: "renklendirici içerir" } },
  { code: "preservative", letter: "2", icon: "", labels: { de: "mit Konservierungsstoff", en: "with preservative", tr: "koruyucu içerir" } },
  { code: "antioxidant", letter: "3", icon: "", labels: { de: "mit Antioxidationsmittel", en: "with antioxidant", tr: "antioksidan içerir" } },
  { code: "flavour_enhancer", letter: "4", icon: "", labels: { de: "mit Geschmacksverstärker", en: "with flavour enhancer", tr: "lezzet artırıcı içerir" } },
  { code: "sulphured", letter: "5", icon: "", labels: { de: "geschwefelt", en: "sulphured", tr: "kükürtlenmiş" } },
  { code: "blackened", letter: "6", icon: "", labels: { de: "geschwärzt", en: "blackened", tr: "karartılmış" } },
  { code: "waxed", letter: "7", icon: "", labels: { de: "gewachst", en: "waxed", tr: "mumlanmış" } },
  { code: "phosphate", letter: "8", icon: "", labels: { de: "mit Phosphat", en: "with phosphate", tr: "fosfat içerir" } },
  { code: "sweetener", letter: "9", icon: "", labels: { de: "mit Süßungsmittel(n)", en: "with sweetener(s)", tr: "tatlandırıcı içerir" } },
  { code: "phenylalanine", letter: "10", icon: "", labels: { de: "enthält eine Phenylalaninquelle", en: "contains a source of phenylalanine", tr: "fenilalanin kaynağı içerir" } },
  { code: "caffeine", letter: "11", icon: "", labels: { de: "koffeinhaltig", en: "contains caffeine", tr: "kafein içerir" } },
  { code: "quinine", letter: "12", icon: "", labels: { de: "chininhaltig", en: "contains quinine", tr: "kinin içerir" } },
  { code: "azo_dye", letter: "13", icon: "", labels: { de: "mit Azofarbstoff – kann Aktivität und Aufmerksamkeit bei Kindern beeinträchtigen", en: "with azo dye – may have an adverse effect on activity and attention in children", tr: "azo boya içerir – çocuklarda aktivite ve dikkat üzerinde olumsuz etkisi olabilir" } },
  { code: "laxative", letter: "14", icon: "", labels: { de: "kann bei übermäßigem Verzehr abführend wirken", en: "excessive consumption may produce laxative effects", tr: "aşırı tüketimi müshil etkisi yapabilir" } },
];

export const DIET_TAGS = ["vegan", "vegetarian", "halal", "gluten_free", "lactose_free", "spicy1", "spicy2", "spicy3", "new", "recommended", "alcohol"] as const;

export const ALLERGEN_CODES = ALLERGENS.map((a) => a.code);
export const ADDITIVE_CODES = ADDITIVES.map((a) => a.code);

export function catalogLabel(entry: CatalogEntry, locale: string) {
  return entry.labels[locale] ?? entry.labels.en ?? entry.labels.de;
}
