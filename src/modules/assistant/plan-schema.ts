import { z } from "zod";

/**
 * Structured output of the `agent` task. Ids are short refs from the menu snapshot (m1, c3, i12) –
 * the server maps them back to real ids and validates everything before anything is written.
 *
 * Provider limits (Anthropic structured outputs): ≤ 24 optional params and ≤ 16 union/nullable params
 * per schema, no `oneOf`. Hence: plain optional fields (no nullables), a flat bulk scope, `z.union`
 * (→ anyOf) and a top-level preprocess that drops `null`s so other models stay parseable.
 */
const variant = z.object({ name: z.string().max(80), priceCents: z.number() });
const text = (max: number) => z.string().max(max).optional();

export const itemChangesSchema = z.object({
  name: text(200),
  description: text(1000),
  ingredients: text(1000),
  priceCents: z.number().optional(),
  isAvailable: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  categoryId: z.string().optional(),
});

export const agentOpSchema = z.union([
  z.object({ op: z.literal("update_item"), itemId: z.string(), changes: itemChangesSchema }),
  z.object({
    op: z.literal("create_item"),
    categoryId: z.string().optional(),
    newCategoryRef: z.string().optional(),
    name: z.string().max(200),
    description: text(1000),
    ingredients: text(1000),
    priceCents: z.number().optional(),
    tags: z.array(z.string()).optional(),
    variants: z.array(variant).optional(),
  }),
  z.object({ op: z.literal("delete_item"), itemId: z.string() }),
  z.object({ op: z.literal("set_variants"), itemId: z.string(), variants: z.array(variant) }),
  z.object({ op: z.literal("create_category"), ref: z.string(), menuId: z.string(), name: z.string().max(200), description: text(1000) }),
  z.object({
    op: z.literal("update_category"),
    categoryId: z.string(),
    changes: z.object({ name: text(200), description: text(1000), isVisible: z.boolean().optional() }),
  }),
  z.object({ op: z.literal("delete_category"), categoryId: z.string() }),
  z.object({
    op: z.literal("bulk_price_change"),
    scope: z.enum(["all", "menus", "categories", "items"]),
    ids: z.array(z.string()),
    percent: z.number().optional(),
    amountCents: z.number().optional(),
    rounding: z.enum(["none", "0.10", "0.50", "0.90"]),
    includeVariants: z.boolean(),
  }),
]);

/** Recursively drops `null` values (models often send null for "unchanged"). */
function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]));
  return v;
}

export const agentPlanSchema = z.preprocess(
  stripNulls,
  z.object({
    summary: z.string().max(2000),
    clarifications: z.array(z.string().max(500)).max(10),
    operations: z.array(agentOpSchema).max(150),
  }),
);

export type AgentOp = z.infer<typeof agentOpSchema>;
export type AgentPlan = z.infer<typeof agentPlanSchema>;

export const AGENT_SYSTEM_PROMPT = (sourceLocale: string, tags: readonly string[]) => `You are the menu assistant of VeroMenu, a QR-menu system for restaurants in Germany.
The owner gives an instruction (German, English or Turkish – possibly a voice transcript with recognition errors). Turn it into precise operations on the menu provided by the user message.

MENU FORMAT: menus → categories → items. Every entity has a short "ref" (m1, c3, i12). Prices are integer cents incl. VAT ("price": 1250 = 12,50 €). "variants" are sizes/portions with their own price. "soldOut": true = temporarily unavailable, "hidden": true = not shown to guests.

OPERATIONS (use refs exactly as given, never invent refs):
- update_item {itemId, changes:{name?, description?, ingredients?, priceCents?, isAvailable?, isVisible?, tags?, categoryId?}} – include only fields that change. "heute aus / ausverkauft / sold out / bitti" → isAvailable:false; "wieder da / back" → isAvailable:true. Moving an item = categoryId.
- create_item {categoryId (existing ref) OR newCategoryRef (ref of a create_category op in this plan), name, description?, ingredients?, priceCents?, tags?, variants?}
- delete_item {itemId} – only when the owner clearly wants to remove the dish permanently (NOT for "sold out today").
- set_variants {itemId, variants:[{name, priceCents}]} – replaces ALL variants of that item.
- create_category {ref:"new1", menuId, name, description?}
- update_category {categoryId, changes:{name?, description?, isVisible?}}
- delete_category {categoryId} – also deletes all its items; only on explicit request.
- bulk_price_change {scope:"all"|"menus"|"categories"|"items", ids:[refs of that kind, [] for "all"], percent? (5 = +5 %, -10 = −10 %) OR amountCents? (50 = +0,50 €), rounding:"none"|"0.10"|"0.50"|"0.90" ("0.90" = prices end in ,90; "auf 10 Cent runden" = "0.10"), includeVariants (normally true)} – use this for every price change that affects several items or is relative; the server computes the exact prices.

RULES:
- If the instruction is ambiguous (unclear which item, several candidates, item not found, unclear amount) return NO operations and ask short questions in "clarifications" (in the owner's language). Do not guess.
- Match items by meaning; tolerate typos, transcription errors and inflected forms ("des Schnitzels" → "Wiener Schnitzel") when exactly one item fits.
- Texts (names, descriptions, ingredients) are written in the menu source language "${sourceLocale}" unless the owner dictates other wording. Never translate unless explicitly asked. Keep existing wording when not asked to change it.
- Allowed tags: ${tags.join(", ")}. "tags" replaces the whole list – include existing tags you want to keep.
- You can NOT set allergens or additives – a human must confirm them. If asked, say in the summary that allergens are confirmed under "Prüfungen". For new dishes put mentioned ingredients into "ingredients".
- Prices are integer cents incl. VAT, never negative. Omit fields that don't change; to clear a text field send "".
- "summary": 1–2 sentences in the owner's language describing what will change.
- Reply with JSON only: {"summary": string, "clarifications": string[], "operations": [{"op": "...", ...}]}`;
