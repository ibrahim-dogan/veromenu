/**
 * Subscription plans. Prices in EUR cents per month (incl. VAT for B2C display; B2B invoices net + 19%).
 * Payment provider integration (Stripe / Mollie) plugs into modules/billing later – until then a
 * platform admin assigns plans manually in Admin → Restaurants.
 */
export type PlanFeature =
  | "ordering" // QR ordering + order board
  | "tables" // per-table QR codes
  | "ai_agent" // prompt / voice agent
  | "ai_images" // AI image generation
  | "ai_import" // menu import from photos / PDF
  | "custom_branding" // remove "Powered by VeroMenu"
  | "staff_roles" // custom roles
  | "theme_studio"; // custom code themes (Theme Studio) + AI theme generation

export type Plan = {
  id: "free" | "starter" | "pro";
  priceMonthlyCents: number;
  limits: {
    menus: number;
    items: number;
    /** Guest languages incl. the source language. */
    locales: number;
    tables: number;
    users: number;
    /** Monthly AI credits (see AI_CREDIT_COST). */
    aiCredits: number;
  };
  features: PlanFeature[];
};

export const PLANS: Plan[] = [
  {
    id: "free",
    priceMonthlyCents: 0,
    limits: { menus: 1, items: 60, locales: 2, tables: 0, users: 1, aiCredits: 30 },
    features: ["ai_import"],
  },
  {
    id: "starter",
    priceMonthlyCents: 1490,
    limits: { menus: 3, items: 300, locales: 6, tables: 40, users: 5, aiCredits: 400 },
    features: ["tables", "ai_import", "ai_images", "custom_branding", "theme_studio"],
  },
  {
    id: "pro",
    priceMonthlyCents: 3490,
    limits: { menus: 20, items: 2000, locales: 16, tables: 200, users: 30, aiCredits: 2500 },
    features: ["ordering", "tables", "ai_agent", "ai_images", "ai_import", "custom_branding", "staff_roles", "theme_studio"],
  },
];

/** Credits consumed per AI task call. */
export const AI_CREDIT_COST: Record<string, number> = {
  translate: 1,
  translate_review: 1,
  allergens: 1,
  menu_extract: 10,
  image_generate: 8,
  agent: 2,
  transcribe: 1,
  theme_analyze: 5,
  theme_generate: 20,
  theme_edit: 8, // chat edit of an existing theme (only changed files)
  theme_repair: 3, // automatic repair round after validation errors
};

export const getPlan = (id: string | null | undefined): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];
export const planHas = (planId: string, f: PlanFeature) => getPlan(planId).features.includes(f);
