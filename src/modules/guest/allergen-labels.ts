import { ADDITIVES, ALLERGENS, type CatalogEntry } from "@/modules/allergens/catalog";

/**
 * Allergen / additive labels for the guest languages not covered by the catalog (de/en/tr live in
 * modules/allergens/catalog.ts, owned by the allergens module). Merged at runtime by `guestCatalogLabel`.
 * Order = catalog order (ALLERGEN_ORDER / ADDITIVE_ORDER). Legally relevant (LMIV) – keep reviewed.
 */
const ALLERGEN_ORDER = ["gluten", "crustaceans", "eggs", "fish", "peanuts", "soy", "milk", "nuts", "celery", "mustard", "sesame", "sulphites", "lupin", "molluscs"];
const ADDITIVE_ORDER = ["colorant", "preservative", "antioxidant", "flavour_enhancer", "sulphured", "blackened", "waxed", "phosphate", "sweetener", "phenylalanine", "caffeine", "quinine", "azo_dye", "laxative"];

const ALLERGEN_LABELS: Record<string, string[]> = {
  fr: ["Céréales contenant du gluten", "Crustacés", "Œufs", "Poissons", "Arachides", "Soja", "Lait (y compris lactose)", "Fruits à coque", "Céleri", "Moutarde", "Graines de sésame", "Anhydride sulfureux et sulfites", "Lupin", "Mollusques"],
  it: ["Cereali contenenti glutine", "Crostacei", "Uova", "Pesce", "Arachidi", "Soia", "Latte (incl. lattosio)", "Frutta a guscio", "Sedano", "Senape", "Semi di sesamo", "Anidride solforosa e solfiti", "Lupini", "Molluschi"],
  es: ["Cereales que contienen gluten", "Crustáceos", "Huevos", "Pescado", "Cacahuetes", "Soja", "Leche (incl. lactosa)", "Frutos de cáscara", "Apio", "Mostaza", "Granos de sésamo", "Dióxido de azufre y sulfitos", "Altramuces", "Moluscos"],
  nl: ["Glutenbevattende granen", "Schaaldieren", "Eieren", "Vis", "Pinda's", "Soja", "Melk (incl. lactose)", "Noten", "Selderij", "Mosterd", "Sesamzaad", "Zwaveldioxide en sulfieten", "Lupine", "Weekdieren"],
  pl: ["Zboża zawierające gluten", "Skorupiaki", "Jaja", "Ryby", "Orzeszki ziemne", "Soja", "Mleko (w tym laktoza)", "Orzechy", "Seler", "Gorczyca", "Nasiona sezamu", "Dwutlenek siarki i siarczyny", "Łubin", "Mięczaki"],
  ru: ["Злаки, содержащие глютен", "Ракообразные", "Яйца", "Рыба", "Арахис", "Соя", "Молоко (включая лактозу)", "Орехи", "Сельдерей", "Горчица", "Кунжут", "Диоксид серы и сульфиты", "Люпин", "Моллюски"],
  uk: ["Злаки, що містять глютен", "Ракоподібні", "Яйця", "Риба", "Арахіс", "Соя", "Молоко (включно з лактозою)", "Горіхи", "Селера", "Гірчиця", "Кунжут", "Діоксид сірки та сульфіти", "Люпин", "Молюски"],
  ar: ["الحبوب المحتوية على الغلوتين", "القشريات", "البيض", "السمك", "الفول السوداني", "الصويا", "الحليب (بما في ذلك اللاكتوز)", "المكسرات", "الكرفس", "الخردل", "بذور السمسم", "ثاني أكسيد الكبريت والكبريتيت", "الترمس", "الرخويات"],
  zh: ["含麸质谷物", "甲壳类", "蛋类", "鱼类", "花生", "大豆", "乳及乳制品（含乳糖）", "坚果", "芹菜", "芥末", "芝麻", "二氧化硫和亚硫酸盐", "羽扇豆", "软体动物"],
  ja: ["グルテンを含む穀物", "甲殻類", "卵", "魚", "落花生（ピーナッツ）", "大豆", "乳（乳糖を含む）", "ナッツ類", "セロリ", "マスタード", "ごま", "二酸化硫黄および亜硫酸塩", "ルピナス", "軟体動物"],
  pt: ["Cereais que contêm glúten", "Crustáceos", "Ovos", "Peixe", "Amendoins", "Soja", "Leite (incl. lactose)", "Frutos de casca rija", "Aipo", "Mostarda", "Sementes de sésamo", "Dióxido de enxofre e sulfitos", "Tremoço", "Moluscos"],
  el: ["Δημητριακά που περιέχουν γλουτένη", "Οστρακοειδή", "Αυγά", "Ψάρια", "Αραχίδες (φιστίκια)", "Σόγια", "Γάλα (συμπ. λακτόζης)", "Ξηροί καρποί", "Σέλινο", "Μουστάρδα", "Σουσάμι", "Διοξείδιο του θείου και θειώδη", "Λούπινο", "Μαλάκια"],
  da: ["Glutenholdige kornprodukter", "Krebsdyr", "Æg", "Fisk", "Jordnødder", "Soja", "Mælk (inkl. laktose)", "Nødder", "Selleri", "Sennep", "Sesamfrø", "Svovldioxid og sulfitter", "Lupin", "Bløddyr"],
};

const ADDITIVE_LABELS: Record<string, string[]> = {
  fr: ["avec colorant", "avec conservateur", "avec antioxydant", "avec exhausteur de goût", "soufré", "noirci", "ciré", "avec phosphate", "avec édulcorant(s)", "contient une source de phénylalanine", "contient de la caféine", "contient de la quinine", "avec colorant azoïque – peut avoir des effets indésirables sur l'activité et l'attention chez les enfants", "une consommation excessive peut avoir des effets laxatifs"],
  it: ["con colorante", "con conservante", "con antiossidante", "con esaltatore di sapidità", "solforato", "annerito", "cerato", "con fosfato", "con edulcorante/i", "contiene una fonte di fenilalanina", "contiene caffeina", "contiene chinino", "con colorante azoico – può influire negativamente sull'attività e sull'attenzione dei bambini", "un consumo eccessivo può avere effetti lassativi"],
  es: ["con colorante", "con conservante", "con antioxidante", "con potenciador del sabor", "sulfurado", "ennegrecido", "encerado", "con fosfato", "con edulcorante(s)", "contiene una fuente de fenilalanina", "contiene cafeína", "contiene quinina", "con colorante azoico – puede tener efectos negativos sobre la actividad y la atención de los niños", "un consumo excesivo puede producir efectos laxantes"],
  nl: ["met kleurstof", "met conserveermiddel", "met antioxidant", "met smaakversterker", "gezwaveld", "gezwart", "gewaxt", "met fosfaat", "met zoetstof(fen)", "bevat een bron van fenylalanine", "bevat cafeïne", "bevat kinine", "met azokleurstof – kan de activiteit en de aandacht van kinderen nadelig beïnvloeden", "overmatig gebruik kan een laxerend effect hebben"],
  pl: ["z barwnikiem", "z konserwantem", "z przeciwutleniaczem", "ze wzmacniaczem smaku", "siarkowane", "czernione", "woskowane", "z fosforanem", "ze słodzikiem/słodzikami", "zawiera źródło fenyloalaniny", "zawiera kofeinę", "zawiera chininę", "z barwnikiem azowym – może mieć szkodliwy wpływ na aktywność i skupienie uwagi u dzieci", "spożycie w nadmiernych ilościach może mieć efekt przeczyszczający"],
  ru: ["с красителем", "с консервантом", "с антиоксидантом", "с усилителем вкуса", "сульфитированный", "зачернённый", "вощёный", "с фосфатом", "с подсластителем(-ями)", "содержит источник фенилаланина", "содержит кофеин", "содержит хинин", "с азокрасителем – может отрицательно влиять на активность и внимание детей", "при чрезмерном употреблении может оказывать слабительное действие"],
  uk: ["з барвником", "з консервантом", "з антиоксидантом", "з підсилювачем смаку", "сульфітований", "зачорнений", "вощений", "з фосфатом", "з підсолоджувачем(-ами)", "містить джерело фенілаланіну", "містить кофеїн", "містить хінін", "з азобарвником – може негативно впливати на активність і увагу дітей", "надмірне вживання може мати проносну дію"],
  ar: ["يحتوي على ملوّن", "يحتوي على مادة حافظة", "يحتوي على مضاد أكسدة", "يحتوي على محسّن نكهة", "مُكبرَت", "مُسوَّد", "مُشمَّع", "يحتوي على فوسفات", "يحتوي على مُحلٍّ صناعي", "يحتوي على مصدر للفينيل ألانين", "يحتوي على الكافيين", "يحتوي على الكينين", "يحتوي على صبغة آزو – قد تؤثر سلبًا على نشاط الأطفال وانتباههم", "الإفراط في تناوله قد يسبب تأثيرًا مُليّنًا"],
  zh: ["含色素", "含防腐剂", "含抗氧化剂", "含增味剂", "经硫处理", "经发黑处理", "经打蜡处理", "含磷酸盐", "含甜味剂", "含苯丙氨酸来源", "含咖啡因", "含奎宁", "含偶氮色素——可能对儿童的活动和注意力产生不良影响", "过量食用可能有轻泻作用"],
  ja: ["着色料使用", "保存料使用", "酸化防止剤使用", "調味料（うま味）使用", "亜硫酸処理", "黒色処理", "ワックス処理", "リン酸塩使用", "甘味料使用", "フェニルアラニン源を含む", "カフェイン含有", "キニーネ含有", "アゾ色素使用 – 子どもの活動や注意力に悪影響を及ぼす可能性があります", "過剰摂取により緩下作用を起こすことがあります"],
  pt: ["com corante", "com conservante", "com antioxidante", "com intensificador de sabor", "sulfurado", "enegrecido", "encerado", "com fosfato", "com edulcorante(s)", "contém uma fonte de fenilalanina", "contém cafeína", "contém quinino", "com corante azoico – pode afetar negativamente a atividade e a atenção das crianças", "o consumo excessivo pode ter efeitos laxativos"],
  el: ["με χρωστική", "με συντηρητικό", "με αντιοξειδωτικό", "με ενισχυτικό γεύσης", "θειωμένο", "μαυρισμένο", "κερωμένο", "με φωσφορικά άλατα", "με γλυκαντική ύλη/-ες", "περιέχει πηγή φαινυλαλανίνης", "περιέχει καφεΐνη", "περιέχει κινίνη", "με αζωχρωστική – μπορεί να επηρεάσει αρνητικά τη δραστηριότητα και την προσοχή των παιδιών", "η υπερβολική κατανάλωση μπορεί να έχει καθαρτική δράση"],
  da: ["med farvestof", "med konserveringsmiddel", "med antioxidant", "med smagsforstærker", "svovlet", "sortfarvet", "vokset", "med fosfat", "med sødestof(fer)", "indeholder en kilde til phenylalanin", "indeholder koffein", "indeholder kinin", "med azofarvestof – kan have negativ indvirkning på børns aktivitet og opmærksomhed", "overdreven indtagelse kan virke afførende"],
};

function extra(entry: CatalogEntry, locale: string): string | undefined {
  const isAllergen = ALLERGENS.includes(entry);
  const order = isAllergen ? ALLERGEN_ORDER : ADDITIVE_ORDER;
  const table = isAllergen ? ALLERGEN_LABELS : ADDITIVE_LABELS;
  const i = order.indexOf(entry.code);
  return i >= 0 ? table[locale]?.[i] : undefined;
}

/** Catalog label in the guest language: catalog → extra labels → English → German. */
export function guestCatalogLabel(entry: CatalogEntry, locale: string): string {
  return entry.labels[locale] ?? extra(entry, locale) ?? entry.labels.en ?? entry.labels.de ?? entry.code;
}

export const ALLERGEN_BY_CODE = new Map(ALLERGENS.map((a) => [a.code, a]));
export const ADDITIVE_BY_CODE = new Map(ADDITIVES.map((a) => [a.code, a]));
