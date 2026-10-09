/**
 * Deterministic safety net for AI allergen detection: well-known ingredient words per EU-14 allergen
 * (German first, plus common English/Turkish menu words). If a keyword appears in the dish text but the AI
 * says "not detected", the allergen is raised to "may_contain" and the item goes to human review.
 * Patterns are matched case-insensitively against name + description + ingredients + category.
 * Keep false negatives low; false positives only cost a review click.
 */
const W = "a-zäöüßçğışéèàâ"; // letters considered part of a word

/** Whole word (also as end of a compound for German nouns like "Spiegelei"). */
const word = (w: string) => new RegExp(`(^|[^${W}])${w}($|[^${W}])`, "i");
const part = (w: string) => new RegExp(w, "i");

export const ALLERGEN_KEYWORDS: Record<string, RegExp[]> = {
  gluten: [
    part("weizen"), part("dinkel"), part("roggen"), part("gerste"), part("hafer"), part("grünkern"), part("kamut"),
    part("mehl"), part("panier"), part("panade"), part("panko"), part("semmel"), part("brot"), part("brötchen"),
    part("nudel"), part("pasta"), part("spaghetti"), part("tagliatelle"), part("penne"), part("lasagne"), part("ravioli"),
    part("gnocchi"), part("spätzle"), part("knödel"), part("couscous"), part("bulgur"), part("seitan"), part("teig"),
    part("crouton"), part("schnitzel"), part("pizza"), part("flammkuchen"), part("burger"), part("bier"), part("malz"),
    part("croissant"), part("kuchen"), part("torte"), part("waffel"), part("brezel"), part("pide"), part("lahmacun"),
    part("börek"), part("yufka"), part("simit"), part("dürüm"), part("wrap"), part("tortilla"), part("baguette"),
    part("ciabatta"), part("focaccia"), part("toast"), word("un"), part("ekmek"), part("bread"), part("flour"), part("wheat"),
  ],
  crustaceans: [
    part("garnele"), part("shrimp"), part("krabbe"), part("hummer"), part("languste"), part("scampi"), part("krebs"),
    part("gamba"), part("prawn"), part("lobster"), part("crab"), part("karides"), part("king ?prawn"),
  ],
  eggs: [
    word("eiern?"), part("eier"), part("eigelb"), part("eiweiß"), part("spiegelei"), part("rührei"), part("omelett"),
    part("mayo"), part("aioli"), part("remoulade"), part("hollandaise"), part("carbonara"), part("baiser"), part("frittata"),
    part("tiramisu"), word("egg"), part("eggs"), part("yumurta"), part("menemen"), part("eierteig"),
  ],
  fish: [
    part("fisch"), part("lachs"), part("thunfisch"), part("sardelle"), part("anchovi"), part("kabeljau"), part("forelle"),
    part("hering"), part("makrele"), part("dorade"), part("wolfsbarsch"), part("zander"), part("seelachs"), part("scholle"),
    part("matjes"), part("worcester"), part("sushi"), part("fish"), part("salmon"), part("tuna"), part("balık"), part("levrek"),
    part("çupra"), part("hamsi"), part("bacalhau"), part("vitello tonnato"),
  ],
  peanuts: [part("erdnuss"), part("erdnüss"), part("peanut"), part("satay"), part("yer fıstığı"), part("erdnuß")],
  soy: [part("soja"), part("tofu"), part("edamame"), part("miso"), part("tempeh"), part("teriyaki"), part("soy"), part("soya")],
  milk: [
    part("milch"), part("sahne"), part("butter"), part("käse"), part("joghurt"), part("jogurt"), part("quark"), part("rahm"),
    part("schmand"), part("mozzarella"), part("parmesan"), part("feta"), part("frischkäse"), part("mascarpone"),
    part("ricotta"), part("gratin"), part("überbacken"), part("béchamel"), part("bechamel"), part("laktose"), part("ghee"),
    part("halloumi"), part("cappuccino"), word("latte"), part("latte macchiato"), part("milchkaffee"), part("tzatziki"),
    part("cacık"), part("ayran"), part("labneh"), part("burrata"), part("gorgonzola"), part("pecorino"), part("cheese"),
    part("cream"), part("milk"), part("peynir"), part("süt"), part("yoğurt"), part("tereyağ"), part("kaymak"), word("eis"), part("speiseeis"), part("vanilleeis"), part("schokoeis"), part("eiscreme"), part("eisbecher"), part("milchshake"),
  ],
  nuts: [
    part("mandel"), part("haselnuss"), part("haselnüss"), part("walnuss"), part("walnüss"), part("cashew"), part("pistazie"),
    part("pekannuss"), part("paranuss"), part("macadamia"), word("nuss"), word("nüsse"), part("nuss"), part("pesto"),
    part("marzipan"), part("nougat"), part("praline"), part("baklava"), part("almond"), part("hazelnut"), part("walnut"),
    part("pistachio"), part("ceviz"), part("fındık"), part("badem"), part("antep fıstığı"), part("fıstık"),
  ],
  celery: [part("sellerie"), part("suppengrün"), part("brühe"), part("bouillon"), part("fond"), part("celery"), part("kereviz")],
  mustard: [part("senf"), part("mostrich"), part("dijon"), part("remoulade"), part("vinaigrette"), part("mustard"), part("hardal")],
  sesame: [part("sesam"), part("tahin"), part("hummus"), part("humus"), part("simit"), part("halva"), part("helva"), part("susam")],
  sulphites: [
    new RegExp(`(^|[^${W}]|rot|weiß|weiss|glüh)wein`, "i"), part("sekt"), part("prosecco"), part("essig"), part("balsamico"),
    part("rosine"), part("trockenfr"), part("wine"), part("şarap"), part("champagner"), part("aperol"),
  ],
  lupin: [part("lupine"), part("lupin")],
  molluscs: [
    part("muschel"), part("auster"), part("tintenfisch"), part("kalmar"), part("calamar"), part("oktopus"), part("octopus"),
    part("krake"), part("schnecke"), part("sepia"), part("pulpo"), part("mussel"), part("squid"), part("oyster"),
    part("midye"), part("kalamar"), part("ahtapot"), part("frutti di mare"), part("meeresfrüchte"),
  ],
};

/** Returns allergen code → first matching keyword found in the text. */
export function keywordHits(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [code, patterns] of Object.entries(ALLERGEN_KEYWORDS)) {
    for (const p of patterns) {
      const m = p.exec(text);
      if (m) {
        out[code] = (m[0] ?? "").replace(new RegExp(`^[^${W}]+|[^${W}]+$`, "gi"), "") || p.source;
        break;
      }
    }
  }
  return out;
}
