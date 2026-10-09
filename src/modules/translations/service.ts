import "server-only";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, or, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { glossary, restaurants, reviewTasks, translations, type TranslationStatus } from "@/core/db/schema";
import { aiJson, type AiContext } from "@/core/ai";
import { AppError } from "@/core/http/errors";
import { localeInfo } from "@/core/i18n/locales";
import { getPlan } from "@/modules/billing/plans";
import { collectSourceUnits, parseUnitKey, type SourceUnit } from "./source";

/**
 * Translation pipeline – designed so a German owner can TRUST the result without speaking the target language:
 *  1. translate  (task "translate")         – professional menu translator, glossary-aware, JSON keyed by ids
 *  2. checks     (deterministic, no AI)     – numbers/units kept, glossary terms respected, not empty/unchanged
 *  3. review     (task "translate_review")  – independent model family: score 1–5, issues, correction, back-translation
 *  4. status     – approved (score ≥ threshold, no correction, no issues) | machine (≥ 3.5, nothing critical) | needs_review (+ review task)
 * Human decisions (approve / edit) are never overwritten unless the source changed (stale) or a re-translation is forced.
 */

export const BATCH_SIZE = 40;
const BATCH_CHAR_BUDGET = 7000;
const DEFAULT_THRESHOLD = 4.5;
const MACHINE_MIN_SCORE = 3.5;

export type Restaurant = typeof restaurants.$inferSelect;
export type TranslationRow = typeof translations.$inferSelect;
export type EffectiveStatus = TranslationStatus | "missing";

const languageName = (code: string) => localeInfo(code)?.name ?? code;

// ------------------------------------------------------------------ restaurant / locales

export async function getRestaurant(restaurantId: string): Promise<Restaurant> {
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) throw new AppError("notFound");
  return r;
}

/** Guest languages to translate into: enabled locales except the source, capped by the plan's language limit. */
export function targetLocales(r: Restaurant): string[] {
  const max = Math.max(0, getPlan(r.plan).limits.locales - 1);
  return r.enabledLocales.filter((l) => l !== r.defaultLocale).slice(0, max);
}

export function translationSettings(r: Restaurant) {
  const s = r.settings.translations;
  return {
    guestsSeeOnlyApproved: s?.guestsSeeOnlyApproved ?? false,
    autoApproveThreshold: s && "autoApproveThreshold" in s ? s.autoApproveThreshold : DEFAULT_THRESHOLD,
  };
}

function assertLocale(r: Restaurant, locale: string) {
  if (!targetLocales(r).includes(locale)) throw new AppError("validation", `locale ${locale} not enabled`);
}

// ------------------------------------------------------------------ overview / listing

export function effectiveStatus(unit: SourceUnit, row: TranslationRow | undefined): EffectiveStatus {
  if (!row) return "missing";
  if (row.status === "stale" || row.sourceHash !== unit.hash) return "stale";
  return row.status;
}

/** A human approved or wrote this translation → protected from automatic overwrites. */
export const isHumanDecision = (row: TranslationRow) => row.status === "approved" && (row.translatedBy === "human" || row.updatedBy !== null);

async function loadRows(restaurantId: string, locales: string[]) {
  if (!locales.length) return [];
  return db
    .select()
    .from(translations)
    .where(and(eq(translations.restaurantId, restaurantId), inArray(translations.locale, locales)));
}

const rowKey = (r: Pick<TranslationRow, "entityType" | "entityId" | "field">) => `${r.entityType}:${r.entityId}:${r.field}`;

export type LocaleProgress = Record<EffectiveStatus, number> & { total: number };

export async function getProgress(restaurantId: string, locales: string[], units?: SourceUnit[]) {
  const us = units ?? (await collectSourceUnits(restaurantId));
  const rows = await loadRows(restaurantId, locales);
  const out: Record<string, LocaleProgress> = {};
  for (const l of locales) {
    const map = new Map(rows.filter((r) => r.locale === l).map((r) => [rowKey(r), r]));
    const p: LocaleProgress = { total: us.length, approved: 0, machine: 0, needs_review: 0, stale: 0, missing: 0 };
    for (const u of us) p[effectiveStatus(u, map.get(u.key))]++;
    out[l] = p;
  }
  return out;
}

export type TranslationListRow = {
  key: string;
  kind: SourceUnit["kind"];
  field: SourceUnit["field"];
  context: string | null;
  source: string;
  status: EffectiveStatus;
  id: string | null;
  value: string | null;
  backTranslation: string | null;
  qualityScore: number | null;
  reviewNotes: string | null;
  translatedBy: string | null;
  humanApproved: boolean;
};

export async function listForLocale(restaurantId: string, locale: string, units?: SourceUnit[]): Promise<TranslationListRow[]> {
  const us = units ?? (await collectSourceUnits(restaurantId));
  const rows = await loadRows(restaurantId, [locale]);
  const map = new Map(rows.map((r) => [rowKey(r), r]));
  return us.map((u) => {
    const r = map.get(u.key);
    return {
      key: u.key,
      kind: u.kind,
      field: u.field,
      context: u.context,
      source: u.text,
      status: effectiveStatus(u, r),
      id: r?.id ?? null,
      value: r?.value ?? null,
      backTranslation: r?.backTranslation ?? null,
      qualityScore: r?.qualityScore ?? null,
      reviewNotes: r?.reviewNotes ?? null,
      translatedBy: r?.translatedBy ?? null,
      humanApproved: r ? isHumanDecision(r) : false,
    };
  });
}

// ------------------------------------------------------------------ job planning

export type JobMode = "missing" | "stale" | "missing_stale" | "keys";
export type JobBatch = { locale: string; keys: string[] };

/** Splits the work into batches (≤ BATCH_SIZE strings, bounded characters). The client runs them one by one. */
export async function planJob(
  restaurantId: string,
  opts: { locales?: string[]; mode: JobMode; keys?: string[] },
): Promise<{ batches: JobBatch[]; strings: number }> {
  const r = await getRestaurant(restaurantId);
  const allowed = targetLocales(r);
  const locales = (opts.locales?.length ? opts.locales : allowed).filter((l) => allowed.includes(l));
  const units = await collectSourceUnits(restaurantId);
  const rows = await loadRows(restaurantId, locales);
  const batches: JobBatch[] = [];
  let strings = 0;
  for (const locale of locales) {
    const map = new Map(rows.filter((x) => x.locale === locale).map((x) => [rowKey(x), x]));
    const wanted = units.filter((u) => {
      if (opts.mode === "keys") return opts.keys?.includes(u.key);
      const s = effectiveStatus(u, map.get(u.key));
      if (opts.mode === "missing") return s === "missing";
      if (opts.mode === "stale") return s === "stale";
      return s === "missing" || s === "stale";
    });
    let cur: string[] = [];
    let chars = 0;
    for (const u of wanted) {
      if (cur.length >= BATCH_SIZE || (cur.length && chars + u.text.length > BATCH_CHAR_BUDGET)) {
        batches.push({ locale, keys: cur });
        cur = [];
        chars = 0;
      }
      cur.push(u.key);
      chars += u.text.length;
    }
    if (cur.length) batches.push({ locale, keys: cur });
    strings += wanted.length;
  }
  return { batches, strings };
}

// ------------------------------------------------------------------ glossary

export type GlossaryEntry = typeof glossary.$inferSelect;

export async function getGlossary(restaurantId: string, locale?: string) {
  return db
    .select()
    .from(glossary)
    .where(and(eq(glossary.restaurantId, restaurantId), locale ? or(isNull(glossary.locale), eq(glossary.locale, locale)) : undefined))
    .orderBy(glossary.term);
}

const containsTerm = (text: string, term: string) => text.toLocaleLowerCase("de").includes(term.toLocaleLowerCase("de"));

function relevantGlossary(entries: GlossaryEntry[], texts: string[]) {
  const joined = texts.join("\n");
  return entries.filter((g) => containsTerm(joined, g.term));
}

// ------------------------------------------------------------------ deterministic checks

type Issue = { severity: "critical" | "major" | "minor"; message: string };

const CHECK_TEXT: Record<string, Record<string, (a: string) => string>> = {
  de: {
    numbers: (a) => `Zahlen/Mengen weichen von der Quelle ab (${a}).`,
    keep: (a) => `Glossar: „${a}“ sollte unübersetzt bleiben.`,
    fixed: (a) => `Glossar: „${a}“ wurde nicht wie festgelegt übersetzt.`,
    empty: () => "Übersetzung ist leer.",
    unchanged: () => "Text wurde offenbar nicht übersetzt (identisch mit der Quelle).",
    length: () => "Länge weicht stark von der Quelle ab – bitte prüfen.",
    corrected: (a) => `Korrektur des Prüfers übernommen (ursprünglich: „${a}“).`,
    reviewFailed: () => "Automatische Zweitprüfung war nicht möglich – bitte manuell prüfen.",
  },
  en: {
    numbers: (a) => `Numbers/quantities differ from the source (${a}).`,
    keep: (a) => `Glossary: "${a}" should stay untranslated.`,
    fixed: (a) => `Glossary: "${a}" was not translated as defined.`,
    empty: () => "Translation is empty.",
    unchanged: () => "Text seems untranslated (identical to the source).",
    length: () => "Length differs strongly from the source – please check.",
    corrected: (a) => `Reviewer correction applied (originally: "${a}").`,
    reviewFailed: () => "Automatic second review was not possible – please check manually.",
  },
  tr: {
    numbers: (a) => `Sayılar/miktarlar kaynaktan farklı (${a}).`,
    keep: (a) => `Sözlük: "${a}" çevrilmeden kalmalı.`,
    fixed: (a) => `Sözlük: "${a}" belirlenen şekilde çevrilmedi.`,
    empty: () => "Çeviri boş.",
    unchanged: () => "Metin çevrilmemiş görünüyor (kaynakla aynı).",
    length: () => "Uzunluk kaynaktan çok farklı – lütfen kontrol et.",
    corrected: (a) => `Denetçinin düzeltmesi uygulandı (orijinal: "${a}").`,
    reviewFailed: () => "Otomatik ikinci kontrol yapılamadı – lütfen elle kontrol et.",
  },
};
const msgs = (sourceLocale: string) => CHECK_TEXT[sourceLocale] ?? CHECK_TEXT.en;

const numbersOf = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")).sort();

export function deterministicChecks(
  unit: Pick<SourceUnit, "text" | "kind" | "field">,
  value: string,
  gloss: GlossaryEntry[],
  sourceLocale: string,
): Issue[] {
  const m = msgs(sourceLocale);
  const issues: Issue[] = [];
  const v = value.trim();
  if (!v) return [{ severity: "critical", message: m.empty("") }];

  const a = numbersOf(unit.text);
  const b = numbersOf(v);
  if (a.join("|") !== b.join("|")) {
    const missing = a.filter((n) => !b.includes(n));
    if (missing.length) issues.push({ severity: "critical", message: m.numbers(missing.join(", ")) });
  }
  for (const g of gloss) {
    if (!containsTerm(unit.text, g.term)) continue;
    if (g.doNotTranslate && !containsTerm(v, g.term)) issues.push({ severity: "major", message: m.keep(g.term) });
    if (!g.doNotTranslate && g.translation && !containsTerm(v, g.translation)) issues.push({ severity: "major", message: m.fixed(g.term) });
  }
  const words = unit.text.split(/\s+/).length;
  if (unit.field === "description" && words >= 4 && v.toLowerCase() === unit.text.toLowerCase()) {
    issues.push({ severity: "major", message: m.unchanged("") });
  }
  if (unit.text.length > 20) {
    const ratio = v.length / unit.text.length;
    if (ratio < 0.35 || ratio > 3) issues.push({ severity: "minor", message: m.length("") });
  }
  return issues;
}

// ------------------------------------------------------------------ AI calls

const translateSchema = z.object({
  translations: z.array(z.object({ id: z.string(), text: z.string() })),
});

const reviewSchema = z.object({
  reviews: z.array(
    z.object({
      id: z.string(),
      score: z.number().min(1).max(5).describe("Quality of the GIVEN translation, 1 (wrong) – 5 (perfect)"),
      issues: z.array(z.object({ severity: z.enum(["critical", "major", "minor"]), message: z.string() })),
      correction: z.string().nullable().describe("Corrected translation, or null if the given one is fine"),
      correctionConfident: z.boolean().describe("true only if you are sure the correction is better and fully faithful"),
      finalScore: z.number().min(1).max(5).describe("Quality of the final text (correction if given, else the original)"),
      backTranslation: z.string().describe("Literal back-translation of the FINAL text into the source language"),
    }),
  ),
});

type Ctx = { restaurant: Restaurant; locale: string; gloss: GlossaryEntry[]; ai: AiContext };

function glossaryPrompt(gloss: GlossaryEntry[], locale: string) {
  if (!gloss.length) return "";
  const lines = gloss.map((g) =>
    g.doNotTranslate
      ? `- "${g.term}" → keep exactly as is (do not translate)`
      : g.translation
        ? `- "${g.term}" → always translate as "${g.translation}"${g.locale ? "" : ` (when translating into ${languageName(locale)})`}`
        : `- "${g.term}" → keep as is`,
  );
  return `\nRestaurant glossary (MUST be respected):\n${lines.join("\n")}\n`;
}

async function aiTranslate(units: SourceUnit[], ctx: Ctx) {
  const src = languageName(ctx.restaurant.defaultLocale);
  const tgt = languageName(ctx.locale);
  const cuisine = ctx.restaurant.settings.cuisine;
  const system = `You are a professional menu translator for restaurants in Germany. Translate menu texts from ${src} into ${tgt} for restaurant guests.
Rules:
- Translate faithfully. NEVER add, remove or invent ingredients, preparation methods or claims.
- Keep all numbers, units, quantities and sizes exactly (e.g. "0,3 l", "250 g", "3 Stück") – adapt only the decimal separator if customary in ${tgt}.
- Keep customary proper dish names in the original when guests know them that way (e.g. "Currywurst", "Döner", "Schnitzel", "Spätzle", "Flammkuchen", "Lahmacun") and, for item names only, add a very short explanation in parentheses when the name alone is not understandable (e.g. "Schnitzel Wiener Art" → "Schnitzel Viennese style (breaded pork cutlet)").
- Legally meaningful wording must stay precise: "nach Art", "Wiener Art", "hausgemacht", "vegan", "vegetarisch", "Bio" etc.
- Item/category names: short, appetising, title-like; descriptions: natural, concise menu style. No marketing exaggeration.
- Do not translate brand names (Coca-Cola, Fritz-Kola, Aperol …).
- Return every id exactly once.${glossaryPrompt(ctx.gloss, ctx.locale)}`;
  const payload = {
    restaurant: ctx.restaurant.name,
    ...(cuisine ? { cuisine } : {}),
    sourceLanguage: src,
    targetLanguage: tgt,
    texts: units.map((u, i) => ({ id: `t${i + 1}`, type: `${u.kind} ${u.field}`, ...(u.context ? { context: u.context } : {}), text: u.text })),
  };
  const { data, model } = await aiJson(
    "translate",
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Translate these texts. Output JSON {"translations":[{"id","text"}]}.\n${JSON.stringify(payload)}` },
      ],
      maxTokens: 6000,
    },
    translateSchema,
    ctx.ai,
    "translations",
  );
  const byId = new Map(data.translations.map((t) => [t.id, t.text]));
  return { values: units.map((_, i) => byId.get(`t${i + 1}`)?.trim() ?? null), model };
}

async function aiReview(pairs: { unit: SourceUnit; value: string }[], ctx: Ctx) {
  const src = languageName(ctx.restaurant.defaultLocale);
  const tgt = languageName(ctx.locale);
  const system = `You are an independent senior reviewer of restaurant menu translations (${src} → ${tgt}). Another translator produced these translations; you check them strictly.
For each pair:
- score 1–5 for the GIVEN translation: 5 = perfect & natural, 4 = correct with tiny style issues, 3 = understandable but flawed, 2 = meaning partly wrong, 1 = wrong/misleading.
- issues: concrete problems, written in ${src}. "critical" = meaning changed, ingredient added/omitted/wrong, number/unit changed, allergen-relevant error, offensive; "major" = wrong term, unnatural for guests, glossary violated; "minor" = style.
- correction: a better translation if needed (else null). correctionConfident = true only if it is clearly better and fully faithful.
- finalScore: quality of the final text (your correction if given, otherwise the original).
- backTranslation: a literal translation of the FINAL text back into ${src}, so a ${src}-speaking owner can verify the meaning. Do not just copy the source – translate what the ${tgt} text actually says.
Customary dish names (Currywurst, Döner, Schnitzel …) kept in the original are correct. Brand names stay untranslated.${glossaryPrompt(ctx.gloss, ctx.locale)}`;
  const payload = pairs.map((p, i) => ({
    id: `r${i + 1}`,
    type: `${p.unit.kind} ${p.unit.field}`,
    ...(p.unit.context ? { context: p.unit.context } : {}),
    source: p.unit.text,
    translation: p.value,
  }));
  const { data, model } = await aiJson(
    "translate_review",
    {
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Review these translations. Output JSON {"reviews":[{"id","score","issues","correction","correctionConfident","finalScore","backTranslation"}]}.\n${JSON.stringify(payload)}`,
        },
      ],
      maxTokens: 8000,
    },
    reviewSchema,
    ctx.ai,
    "reviews",
  );
  const byId = new Map(data.reviews.map((r) => [r.id, r]));
  return { reviews: pairs.map((_, i) => byId.get(`r${i + 1}`) ?? null), model };
}

// ------------------------------------------------------------------ decision + storage

type Decision = {
  value: string;
  status: Exclude<TranslationStatus, "stale">;
  qualityScore: number | null;
  reviewNotes: string | null;
  backTranslation: string | null;
  issues: Issue[];
  corrected: boolean;
};

export function decide(
  unit: SourceUnit,
  original: string,
  review: z.infer<typeof reviewSchema>["reviews"][number] | null,
  gloss: GlossaryEntry[],
  sourceLocale: string,
  threshold: number | null,
): Decision {
  const m = msgs(sourceLocale);
  if (!review) {
    const issues = [...deterministicChecks(unit, original, gloss, sourceLocale), { severity: "major" as const, message: m.reviewFailed("") }];
    return { value: original, status: "needs_review", qualityScore: null, reviewNotes: formatNotes(issues), backTranslation: null, issues, corrected: false };
  }
  let value = original;
  let corrected = false;
  const correction = review.correction?.trim();
  if (correction && correction !== original && review.correctionConfident) {
    // Only accept the reviewer's correction if it does not introduce new deterministic problems.
    const before = deterministicChecks(unit, original, gloss, sourceLocale);
    const after = deterministicChecks(unit, correction, gloss, sourceLocale);
    if (after.filter((i) => i.severity !== "minor").length <= before.filter((i) => i.severity !== "minor").length) {
      value = correction;
      corrected = true;
    }
  }
  const checks = deterministicChecks(unit, value, gloss, sourceLocale);
  // Issues of the original translation are resolved by an applied correction (kept in notes for transparency) –
  // except critical ones (meaning/ingredient/number errors): a human must confirm the corrected text.
  const aiIssues = corrected
    ? review.issues.map((i) => ({ ...i, severity: i.severity === "critical" ? ("critical" as const) : ("minor" as const) }))
    : review.issues;
  const issues: Issue[] = [...checks, ...aiIssues];
  if (corrected) issues.unshift({ severity: "minor", message: m.corrected(original) });

  const score = corrected ? review.finalScore : review.score;
  const hasCritical = issues.some((i) => i.severity === "critical");
  const hasMajorCheck = checks.some((i) => i.severity !== "minor");
  let status: Decision["status"];
  if (hasCritical || hasMajorCheck || score < MACHINE_MIN_SCORE) status = "needs_review";
  else if (threshold != null && score >= threshold && !corrected && !issues.some((i) => i.severity === "major")) status = "approved";
  else status = "machine";

  return {
    value,
    status,
    qualityScore: Math.round(score * 10) / 10,
    reviewNotes: formatNotes(issues),
    backTranslation: review.backTranslation?.trim() || null,
    issues,
    corrected,
  };
}

function formatNotes(issues: Issue[]) {
  if (!issues.length) return null;
  const icon = { critical: "⛔", major: "⚠️", minor: "ℹ️" } as const;
  return issues.map((i) => `${icon[i.severity]} ${i.message}`).join("\n");
}

async function storeDecision(
  restaurantId: string,
  unit: SourceUnit,
  locale: string,
  d: Decision,
  translatedBy: string,
  keepHumanStatus: TranslationRow | undefined,
) {
  const status = keepHumanStatus ? "approved" : d.status;
  const values = {
    restaurantId,
    entityType: unit.entityType,
    entityId: unit.entityId,
    field: unit.field,
    locale,
    value: keepHumanStatus ? keepHumanStatus.value : d.value,
    status,
    sourceHash: unit.hash,
    qualityScore: d.qualityScore,
    reviewNotes: d.reviewNotes,
    backTranslation: keepHumanStatus && d.corrected ? null : d.backTranslation,
    translatedBy: keepHumanStatus ? keepHumanStatus.translatedBy : translatedBy,
    updatedBy: keepHumanStatus ? keepHumanStatus.updatedBy : null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(translations)
    .values(values)
    .onConflictDoUpdate({
      target: [translations.entityType, translations.entityId, translations.field, translations.locale],
      set: { ...values, restaurantId: undefined },
    })
    .returning();

  if (status === "needs_review") await upsertTranslationTask(restaurantId, unit, row, d.issues);
  else await closeTranslationTasks(restaurantId, [row.id], "resolved", null);
  return row;
}

async function upsertTranslationTask(restaurantId: string, unit: SourceUnit, row: TranslationRow, issues: Issue[]) {
  const payload = {
    translationId: row.id,
    locale: row.locale,
    field: unit.field,
    kind: unit.kind,
    key: unit.key,
    source: unit.text,
    value: row.value,
    backTranslation: row.backTranslation,
    qualityScore: row.qualityScore,
    issues,
  };
  const title = `${unit.text.slice(0, 80)} → ${row.locale.toUpperCase()}`;
  const reason = issues.find((i) => i.severity === "critical")?.message ?? issues[0]?.message ?? null;
  const [open] = await db
    .select({ id: reviewTasks.id })
    .from(reviewTasks)
    .where(
      and(
        eq(reviewTasks.restaurantId, restaurantId),
        eq(reviewTasks.kind, "translation"),
        eq(reviewTasks.status, "open"),
        dsql`${reviewTasks.payload}->>'translationId' = ${row.id}`,
      ),
    )
    .limit(1);
  if (open) await db.update(reviewTasks).set({ payload, title, reason }).where(eq(reviewTasks.id, open.id));
  else
    await db.insert(reviewTasks).values({
      restaurantId,
      kind: "translation",
      entityType: unit.entityType,
      entityId: unit.entityId,
      title,
      reason,
      payload,
    });
}

export async function closeTranslationTasks(restaurantId: string, translationIds: string[], status: "resolved" | "dismissed", userId: string | null) {
  if (!translationIds.length) return;
  await db
    .update(reviewTasks)
    .set({ status, resolvedBy: userId, resolvedAt: new Date() })
    .where(
      and(
        eq(reviewTasks.restaurantId, restaurantId),
        eq(reviewTasks.kind, "translation"),
        eq(reviewTasks.status, "open"),
        inArray(dsql<string>`${reviewTasks.payload}->>'translationId'`, translationIds),
      ),
    );
}

export type BatchResult = { translated: number; approved: number; machine: number; needsReview: number; skipped: number; failed: number };

/**
 * Translates + reviews one batch of units into one locale and stores the results.
 * `force` re-translates even human-approved texts (explicit per-row action).
 */
export async function translateBatch(
  restaurantId: string,
  locale: string,
  keys: string[],
  opts: { userId: string | null; force?: boolean },
): Promise<BatchResult> {
  const restaurant = await getRestaurant(restaurantId);
  assertLocale(restaurant, locale);
  if (restaurant.defaultLocale === locale) throw new AppError("validation");
  const wanted = new Set(keys.filter((k) => parseUnitKey(k)));
  const units = (await collectSourceUnits(restaurantId)).filter((u) => wanted.has(u.key)).slice(0, BATCH_SIZE);
  const result: BatchResult = { translated: 0, approved: 0, machine: 0, needsReview: 0, skipped: keys.length - units.length, failed: 0 };
  if (!units.length) return result;

  const existing = new Map((await loadRows(restaurantId, [locale])).map((r) => [rowKey(r), r]));
  const todo = units.filter((u) => {
    const row = existing.get(u.key);
    const protectedRow = row && isHumanDecision(row) && row.sourceHash === u.hash && row.status !== "stale";
    if (protectedRow && !opts.force) {
      result.skipped++;
      return false;
    }
    return true;
  });
  if (!todo.length) return result;

  const gloss = relevantGlossary(await getGlossary(restaurantId, locale), todo.map((u) => u.text));
  const ctx: Ctx = { restaurant, locale, gloss, ai: { restaurantId, userId: opts.userId } };

  const { values, model } = await aiTranslate(todo, ctx);
  const pairs = todo.map((unit, i) => ({ unit, value: values[i] })).filter((p): p is { unit: SourceUnit; value: string } => !!p.value);
  result.failed += todo.length - pairs.length;
  if (!pairs.length) return result;

  let reviews: Awaited<ReturnType<typeof aiReview>>["reviews"] = pairs.map(() => null);
  let reviewModel: string | null = null;
  try {
    const r = await aiReview(pairs, ctx);
    reviews = r.reviews;
    reviewModel = r.model;
  } catch (e) {
    // Credits exhausted or reviewer down → keep translations but force human review.
    console.warn("[translations] review failed:", e instanceof Error ? e.message : e);
  }
  const { autoApproveThreshold } = translationSettings(restaurant);
  for (const [i, p] of pairs.entries()) {
    const d = decide(p.unit, p.value, reviews[i], gloss, restaurant.defaultLocale, autoApproveThreshold);
    const by = d.corrected && reviewModel ? `${model} + ${reviewModel}` : model;
    await storeDecision(restaurantId, p.unit, locale, d, by, undefined);
    result.translated++;
    if (d.status === "approved") result.approved++;
    else if (d.status === "machine") result.machine++;
    else result.needsReview++;
  }
  return result;
}

/**
 * Runs only the independent review on existing translations (e.g. after a human edit) to get a score and a
 * back-translation. Human-approved texts keep their value and status; only the assessment is refreshed.
 */
export async function reviewExisting(restaurantId: string, locale: string, keys: string[], opts: { userId: string | null }) {
  const restaurant = await getRestaurant(restaurantId);
  assertLocale(restaurant, locale);
  const wanted = new Set(keys);
  const units = (await collectSourceUnits(restaurantId)).filter((u) => wanted.has(u.key)).slice(0, BATCH_SIZE);
  const existing = new Map((await loadRows(restaurantId, [locale])).map((r) => [rowKey(r), r]));
  const pairs = units
    .map((unit) => ({ unit, row: existing.get(unit.key) }))
    .filter((p): p is { unit: SourceUnit; row: TranslationRow } => !!p.row && p.row.sourceHash === p.unit.hash && p.row.status !== "stale");
  if (!pairs.length) return { reviewed: 0 };
  const gloss = relevantGlossary(await getGlossary(restaurantId, locale), pairs.map((p) => p.unit.text));
  const ctx: Ctx = { restaurant, locale, gloss, ai: { restaurantId, userId: opts.userId } };
  const { reviews, model } = await aiReview(pairs.map((p) => ({ unit: p.unit, value: p.row.value })), ctx);
  const { autoApproveThreshold } = translationSettings(restaurant);
  for (const [i, p] of pairs.entries()) {
    const human = isHumanDecision(p.row);
    // For human texts never apply corrections automatically → decide on the original only.
    const review = reviews[i] && human ? { ...reviews[i]!, correction: null, correctionConfident: false } : reviews[i];
    const d = decide(p.unit, p.row.value, review, gloss, restaurant.defaultLocale, autoApproveThreshold);
    const by = d.corrected ? `${p.row.translatedBy ?? "?"} + ${model}` : (p.row.translatedBy ?? model);
    await storeDecision(restaurantId, p.unit, locale, d, by, human ? p.row : undefined);
  }
  return { reviewed: pairs.length };
}

// ------------------------------------------------------------------ human actions

/** Human edit → approved, translatedBy "human". The previous AI assessment no longer applies and is cleared. */
export async function saveHumanTranslation(restaurantId: string, key: string, locale: string, value: string, userId: string) {
  const restaurant = await getRestaurant(restaurantId);
  assertLocale(restaurant, locale);
  const unit = (await collectSourceUnits(restaurantId)).find((u) => u.key === key);
  if (!unit) throw new AppError("notFound");
  const v = value.trim();
  if (!v) throw new AppError("validation");
  const values = {
    restaurantId,
    entityType: unit.entityType,
    entityId: unit.entityId,
    field: unit.field,
    locale,
    value: v,
    status: "approved" as const,
    sourceHash: unit.hash,
    qualityScore: null,
    reviewNotes: null,
    backTranslation: null,
    translatedBy: "human",
    updatedBy: userId,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(translations)
    .values(values)
    .onConflictDoUpdate({ target: [translations.entityType, translations.entityId, translations.field, translations.locale], set: values })
    .returning();
  await closeTranslationTasks(restaurantId, [row.id], "resolved", userId);
  return row;
}

/** Approve as-is (also confirms stale translations as still valid → hash updated to the current source). */
export async function approveTranslations(restaurantId: string, ids: string[], userId: string) {
  if (!ids.length) return 0;
  const rows = await db
    .select()
    .from(translations)
    .where(and(eq(translations.restaurantId, restaurantId), inArray(translations.id, ids)));
  if (!rows.length) return 0;
  const units = new Map((await collectSourceUnits(restaurantId)).map((u) => [u.key, u]));
  const now = new Date();
  let n = 0;
  for (const r of rows) {
    const unit = units.get(rowKey(r));
    if (!unit) continue;
    await db
      .update(translations)
      .set({ status: "approved", sourceHash: unit.hash, updatedBy: userId, updatedAt: now })
      .where(eq(translations.id, r.id));
    n++;
  }
  await closeTranslationTasks(restaurantId, rows.map((r) => r.id), "resolved", userId);
  return n;
}

/** Bulk approve all current machine translations of a locale with qualityScore ≥ minScore. */
export async function approveAllWithScore(restaurantId: string, locale: string, minScore: number, userId: string) {
  const units = new Map((await collectSourceUnits(restaurantId)).map((u) => [u.key, u]));
  const rows = await db
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.restaurantId, restaurantId),
        eq(translations.locale, locale),
        eq(translations.status, "machine"),
        gte(translations.qualityScore, minScore),
      ),
    );
  const ids = rows.filter((r) => units.get(rowKey(r))?.hash === r.sourceHash).map((r) => r.id);
  if (!ids.length) return 0;
  await db
    .update(translations)
    .set({ status: "approved", updatedBy: userId, updatedAt: new Date() })
    .where(inArray(translations.id, ids));
  await closeTranslationTasks(restaurantId, ids, "resolved", userId);
  return ids.length;
}

export async function recentTranslationTasks(restaurantId: string) {
  return db
    .select()
    .from(reviewTasks)
    .where(and(eq(reviewTasks.restaurantId, restaurantId), eq(reviewTasks.kind, "translation"), eq(reviewTasks.status, "open")))
    .orderBy(desc(reviewTasks.createdAt));
}
