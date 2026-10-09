/**
 * Demo restaurant "Gasthaus Zur Linde" (Hamburg) with a realistic German menu, drinks with size variants,
 * a few confirmed allergen declarations and 8 tables. Idempotent: does nothing if the slug exists.
 * Run: pnpm db:seed:demo   (no AI calls)
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/core/db";
import { menus, restaurants, tables, users } from "@/core/db/schema";
import type { RestaurantSettings } from "@/core/db/schema";
import { hashPassword } from "@/core/auth/password";
import { createRestaurant, DEFAULT_SETTINGS } from "@/modules/tenancy/service";
import { confirmAllergens, createCategory, createItem, createMenu } from "@/modules/menu/service";

const DEMO_EMAIL = "demo@veromenu.local";
const DEMO_PASSWORD = "Demo1234!";
const DEMO_SLUG = "zur-linde";

type DemoItem = {
  name: string;
  description?: string;
  ingredients?: string;
  price?: number | null;
  variants?: [string, number][];
  tags?: string[];
  /** confirmed declaration: [allergens, additives]; omitted = left "unknown" */
  allergens?: [string[], string[]];
};
type DemoCategory = { name: string; description?: string; items: DemoItem[] };

const FOOD: DemoCategory[] = [
  {
    name: "Vorspeisen",
    items: [
      {
        name: "Hamburger Krabbensuppe",
        description: "Cremige Suppe mit Nordseekrabben, Dill und einem Schuss Weißwein",
        ingredients: "Nordseekrabben, Sahne, Butter, Weizenmehl, Weißwein, Fischfond, Dill, Sellerie, Zwiebel",
        price: 8.9,
        allergens: [["crustaceans", "milk", "gluten", "sulphites", "celery", "fish"], []],
      },
      {
        name: "Labskaus-Häppchen",
        description: "Kleine Labskaus-Portion mit Rote Bete, Gewürzgurke und Rollmops",
        ingredients: "Corned Beef, Kartoffeln, Rote Bete, Gewürzgurke, Hering (Rollmops), Zwiebel, Senf",
        price: 9.5,
      },
      {
        name: "Gemischter Salat",
        description: "Blattsalate der Saison mit Gurke, Tomate, Radieschen und Hausdressing",
        ingredients: "Blattsalat, Gurke, Tomate, Radieschen, Rapsöl, Weißweinessig, Senf, Honig",
        price: 6.5,
        tags: ["vegetarian"],
        allergens: [["mustard", "sulphites"], []],
      },
      {
        name: "Ziegenkäse im Speckmantel",
        description: "Gratinierter Ziegenkäse mit Feigensenf und Walnüssen auf Rucola",
        ingredients: "Ziegenkäse, Bacon, Feigensenf, Walnüsse, Rucola, Balsamico",
        price: 10.9,
        tags: ["recommended"],
      },
      {
        name: "Tomatensuppe",
        description: "Mit Basilikum-Pesto und geröstetem Brot",
        ingredients: "Tomaten, Zwiebel, Knoblauch, Basilikum, Olivenöl, Pinienkerne, Parmesan, Weizenbrot",
        price: 6.9,
        tags: ["vegetarian"],
        allergens: [["gluten", "milk", "nuts"], []],
      },
    ],
  },
  {
    name: "Hauptgerichte",
    description: "Alle Hauptgerichte auch als kleine Portion – frag gern nach.",
    items: [
      {
        name: "Wiener Schnitzel",
        description: "Vom Kalb, in Butterschmalz gebraten, mit Bratkartoffeln und Preiselbeeren",
        ingredients: "Kalbfleisch, Weizenmehl, Ei, Paniermehl, Butterschmalz, Kartoffeln, Speck, Zwiebel, Preiselbeeren",
        price: 24.9,
        tags: ["recommended"],
        allergens: [["gluten", "eggs", "milk"], []],
      },
      {
        name: "Hamburger Pannfisch",
        description: "Gebratene Fischfilets auf Bratkartoffeln mit Senfsauce",
        ingredients: "Seelachs, Rotbarsch, Kartoffeln, Zwiebel, Senf, Sahne, Butter, Weizenmehl",
        price: 21.5,
        allergens: [["fish", "mustard", "milk", "gluten"], []],
      },
      {
        name: "Labskaus",
        description: "Der Hamburger Klassiker mit Spiegelei, Rollmops, Rote Bete und Gewürzgurke",
        ingredients: "Corned Beef, Kartoffeln, Rote Bete, Ei, Hering, Gewürzgurke, Zwiebel",
        price: 17.9,
      },
      {
        name: "Rinderroulade",
        description: "Nach Omas Rezept mit Rotkohl und Kartoffelklößen",
        ingredients: "Rindfleisch, Senf, Speck, Gewürzgurke, Zwiebel, Rotwein, Rotkohl, Kartoffeln, Weizenmehl, Sellerie",
        price: 23.5,
      },
      {
        name: "Käsespätzle",
        description: "Mit Bergkäse überbacken, dazu Röstzwiebeln und Salat",
        ingredients: "Weizenmehl, Eier, Bergkäse, Butter, Zwiebeln, Blattsalat",
        price: 15.9,
        tags: ["vegetarian"],
        allergens: [["gluten", "eggs", "milk"], []],
      },
      {
        name: "Gemüse-Curry",
        description: "Saisonales Gemüse in Kokos-Curry-Sauce mit Basmatireis",
        ingredients: "Kokosmilch, Paprika, Zucchini, Kichererbsen, Currypaste, Ingwer, Basmatireis, Erdnüsse",
        price: 16.5,
        tags: ["vegan", "spicy1"],
      },
      {
        name: "Currywurst",
        description: "Mit hausgemachter Currysauce und Pommes frites",
        ingredients: "Schweinebratwurst, Tomatenmark, Currypulver, Zucker, Kartoffeln, Pflanzenöl",
        price: 12.9,
        tags: ["spicy1"],
        allergens: [["mustard", "celery"], ["preservative", "phosphate", "antioxidant"]],
      },
      {
        name: "Tagesfisch",
        description: "Frisch vom Hamburger Fischmarkt – frag unser Team nach dem heutigen Fang",
        price: null,
      },
    ],
  },
  {
    name: "Desserts",
    items: [
      {
        name: "Rote Grütze",
        description: "Mit Vanillesauce",
        ingredients: "Rote Beeren, Zucker, Speisestärke, Milch, Sahne, Eigelb, Vanille",
        price: 7.5,
        tags: ["vegetarian"],
        allergens: [["milk", "eggs"], []],
      },
      {
        name: "Franzbrötchen-Pudding",
        description: "Warmer Brotpudding aus Hamburger Franzbrötchen mit Zimt-Eis",
        ingredients: "Franzbrötchen (Weizenmehl, Butter, Zucker, Zimt), Milch, Eier, Sahne",
        price: 8.5,
        tags: ["new"],
      },
      {
        name: "Apfelstrudel",
        description: "Hausgemacht, mit Vanilleeis und Sahne",
        ingredients: "Weizenmehl, Äpfel, Rosinen, Butter, Zucker, Zimt, Mandeln, Vanilleeis, Sahne",
        price: 7.9,
        tags: ["vegetarian"],
        allergens: [["gluten", "milk", "nuts", "eggs"], []],
      },
    ],
  },
];

const DRINKS: DemoCategory[] = [
  {
    name: "Softdrinks",
    items: [
      {
        name: "Fritz-Kola",
        variants: [["0,33 l", 3.9]],
        allergens: [[], ["caffeine", "colorant", "phosphate"]],
      },
      { name: "Apfelschorle", description: "Naturtrüb", variants: [["0,3 l", 3.5], ["0,5 l", 4.9]], tags: ["vegan"], allergens: [[], []] },
      { name: "Hausgemachte Zitronenlimonade", description: "Mit Minze", variants: [["0,3 l", 4.2], ["0,5 l", 5.8]], tags: ["vegan", "new"] },
      { name: "Mineralwasser", description: "Still oder sprudelnd", variants: [["0,25 l", 2.9], ["0,75 l", 6.5]], tags: ["vegan"], allergens: [[], []] },
    ],
  },
  {
    name: "Bier",
    items: [
      {
        name: "Pils vom Fass",
        description: "Hamburger Brauerei",
        variants: [["0,3 l", 3.9], ["0,5 l", 5.2]],
        tags: ["alcohol"],
        allergens: [["gluten"], []],
      },
      { name: "Hefeweizen", variants: [["0,5 l", 5.6]], tags: ["alcohol"], allergens: [["gluten"], []] },
      { name: "Alkoholfreies Pils", variants: [["0,33 l", 3.9]], allergens: [["gluten"], []] },
    ],
  },
  {
    name: "Wein",
    description: "Alle Weine auch als Flasche erhältlich.",
    items: [
      {
        name: "Grauburgunder, trocken",
        description: "Baden – frisch, mit Noten von Birne und Mandel",
        variants: [["0,1 l", 4.5], ["0,2 l", 8.5]],
        tags: ["alcohol"],
        allergens: [["sulphites"], []],
      },
      {
        name: "Spätburgunder, trocken",
        description: "Pfalz – samtig, mit Kirscharomen",
        variants: [["0,1 l", 4.9], ["0,2 l", 9.2]],
        tags: ["alcohol"],
        allergens: [["sulphites"], []],
      },
      { name: "Riesling-Schorle", variants: [["0,2 l", 4.5], ["0,4 l", 7.9]], tags: ["alcohol"] },
    ],
  },
  {
    name: "Heißgetränke",
    items: [
      { name: "Kaffee", description: "Aus fair gehandelten Bohnen", price: 2.9, allergens: [[], ["caffeine"]] },
      { name: "Cappuccino", price: 3.6, tags: ["vegetarian"], allergens: [["milk"], ["caffeine"]] },
      { name: "Ostfriesentee", description: "Mit Kluntje und Sahne", price: 3.4 },
    ],
  },
];

const TABLES: { label: string; area: string; seats: number }[] = [
  ...Array.from({ length: 6 }, (_, i) => ({ label: `Tisch ${i + 1}`, area: "Innen", seats: i < 4 ? 4 : 6 })),
  { label: "Terrasse T1", area: "Terrasse", seats: 4 },
  { label: "Terrasse T2", area: "Terrasse", seats: 2 },
];

const euro = (n: number) => Math.round(n * 100);

async function fillMenu(restaurantId: string, menuId: string, cats: DemoCategory[], ownerId: string) {
  let count = 0;
  for (const c of cats) {
    const cat = await createCategory(restaurantId, { menuId, name: c.name, description: c.description ?? null });
    for (const it of c.items) {
      const item = await createItem(restaurantId, cat.id, {
        name: it.name,
        description: it.description ?? null,
        ingredients: it.ingredients ?? null,
        priceCents: it.variants?.length ? null : it.price == null ? null : euro(it.price),
        tags: it.tags ?? [],
        variants: it.variants?.map(([name, p]) => ({ name, priceCents: euro(p) })),
      });
      if (it.allergens) await confirmAllergens(restaurantId, item.id, { allergens: it.allergens[0], additives: it.allergens[1], userId: ownerId });
      count++;
    }
  }
  return count;
}

export async function seedDemo() {
  const [exists] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.slug, DEMO_SLUG)).limit(1);
  if (exists) {
    console.log(`• demo restaurant exists: /m/${DEMO_SLUG} (${exists.id})`);
    return exists.id;
  }

  let [owner] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (!owner) {
    [owner] = await db
      .insert(users)
      .values({ email: DEMO_EMAIL, name: "Anna Lindner", passwordHash: await hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date(), locale: "de" })
      .returning();
    console.log(`✔ demo user created: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  const r = await createRestaurant({ name: "Gasthaus Zur Linde", ownerUserId: owner.id, createdBy: owner.id, plan: "pro", uiLocale: "de" });
  const settings: RestaurantSettings = {
    ...DEFAULT_SETTINGS,
    address: { street: "Lindenallee 12", zip: "20259", city: "Hamburg", country: "DE" },
    phone: "+49 40 1234567",
    email: "hallo@zur-linde.example",
    website: "https://zur-linde.example",
    cuisine: "Norddeutsche Küche",
    legal: {
      companyName: "Gasthaus Zur Linde GmbH",
      representative: "Anna Lindner (Geschäftsführerin)",
      registerCourt: "Amtsgericht Hamburg",
      registerNumber: "HRB 123456",
      vatId: "DE123456789",
    },
    openingHours: [
      ...[2, 3, 4, 5].map((day) => ({ day, open: "11:30", close: "22:00" })),
      { day: 6, open: "11:30", close: "23:00" },
      { day: 0, open: "11:00", close: "21:00" },
    ],
    menuMode: "digital",
    ordering: { enabled: true, acceptMode: "manual", requireTable: true, allowNotes: true },
    translations: { guestsSeeOnlyApproved: false, autoApproveThreshold: 4.5 },
  };
  await db
    .update(restaurants)
    .set({
      slug: DEMO_SLUG,
      enabledLocales: ["de", "en", "tr", "fr"],
      modules: ["ordering", "tables", "ai"],
      settings,
      updatedAt: new Date(),
    })
    .where(eq(restaurants.id, r.id));

  // createRestaurant already created an empty "Speisekarte"
  const [food] = await db.select().from(menus).where(eq(menus.restaurantId, r.id)).limit(1);
  const foodMenu = food ?? (await createMenu(r.id, { name: "Speisekarte" }));
  // direct write: fresh restaurant, no translations exist yet (avoids translation hooks in the seed)
  await db.update(menus).set({ description: "Norddeutsche Küche, frisch und saisonal" }).where(eq(menus.id, foodMenu.id));
  const drinks = await createMenu(r.id, { name: "Getränke" });

  const n1 = await fillMenu(r.id, foodMenu.id, FOOD, owner.id);
  const n2 = await fillMenu(r.id, drinks.id, DRINKS, owner.id);

  await db.insert(tables).values(TABLES.map((t, i) => ({ restaurantId: r.id, label: t.label, area: t.area, seats: t.seats, token: nanoid(12), sort: i })));

  console.log(`✔ demo restaurant "Gasthaus Zur Linde" → /m/${DEMO_SLUG} (${n1 + n2} items, ${TABLES.length} tables)`);
  return r.id;
}
