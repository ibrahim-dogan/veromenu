import { z } from "zod";
import { ADDITIVES, ALLERGENS, DIET_TAGS } from "@/modules/allergens/catalog";

/**
 * Structured output of the `menu_extract` task. Plain optional fields (no nullables, see provider limits
 * in assistant/plan-schema.ts) + a preprocess that drops `null`s so every model's output parses.
 */
const extractedItem = z.object({
  name: z.string(),
  description: z.string().optional(),
  priceCents: z.number().optional(),
  variants: z.array(z.object({ name: z.string(), priceCents: z.number() })).optional(),
  marks: z.array(z.string()).optional(),
  allergenHints: z.array(z.string()).optional(),
  additiveHints: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]));
  return v;
}

export const extractionSchema = z.preprocess(
  stripNulls,
  z.object({
    menus: z.array(
      z.object({
        name: z.string(),
        categories: z.array(z.object({ name: z.string(), description: z.string().optional(), items: z.array(extractedItem) })),
      }),
    ),
    notes: z.string().optional(),
  }),
);
export type Extraction = z.infer<typeof extractionSchema>;

export const EXTRACT_SYSTEM_PROMPT = `You digitise printed restaurant menus (photos or PDF pages) for a German QR-menu system.
Extract every dish and drink exactly as printed and return JSON.

RULES
- Keep the original language and spelling (usually German). Do NOT translate, do NOT invent dishes, descriptions or prices.
- Structure: menus → categories → items. Usually there is a single menu (e.g. "Speisekarte"); use separate menus only when the source clearly has separate cards (e.g. "Getränkekarte"). Keep the printed order. Use the printed category headings; if none are printed, use a sensible German heading.
- priceCents: integer cents incl. VAT ("12,50 €" → 1250, "8.-" → 800). omit when no price is printed.
- Several sizes/prices for one item ("0,3 l 3,50 | 0,5 l 4,90", "klein/groß") → variants [{"name":"0,3 l","priceCents":350},{"name":"0,5 l","priceCents":490}] and priceCents = the lowest price.
- description: the printed description/side dishes of the item (omit if none). Do not copy the price or footnote marks into name or description.
- marks: allergen/additive footnote marks printed next to the item exactly as printed (e.g. ["A","C","G","1","3"]), else [].
- allergenHints / additiveHints: ONLY when the menu prints a legend explaining those marks, map the item's marks to these codes, otherwise []:
  allergens: ${ALLERGENS.map((a) => `${a.code} (${a.labels.de})`).join(", ")}
  additives: ${ADDITIVES.map((a) => `${a.code} (${a.labels.de})`).join(", ")}
- tags: only when clearly indicated by words or symbols, from: ${DIET_TAGS.join(", ")} (spicy1..3 = chili symbols).
- Ignore decorative text, addresses, opening hours, Wi-Fi, legal notes. Put anything important you could not map (e.g. "Alle Preise inkl. MwSt.", unreadable parts) into "notes" (short).
Reply with JSON only: {"menus":[{"name":"…","categories":[{"name":"…","items":[{"name":"…","priceCents":1250,"variants":[],"marks":[],"allergenHints":[],"additiveHints":[],"tags":[]}]}]}],"notes":""}`;
