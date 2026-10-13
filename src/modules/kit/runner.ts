import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/core/db";
import { jobs, menuImports, themes } from "@/core/db/schema";
import { audit } from "@/core/audit";
import { AppError } from "@/core/http/errors";
import { extractLogo, getPageImages, getSourceDocuments, setSourceDocuments } from "@/modules/documents";
import { countDraftItems, createImport, runExtraction } from "@/modules/import/service";
import type { ImportDraft } from "@/modules/import/types";
import type { DesignBrief } from "@/modules/theme-ai/brief";
import { analyzeDesignFiles, generatePrintTheme, generateTheme, mediaToParts } from "@/modules/theme-ai/service";
import type { ContentPart } from "@/core/ai";
import type { PrintFormat } from "@/modules/theme-engine/types";
import { KIT_JOB_KIND, KIT_MAX_FILES, KIT_PRINT_FORMAT, KIT_STEPS, type KitJobStatus, type KitStepKey, type KitStepState } from "./types";

/**
 * In-process runner of the menu kit job (single app instance – see jobs schema). The job row is the source of truth:
 * per-step state in `jobs.steps`, produced ids + the shared design brief in `jobs.result`. Steps are idempotent
 * (a retry reuses what already exists) and run in parallel where their dependencies allow:
 *
 *   sources ─┬─ import
 *            └─ pages ─┬─ logo ──┐
 *                      └─ brief ─┴─ theme ‖ print
 *
 * A running job writes a heartbeat (updatedAt) every 20 s; a job without heartbeat for 2 min (server restart) or
 * running longer than 15 min counts as interrupted → failed, its unfinished steps can be retried.
 */

const HEARTBEAT_MS = 20_000;
const STALE_HEARTBEAT_MS = 2 * 60_000;
const MAX_RUNTIME_MS = 15 * 60_000;
const MAX_PAGES = 6;
const MAX_REFERENCE_IMAGES = 3;

export type JobRow = typeof jobs.$inferSelect;

export type KitInput = { mediaIds?: string[]; locale: string; format: PrintFormat; steps: KitStepKey[]; runStartedAt?: string };

export type KitResult = {
  mediaIds?: string[];
  pageMediaIds?: string[];
  importId?: string;
  itemCount?: number;
  logoMediaId?: string | null;
  logoApplied?: boolean;
  logoConfidence?: number;
  brief?: DesignBrief;
  briefMediaIds?: string[];
  briefModel?: string;
  themeId?: string;
  themeVersionId?: string;
  themeSummary?: string;
  printThemeId?: string;
  printVersionId?: string;
  printSummary?: string;
};

/** hard = must be done; soft = only waited for (the step also works without it). */
const DEPS: Record<KitStepKey, { hard: KitStepKey[]; soft: KitStepKey[] }> = {
  sources: { hard: [], soft: [] },
  pages: { hard: ["sources"], soft: [] },
  import: { hard: ["sources"], soft: [] },
  logo: { hard: ["sources"], soft: ["pages"] },
  brief: { hard: ["sources"], soft: ["pages"] },
  theme: { hard: ["brief"], soft: ["logo"] },
  print: { hard: ["brief"], soft: ["logo"] },
};

/** Jobs executing in THIS process (survives dev HMR via globalThis; a restart empties it). */
const g = globalThis as unknown as { __vmKitRunning?: Set<string> };
const running = (g.__vmKitRunning ??= new Set<string>());

const now = () => new Date();
const iso = () => new Date().toISOString();

// ------------------------------------------------------------------ row helpers

export const kitInput = (j: JobRow) => j.input as unknown as KitInput;
export const kitResult = (j: JobRow) => j.result as unknown as KitResult;
const stepsOf = (j: JobRow) => j.steps as Record<string, KitStepState>;

async function setStep(jobId: string, key: KitStepKey, state: KitStepState) {
  await db
    .update(jobs)
    .set({ steps: sql`jsonb_set(${jobs.steps}, ${`{${key}}`}::text[], ${JSON.stringify(state)}::jsonb, true)`, updatedAt: now() })
    .where(eq(jobs.id, jobId));
}

async function patchResult(jobId: string, patch: Partial<KitResult>) {
  await db
    .update(jobs)
    .set({ result: sql`${jobs.result} || ${JSON.stringify(patch)}::jsonb`, updatedAt: now() })
    .where(eq(jobs.id, jobId));
}

async function loadJob(jobId: string): Promise<JobRow | null> {
  const [j] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return j ?? null;
}

const isActiveStatus = (s: string) => s === "queued" || s === "running";

/** Interrupted = no heartbeat for 2 min (server restart, crash) or the current run takes > 15 min. */
function isStale(j: JobRow) {
  if (!isActiveStatus(j.status)) return false;
  const t = Date.now();
  const runStartedAt = Date.parse(kitInput(j).runStartedAt ?? "") || j.createdAt.getTime();
  return t - runStartedAt > MAX_RUNTIME_MS || t - j.updatedAt.getTime() > STALE_HEARTBEAT_MS;
}

/** Marks an interrupted job (and its unfinished steps) as failed. Returns the fresh row. */
async function failStale(j: JobRow): Promise<JobRow> {
  const steps = { ...stepsOf(j) };
  for (const [k, s] of Object.entries(steps)) if (s.status === "running" || s.status === "pending") steps[k] = { ...s, status: "failed", error: "interrupted", finishedAt: iso() };
  const [u] = await db
    .update(jobs)
    .set({ status: "failed", error: "interrupted", steps, finishedAt: now(), updatedAt: now() })
    .where(and(eq(jobs.id, j.id), inArray(jobs.status, ["queued", "running"])))
    .returning();
  return u ?? (await loadJob(j.id))!;
}

/** Job row of the restaurant (stale guard applied). */
export async function getKitJobRow(restaurantId: string, jobId: string): Promise<JobRow> {
  const [j] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.restaurantId, restaurantId), eq(jobs.kind, KIT_JOB_KIND)))
    .limit(1);
  if (!j) throw new AppError("notFound");
  return isStale(j) ? failStale(j) : j;
}

/** Latest kit job of the restaurant (stale guard applied) or null. */
export async function getLatestKitJobRow(restaurantId: string): Promise<JobRow | null> {
  const [j] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.restaurantId, restaurantId), eq(jobs.kind, KIT_JOB_KIND)))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (!j) return null;
  return isStale(j) ? failStale(j) : j;
}

/** Latest stored design brief of a finished brief step – reused by the theme / print dialogs. */
export async function getLatestKitBrief(restaurantId: string): Promise<{ brief: DesignBrief; mediaIds: string[]; pageMediaIds: string[] } | null> {
  const rows = await db
    .select({ result: jobs.result })
    .from(jobs)
    .where(and(eq(jobs.restaurantId, restaurantId), eq(jobs.kind, KIT_JOB_KIND), sql`${jobs.result} ? 'brief'`))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  const r = rows[0]?.result as KitResult | undefined;
  if (!r?.brief) return null;
  return { brief: r.brief, mediaIds: r.briefMediaIds ?? r.mediaIds ?? [], pageMediaIds: r.pageMediaIds ?? [] };
}

// ------------------------------------------------------------------ start / retry

/**
 * Creates the kit job (one active job per restaurant – returns the running one instead) and starts it in the
 * background. `mediaIds` omitted → the stored source documents are used.
 */
export async function startKitJob(opts: {
  restaurantId: string;
  userId: string;
  mediaIds?: string[];
  locale: string;
  steps: KitStepKey[];
  format?: PrintFormat;
}): Promise<{ jobId: string; existing: boolean }> {
  const ids = opts.mediaIds ? [...new Set(opts.mediaIds)] : undefined;
  if (ids && (!ids.length || ids.length > KIT_MAX_FILES)) throw new AppError("validation", "files");
  const steps = KIT_STEPS.filter((k) => opts.steps.includes(k) || k === "sources");

  const res = await db.transaction(async (tx) => {
    // serialises concurrent starts of the same restaurant (double click, two tabs)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`kit:${opts.restaurantId}`}))`);
    const [active] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.restaurantId, opts.restaurantId), eq(jobs.kind, KIT_JOB_KIND), inArray(jobs.status, ["queued", "running"])))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    if (active && !isStale(active)) return { jobId: active.id, existing: true };
    if (active) {
      await tx.update(jobs).set({ status: "failed", error: "interrupted", finishedAt: now(), updatedAt: now() }).where(eq(jobs.id, active.id));
    }
    const input: KitInput = { mediaIds: ids, locale: opts.locale, format: opts.format ?? KIT_PRINT_FORMAT, steps, runStartedAt: iso() };
    const [row] = await tx
      .insert(jobs)
      .values({
        restaurantId: opts.restaurantId,
        kind: KIT_JOB_KIND,
        status: "running",
        steps: Object.fromEntries(steps.map((k) => [k, { status: "pending" } satisfies KitStepState])),
        input: input as unknown as Record<string, unknown>,
        result: {},
        createdBy: opts.userId,
      })
      .returning({ id: jobs.id });
    return { jobId: row.id, existing: false };
  });

  if (!res.existing) {
    await audit({ restaurantId: opts.restaurantId, userId: opts.userId, action: "kit.start", entityType: "job", entityId: res.jobId, data: { steps, files: ids?.length ?? null } });
    launch(res.jobId, opts.userId, steps);
  }
  return res;
}

/** Re-runs a failed step (or all failed steps) plus whatever it needs / what depends on it and is not done. */
export async function retryKitJob(opts: { restaurantId: string; userId: string; jobId: string; step?: KitStepKey }): Promise<void> {
  const j = await getKitJobRow(opts.restaurantId, opts.jobId);
  // still busy in this process (e.g. a run that exceeded the time limit is finishing) → wait
  if (isActiveStatus(j.status) || running.has(j.id)) throw new AppError("validation", "kitRunning");
  const steps = stepsOf(j);
  const planned = KIT_STEPS.filter((k) => steps[k]);
  const notDone = (k: KitStepKey) => steps[k] && steps[k].status !== "done" && steps[k].status !== "skipped";
  const seeds = opts.step ? [opts.step] : planned.filter((k) => steps[k].status === "failed");
  if (!seeds.length || seeds.some((k) => !steps[k])) throw new AppError("validation", "step");

  const set = new Set<KitStepKey>();
  const up = (k: KitStepKey) => {
    if (set.has(k)) return;
    set.add(k);
    for (const d of DEPS[k].hard) if (notDone(d)) up(d);
  };
  seeds.forEach(up);
  // dependents that failed because of this step
  let grew = true;
  while (grew) {
    grew = false;
    for (const k of planned)
      if (!set.has(k) && notDone(k) && [...DEPS[k].hard, ...DEPS[k].soft].some((d) => set.has(d))) {
        set.add(k);
        grew = true;
      }
  }
  const toRun = planned.filter((k) => set.has(k));
  const patch = Object.fromEntries(toRun.map((k) => [k, { status: "pending" } satisfies KitStepState]));
  const [u] = await db
    .update(jobs)
    .set({
      status: "running",
      error: null,
      finishedAt: null,
      steps: sql`${jobs.steps} || ${JSON.stringify(patch)}::jsonb`,
      input: sql`${jobs.input} || ${JSON.stringify({ runStartedAt: iso() })}::jsonb`,
      updatedAt: now(),
    })
    .where(and(eq(jobs.id, j.id), sql`${jobs.status} not in ('queued', 'running')`))
    .returning({ id: jobs.id });
  if (!u) throw new AppError("validation", "kitRunning");
  await audit({ restaurantId: opts.restaurantId, userId: opts.userId, action: "kit.retry", entityType: "job", entityId: j.id, data: { steps: toRun } });
  launch(j.id, opts.userId, toRun);
}

function launch(jobId: string, userId: string, steps: KitStepKey[]) {
  if (running.has(jobId)) return;
  running.add(jobId);
  void execute(jobId, userId, steps)
    .catch(async (e) => {
      console.error("[kit] job crashed", jobId, e);
      await db
        .update(jobs)
        .set({ status: "failed", error: e instanceof AppError ? e.code : "unexpected", finishedAt: now(), updatedAt: now() })
        .where(eq(jobs.id, jobId))
        .catch(() => {});
    })
    .finally(() => running.delete(jobId));
}

// ------------------------------------------------------------------ execution

type RunCtx = {
  jobId: string;
  restaurantId: string;
  userId: string;
  input: KitInput;
  result: KitResult;
  /** in-memory only: model parts of the page renders (reference images for theme + print). */
  referenceImages?: ContentPart[];
};

type StepOutcome = { result?: Partial<KitResult>; detail?: unknown; status?: "done" | "skipped" };

const errorCode = (e: unknown) => (e instanceof AppError ? e.code : e instanceof Error && /not implemented/.test(e.message) ? "notAvailable" : "unexpected");

async function execute(jobId: string, userId: string, keys: KitStepKey[]) {
  const job = await loadJob(jobId);
  if (!job) return;
  const ctx: RunCtx = { jobId, restaurantId: job.restaurantId, userId, input: kitInput(job), result: { ...kitResult(job) } };
  const initial = stepsOf(job);
  const toRun = new Set(keys);
  const heartbeat = setInterval(() => {
    void db.update(jobs).set({ updatedAt: now() }).where(eq(jobs.id, jobId)).catch(() => {});
  }, HEARTBEAT_MS);

  const memo = new Map<KitStepKey, Promise<boolean>>();
  const exec = (k: KitStepKey): Promise<boolean> => {
    let p = memo.get(k);
    if (p) return p;
    p = (async () => {
      if (!toRun.has(k)) return !initial[k] || initial[k].status === "done" || initial[k].status === "skipped";
      const hard = await Promise.all(DEPS[k].hard.filter((d) => initial[d] || toRun.has(d)).map(exec));
      await Promise.all(DEPS[k].soft.filter((d) => initial[d] || toRun.has(d)).map(exec));
      if (hard.some((ok) => !ok)) {
        await setStep(jobId, k, { status: "failed", error: "dependency", finishedAt: iso() });
        return false;
      }
      const startedAt = iso();
      await setStep(jobId, k, { status: "running", startedAt });
      try {
        const out = await STEP_HANDLERS[k](ctx);
        if (out.result) {
          Object.assign(ctx.result, out.result);
          await patchResult(jobId, out.result);
        }
        await setStep(jobId, k, { status: out.status ?? "done", ...(out.detail !== undefined ? { detail: out.detail } : {}), startedAt, finishedAt: iso() });
        return true;
      } catch (e) {
        const code = errorCode(e);
        if (code === "unexpected" || code === "aiFailed") console.error(`[kit] step ${k} failed`, e);
        await setStep(jobId, k, { status: "failed", error: code, ...(e instanceof AppError && e.detail ? { detail: e.detail.slice(0, 300) } : {}), startedAt, finishedAt: iso() });
        return false;
      }
    })();
    memo.set(k, p);
    return p;
  };

  try {
    await Promise.all(KIT_STEPS.filter((k) => toRun.has(k)).map(exec));
  } finally {
    clearInterval(heartbeat);
  }
  const fresh = await loadJob(jobId);
  if (!fresh) return;
  const failed = Object.values(stepsOf(fresh)).some((s) => s.status === "failed");
  const status: KitJobStatus = failed ? "failed" : "done";
  await db
    .update(jobs)
    .set({ status, error: failed ? "partial" : null, finishedAt: now(), updatedAt: now() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "running")));
}

// ------------------------------------------------------------------ steps

const mediaIdsOf = (ctx: RunCtx) => {
  const ids = ctx.result.mediaIds ?? [];
  if (!ids.length) throw new AppError("validation", "noSources");
  return ids;
};

async function referenceParts(ctx: RunCtx) {
  if (ctx.referenceImages) return ctx.referenceImages;
  const pages = ctx.result.pageMediaIds ?? [];
  if (pages.length) {
    try {
      ctx.referenceImages = (await mediaToParts(ctx.restaurantId, pages.slice(0, MAX_REFERENCE_IMAGES), { allowPdf: false })).imageParts;
      return ctx.referenceImages;
    } catch (e) {
      console.warn("[kit] page renders unusable as references", e);
    }
  }
  // no renders: photos of the menu still work as references (PDFs are represented by the brief only)
  const files = await mediaToParts(ctx.restaurantId, mediaIdsOf(ctx).slice(0, 6), { allowPdf: true }).catch(() => null);
  ctx.referenceImages = files?.imageParts.slice(0, MAX_REFERENCE_IMAGES) ?? [];
  return ctx.referenceImages;
}

const themeExists = async (restaurantId: string, id: string | undefined) => {
  if (!id) return false;
  const [t] = await db.select({ id: themes.id }).from(themes).where(and(eq(themes.id, id), eq(themes.restaurantId, restaurantId))).limit(1);
  return !!t;
};

const STEP_HANDLERS: Record<KitStepKey, (ctx: RunCtx) => Promise<StepOutcome>> = {
  async sources(ctx) {
    const ids = ctx.input.mediaIds?.length ? await setSourceDocuments(ctx.restaurantId, ctx.input.mediaIds, "replace") : await getSourceDocuments(ctx.restaurantId);
    const mediaIds = ids.slice(0, KIT_MAX_FILES);
    if (!mediaIds.length) throw new AppError("validation", "noSources");
    return { result: { mediaIds }, detail: { files: mediaIds.length } };
  },

  async pages(ctx) {
    const pages = await getPageImages(ctx.restaurantId, mediaIdsOf(ctx), { maxPages: MAX_PAGES, userId: ctx.userId });
    return { result: { pageMediaIds: pages.map((p) => p.mediaId) }, detail: { pages: pages.length } };
  },

  async import(ctx) {
    let importId = ctx.result.importId;
    if (importId) {
      const [row] = await db.select({ status: menuImports.status, result: menuImports.result }).from(menuImports).where(eq(menuImports.id, importId)).limit(1);
      if (row && (row.status === "ready" || row.status === "applied")) return { detail: { items: countDraftItems(row.result as ImportDraft | null) } };
      if (!row || row.status === "discarded") importId = undefined;
    }
    importId ??= await createImport(ctx.restaurantId, ctx.userId, mediaIdsOf(ctx));
    await patchResult(ctx.jobId, { importId });
    ctx.result.importId = importId;
    const dto = await runExtraction(ctx.restaurantId, ctx.userId, importId, ctx.input.locale);
    if (dto.status !== "ready") throw new AppError(dto.error === "empty" ? "importEmpty" : "aiFailed", dto.error ?? undefined);
    return { result: { importId, itemCount: dto.itemCount }, detail: { items: dto.itemCount } };
  },

  async logo(ctx) {
    if (ctx.result.logoMediaId) return { detail: { found: true } };
    const res = await extractLogo({ restaurantId: ctx.restaurantId, userId: ctx.userId, mediaIds: mediaIdsOf(ctx), apply: true });
    if (!res) return { result: { logoMediaId: null }, detail: { found: false } };
    return { result: { logoMediaId: res.mediaId, logoApplied: res.applied, logoConfidence: res.confidence }, detail: { found: true, applied: res.applied } };
  },

  async brief(ctx) {
    if (ctx.result.brief) return { detail: { reused: true } };
    const pages = ctx.result.pageMediaIds ?? [];
    // page renders (PNG) when available: same pixels for every model, no PDF parsing on the provider side
    const files = pages.length
      ? await mediaToParts(ctx.restaurantId, pages.slice(0, 6), { allowPdf: false })
      : await mediaToParts(ctx.restaurantId, mediaIdsOf(ctx).slice(0, 6), { allowPdf: true });
    ctx.referenceImages = files.imageParts.slice(0, MAX_REFERENCE_IMAGES);
    const { brief, model } = await analyzeDesignFiles({ restaurantId: ctx.restaurantId, userId: ctx.userId, mediaIds: [], locale: ctx.input.locale, files, kind: "menu" });
    return { result: { brief, briefMediaIds: mediaIdsOf(ctx), briefModel: model } };
  },

  async theme(ctx) {
    if (await themeExists(ctx.restaurantId, ctx.result.themeId)) return { detail: { reused: true } };
    const res = await generateTheme({
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      locale: ctx.input.locale,
      brief: ctx.result.brief,
      referenceImages: await referenceParts(ctx),
      origin: "ai_file",
    });
    await audit({
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      action: "theme.ai.generate",
      entityType: "theme",
      entityId: res.themeId,
      data: { origin: "ai_file", via: "kit", jobId: ctx.jobId, model: res.model, repaired: res.repaired, bytes: res.bytes, warnings: res.warnings.slice(0, 10) },
    });
    return { result: { themeId: res.themeId, themeVersionId: res.versionId, themeSummary: res.summary } };
  },

  async print(ctx) {
    if (await themeExists(ctx.restaurantId, ctx.result.printThemeId)) return { detail: { reused: true } };
    const format = ctx.input.format ?? KIT_PRINT_FORMAT;
    const res = await generatePrintTheme({
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      locale: ctx.input.locale,
      format,
      brief: ctx.result.brief,
      referenceImages: await referenceParts(ctx),
      origin: "ai_file",
    });
    await audit({
      restaurantId: ctx.restaurantId,
      userId: ctx.userId,
      action: "theme.ai.generate",
      entityType: "theme",
      entityId: res.themeId,
      data: { kind: "print", format, origin: "ai_file", via: "kit", jobId: ctx.jobId, model: res.model, repaired: res.repaired, bytes: res.bytes, warnings: res.warnings.slice(0, 10) },
    });
    return { result: { printThemeId: res.themeId, printVersionId: res.versionId, printSummary: res.summary } };
  },
};

/** Exposed for scripts/tests. */
export const __test = { DEPS, isStale, running };
