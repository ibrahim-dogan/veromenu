import "server-only";
import { z } from "zod";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/core/db";
import { auditLog, categories, items, restaurants, reviewTasks, type AllergenStatus } from "@/core/db/schema";
import { aiJson, type AiContext } from "@/core/ai";
import { sha256 } from "@/core/crypto";
import { audit } from "@/core/audit";
import { AppError } from "@/core/http/errors";
import { localeInfo } from "@/core/i18n/locales";
import { confirmAllergens } from "@/modules/menu/service";
import { ADDITIVES, ADDITIVE_CODES, ALLERGENS, ALLERGEN_CODES } from "./catalog";
import { keywordHits } from "./keywords";

/**
 * AI allergen / additive detection (LMIV Annex II, ZZulV).
 * The AI only ever SUGGESTS. Item status becomes "ai_suggested" (clear case) or "needs_review" (ambiguous → review task).
 * "confirmed" is set exclusively by a human through confirmAllergens() in the menu service.
 * Every suggestion is stored in the audit log ("allergens.ai_suggest") for traceability.
 */

export const CONFIDENCE_MIN = 0.8;
export const ITEMS_PER_CALL = 5;

export type Verdict = "contains" | "may_contain" | "not_detected";
export type VerdictEntry = { code: string; status: Verdict; confidence: number; reason: string; keyword?: string };
export type AllergenSuggestion = {
  allergens: VerdictEntry[];
  additives: VerdictEntry[];
  questions: { question: string; allergens: string[] }[];
  status: Extract<AllergenStatus, "ai_suggested" | "needs_review">;
  /** Why the item needs review (codes: low_confidence, may_contain, questions, keyword, conflict). */
  reviewReasons: string[];
  model: string;
  inputHash: string;
  createdAt: string;
};

const entrySchema = z.object({
  code: z.string(),
  status: z.enum(["contains", "may_contain", "not_detected"]),
  confidence: z.number(),
  reason: z.string(),
});
const resultSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      allergens: z.array(entrySchema),
      additives: z.array(entrySchema),
      questions: z.array(z.object({ question: z.string(), allergens: z.array(z.string()) })),
    }),
  ),
});

type ItemRow = typeof items.$inferSelect;
type ItemWithCategory = ItemRow & { categoryName: string };

/** Hash of everything the detection looked at → a stored suggestion is "fresh" while this is unchanged. */
export const allergenInputHash = (it: Pick<ItemRow, "name" | "description" | "ingredients">, categoryName: string) =>
  sha256(JSON.stringify([it.name.trim(), (it.description ?? "").trim(), (it.ingredients ?? "").trim(), categoryName.trim()]));

function normaliseCode(raw: string, list: typeof ALLERGENS): string | null {
  const s = raw.trim().toLowerCase();
  const hit = list.find(
    (a) => a.code === s || a.letter.toLowerCase() === s || Object.values(a.labels).some((l) => l.toLowerCase() === s),
  );
  if (hit) return hit.code;
  const fuzzy = list.find((a) => s.includes(a.code) || a.code.includes(s));
  return fuzzy?.code ?? null;
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n > 1 ? n / 100 : n)) : 0);

const KEYWORD_REASON: Record<string, (kw: string) => string> = {
  de: (kw) => `Hinweis im Text: „${kw}“ – bitte prüfen.`,
  en: (kw) => `Text mentions "${kw}" – please check.`,
  tr: (kw) => `Metinde "${kw}" geçiyor – lütfen kontrol et.`,
};
const MISSING_REASON: Record<string, string> = {
  de: "Keine Aussage der KI – bitte prüfen.",
  en: "No statement from the AI – please check.",
  tr: "Yapay zekâdan bilgi yok – lütfen kontrol et.",
};

/** Turns raw model output into a complete, conservative suggestion. Exported for tests. */
export function normaliseSuggestion(
  raw: z.infer<typeof resultSchema>["items"][number] | undefined,
  item: ItemWithCategory,
  sourceLocale: string,
  model: string,
): AllergenSuggestion {
  const allergenMap = new Map<string, VerdictEntry>();
  for (const e of raw?.allergens ?? []) {
    const code = normaliseCode(e.code, ALLERGENS);
    if (!code || allergenMap.has(code)) continue;
    allergenMap.set(code, { code, status: e.status, confidence: clamp(e.confidence), reason: e.reason.trim() });
  }
  // Every allergen gets an explicit verdict; missing ones are treated as uncertain.
  for (const code of ALLERGEN_CODES)
    if (!allergenMap.has(code))
      allergenMap.set(code, { code, status: "not_detected", confidence: 0.5, reason: MISSING_REASON[sourceLocale] ?? MISSING_REASON.en });

  // Keyword safety net: AI says "not detected" although the text names a typical source → may_contain.
  const text = [item.name, item.description, item.ingredients, item.categoryName].filter(Boolean).join(" \n ");
  const hits = keywordHits(text);
  const reasons = new Set<string>();
  for (const [code, kw] of Object.entries(hits)) {
    const e = allergenMap.get(code)!;
    if (e.status === "not_detected") {
      allergenMap.set(code, {
        code,
        status: "may_contain",
        confidence: 0.5,
        reason: `${(KEYWORD_REASON[sourceLocale] ?? KEYWORD_REASON.en)(kw)}${e.reason ? ` (KI: ${e.reason})` : ""}`,
        keyword: kw,
      });
      reasons.add("keyword");
    }
  }

  const additives: VerdictEntry[] = [];
  for (const e of raw?.additives ?? []) {
    const code = normaliseCode(e.code, ADDITIVES);
    if (!code || additives.some((a) => a.code === code) || e.status === "not_detected") continue;
    additives.push({ code, status: e.status, confidence: clamp(e.confidence), reason: e.reason.trim() });
  }
  const questions = (raw?.questions ?? [])
    .filter((q) => q.question.trim())
    .slice(0, 8)
    .map((q) => ({ question: q.question.trim(), allergens: q.allergens.map((a) => normaliseCode(a, ALLERGENS)).filter((a): a is string => !!a) }));

  const allergens = ALLERGEN_CODES.map((c) => allergenMap.get(c)!);
  if (allergens.some((a) => a.confidence < CONFIDENCE_MIN) || additives.some((a) => a.confidence < CONFIDENCE_MIN)) reasons.add("low_confidence");
  if (allergens.some((a) => a.status === "may_contain") || additives.some((a) => a.status === "may_contain")) reasons.add("may_contain");
  if (questions.length) reasons.add("questions");
  if (!raw) reasons.add("low_confidence");

  return {
    allergens,
    additives,
    questions,
    status: reasons.size ? "needs_review" : "ai_suggested",
    reviewReasons: [...reasons],
    model,
    inputHash: allergenInputHash(item, item.categoryName),
    createdAt: new Date().toISOString(),
  };
}

async function loadItems(restaurantId: string, itemIds: string[]): Promise<ItemWithCategory[]> {
  if (!itemIds.length) return [];
  const rows = await db
    .select({ item: items, categoryName: categories.name })
    .from(items)
    .innerJoin(categories, eq(categories.id, items.categoryId))
    .where(and(eq(items.restaurantId, restaurantId), inArray(items.id, itemIds)));
  return rows.map((r) => ({ ...r.item, categoryName: r.categoryName }));
}

async function aiDetect(list: ItemWithCategory[], r: typeof restaurants.$inferSelect, ctx: AiContext) {
  const lang = localeInfo(r.defaultLocale)?.name ?? "German";
  const allergenList = ALLERGENS.map((a) => `${a.code} (${a.letter}: ${a.labels.de} / ${a.labels.en})`).join("; ");
  const additiveList = ADDITIVES.map((a) => `${a.code} (${a.letter}: ${a.labels.de})`).join("; ");
  const system = `You are a food-safety assistant helping restaurants in Germany label the 14 allergens of Regulation (EU) 1169/2011 (LMIV, Annex II) and declarable additives (Zusatzstoffe, ZZulV). Your output is only a SUGGESTION that a human will verify – be careful and conservative.

Allergen codes: ${allergenList}.
Additive codes: ${additiveList}.

For EACH dish return a verdict for ALL 14 allergen codes:
- "contains": explicitly mentioned, or an unavoidable component of the dish as named (e.g. Wiener Schnitzel → gluten + eggs from the breading; Pizza → gluten; Käsespätzle → gluten, eggs, milk).
- "may_contain": common in typical recipes but not certain for this restaurant (sauces, dressings, marinades, breading, stock/broth, dough, desserts, garnishes) – the chef must confirm.
- "not_detected": no plausible source.
confidence (0–1) = how sure you are about the verdict for THIS dish. Use ≥ 0.9 only when the text is explicit or the case is obvious; use < 0.8 whenever the recipe may vary.
Definitions: gluten = wheat, rye, barley, oats, spelt, kamut (incl. beer, malt); nuts = almond, hazelnut, walnut, cashew, pecan, Brazil nut, pistachio, macadamia (NOT peanuts, NOT coconut); milk includes lactose, butter, cream, cheese; celery includes celeriac and is common in stocks/broths; sulphites = wine, vinegar, dried fruit (>10 mg/kg); crustaceans (shrimp, crab, lobster) ≠ molluscs (mussels, squid, octopus, snails).
Additives: list only additives the dish plausibly contains (typical for soft drinks: caffeine, colorant, sweetener, phenylalanine for "light/zero"; cured meat/sausage: preservative, phosphate, antioxidant; tonic: quinine). Omit others.
questions: concrete questions (in ${lang}) the owner should ask the chef about hidden ingredients (sauce base, dressing, breading, frying oil shared with fish/crustaceans, stock, dough, toppings). Each lists the allergen codes it concerns. Empty list if nothing is unclear.
reason: one short sentence in ${lang}. Do NOT invent ingredients that are not mentioned or typical.`;
  const payload = {
    ...(r.settings.cuisine ? { cuisine: r.settings.cuisine } : {}),
    dishes: list.map((it, i) => ({
      id: `d${i + 1}`,
      category: it.categoryName,
      name: it.name,
      ...(it.description ? { description: it.description } : {}),
      ...(it.ingredients ? { ingredients: it.ingredients } : {}),
      ...(it.tags.length ? { tags: it.tags } : {}),
    })),
  };
  const { data, model } = await aiJson(
    "allergens",
    {
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Analyse these dishes. Output JSON {"items":[{"id","allergens":[{"code","status","confidence","reason"}],"additives":[…],"questions":[{"question","allergens"}]}]}.\n${JSON.stringify(payload)}`,
        },
      ],
      maxTokens: 4000 * list.length,
    },
    resultSchema,
    ctx,
    "allergen_suggestions",
  );
  const byId = new Map(data.items.map((x) => [x.id, x]));
  return { results: list.map((_, i) => byId.get(`d${i + 1}`)), model };
}

async function storeSuggestion(restaurantId: string, item: ItemWithCategory, s: AllergenSuggestion, userId: string | null) {
  await audit({
    restaurantId,
    userId,
    action: "allergens.ai_suggest",
    entityType: "item",
    entityId: item.id,
    data: { suggestion: s },
  });

  const contains = s.allergens.filter((a) => a.status === "contains").map((a) => a.code);
  let taskReason: string | null = null;
  if (item.allergenStatus === "confirmed") {
    // Never downgrade a human confirmation – but flag a contradiction for review.
    const missing = contains.filter((c) => !item.allergens.includes(c));
    if (missing.length) taskReason = `conflict:${missing.join(",")}`;
  } else {
    await db.update(items).set({ allergenStatus: s.status }).where(eq(items.id, item.id));
    if (s.status === "needs_review") taskReason = s.reviewReasons.join(",");
  }

  const [open] = await db
    .select({ id: reviewTasks.id })
    .from(reviewTasks)
    .where(and(eq(reviewTasks.restaurantId, restaurantId), eq(reviewTasks.kind, "allergen"), eq(reviewTasks.entityId, item.id), eq(reviewTasks.status, "open")))
    .limit(1);
  if (taskReason) {
    const payload = { suggestion: s, itemName: item.name, categoryName: item.categoryName };
    if (open) await db.update(reviewTasks).set({ payload, reason: taskReason, title: item.name }).where(eq(reviewTasks.id, open.id));
    else
      await db.insert(reviewTasks).values({
        restaurantId,
        kind: "allergen",
        entityType: "item",
        entityId: item.id,
        title: item.name,
        reason: taskReason,
        payload,
      });
  } else if (open) {
    // A newer, unambiguous suggestion supersedes an older ambiguous one (item still needs a human confirmation).
    await db.update(reviewTasks).set({ status: "dismissed", resolvedAt: new Date() }).where(eq(reviewTasks.id, open.id));
  }
}

/** Runs detection for up to ITEMS_PER_CALL items in one AI call. */
export async function detectAllergens(restaurantId: string, itemIds: string[], userId: string | null) {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) throw new AppError("notFound");
  const list = await loadItems(restaurantId, itemIds.slice(0, ITEMS_PER_CALL));
  if (!list.length) throw new AppError("notFound");
  const { results, model } = await aiDetect(list, r, { restaurantId, userId });
  const out: Record<string, AllergenSuggestion> = {};
  for (const [i, item] of list.entries()) {
    const s = normaliseSuggestion(results[i], item, r.defaultLocale, model);
    await storeSuggestion(restaurantId, item, s, userId);
    out[item.id] = s;
  }
  return out;
}

/** Latest stored AI suggestions per item (from the audit log). */
export async function latestSuggestions(restaurantId: string, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, AllergenSuggestion>();
  const rows = await db
    .selectDistinctOn([auditLog.entityId], { entityId: auditLog.entityId, data: auditLog.data })
    .from(auditLog)
    .where(and(eq(auditLog.restaurantId, restaurantId), eq(auditLog.action, "allergens.ai_suggest"), inArray(auditLog.entityId, itemIds)))
    .orderBy(auditLog.entityId, desc(auditLog.createdAt));
  return new Map(rows.map((r) => [r.entityId!, (r.data as { suggestion: AllergenSuggestion }).suggestion]));
}

export type AllergenState = {
  item: { id: string; name: string; description: string | null; ingredients: string | null; categoryName: string };
  status: AllergenStatus;
  confirmed: { allergens: string[]; additives: string[]; at: string | null };
  suggestion: AllergenSuggestion | null;
  /** Suggestion was made for the current recipe text. */
  fresh: boolean;
};

export async function getAllergenState(restaurantId: string, itemId: string): Promise<AllergenState> {
  const [it] = await loadItems(restaurantId, [itemId]);
  if (!it) throw new AppError("notFound");
  const s = (await latestSuggestions(restaurantId, [itemId])).get(itemId) ?? null;
  return {
    item: { id: it.id, name: it.name, description: it.description, ingredients: it.ingredients, categoryName: it.categoryName },
    status: it.allergenStatus,
    confirmed: { allergens: it.allergens, additives: it.additives, at: it.allergenConfirmedAt?.toISOString() ?? null },
    suggestion: s,
    fresh: !!s && s.inputHash === allergenInputHash(it, it.categoryName),
  };
}

/** Human confirmation: sets the final allergen/additive set, resolves open allergen tasks, audits the decision. */
export async function confirmItem(restaurantId: string, itemId: string, input: { allergens: string[]; additives: string[] }, userId: string) {
  const allergens = ALLERGEN_CODES.filter((c) => input.allergens.includes(c));
  const additives = ADDITIVE_CODES.filter((c) => input.additives.includes(c));
  const suggestion = (await latestSuggestions(restaurantId, [itemId])).get(itemId);
  return db.transaction(async (tx) => {
    const it = await confirmAllergens(restaurantId, itemId, { allergens, additives, userId }, tx);
    await tx
      .update(reviewTasks)
      .set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date() })
      .where(and(eq(reviewTasks.restaurantId, restaurantId), eq(reviewTasks.kind, "allergen"), eq(reviewTasks.entityId, itemId), eq(reviewTasks.status, "open")));
    const aiContains = suggestion?.allergens.filter((a) => a.status === "contains").map((a) => a.code) ?? null;
    await audit(
      {
        restaurantId,
        userId,
        action: "allergens.confirm",
        entityType: "item",
        entityId: itemId,
        data: {
          allergens,
          additives,
          aiSuggested: aiContains,
          deviatesFromAi: aiContains ? aiContains.sort().join() !== [...allergens].sort().join() : null,
        },
      },
      tx,
    );
    return it;
  });
}

/** Items whose allergens are not yet confirmed, with their latest suggestion. */
export async function listUnconfirmed(restaurantId: string) {
  const rows = await db
    .select({ item: items, categoryName: categories.name })
    .from(items)
    .innerJoin(categories, eq(categories.id, items.categoryId))
    .where(and(eq(items.restaurantId, restaurantId), ne(items.allergenStatus, "confirmed")))
    .orderBy(categories.sort, items.sort);
  const sugg = await latestSuggestions(restaurantId, rows.map((r) => r.item.id));
  return rows.map(({ item, categoryName }) => {
    const s = sugg.get(item.id) ?? null;
    return {
      id: item.id,
      name: item.name,
      categoryName,
      status: item.allergenStatus,
      hasFreshSuggestion: !!s && s.inputHash === allergenInputHash(item, categoryName),
      suggestedContains: s?.allergens.filter((a) => a.status === "contains").map((a) => a.code) ?? [],
    };
  });
}
