import "server-only";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/core/db";
import { jobs } from "@/core/db/schema";
import { action, toActionError } from "@/core/http/action";

/**
 * Background jobs for long AI work (single instance, in-process – same model as the menu kit runner).
 *
 * Why: production runs behind Cloudflare, which cuts every HTTP request after 100 s (524). Anything that can take
 * longer than ~60 s therefore must not run inside the request: the server action only validates, checks permissions,
 * captures request data (user, locale) and starts the work here; it returns a {@link JobRef} immediately. The client
 * polls GET /api/restaurants/[rid]/jobs/[jobId] (short requests) via `viaJob()` / `pollJob()` from `./client`.
 *
 * The job row survives a page reload: pages can look up the user's running job of a kind
 * (GET /api/restaurants/[rid]/jobs?kinds=…) and resume the progress UI.
 */

/** Opaque handle returned by a job action. `R` is the result type the client receives when the job is done. */
export type JobRef<R> = { jobId: string; restaurantId: string; readonly __result?: R };

export type JobStatusDto = {
  id: string;
  kind: string;
  status: "running" | "done" | "failed";
  /** Handler result (JSON – Dates arrive as ISO strings). */
  data?: unknown;
  error?: string;
  detail?: string;
  createdAt: string;
};

const HEARTBEAT_MS = 20_000;
/** No heartbeat for this long → the process died (deploy / restart) → the job counts as interrupted. */
const STALE_MS = 2 * 60_000;
/** Hard upper bound for a job (AI timeouts incl. fallback are far below). */
const MAX_RUNTIME_MS = 15 * 60_000;

const now = () => new Date();

/** Starts `work` in the background and returns its handle immediately. Never throws for failures of `work`. */
export async function startBackgroundJob<R>(
  opts: { restaurantId: string; userId: string; kind: string; input?: Record<string, unknown> },
  work: () => Promise<R>,
): Promise<JobRef<R>> {
  const [row] = await db
    .insert(jobs)
    .values({ restaurantId: opts.restaurantId, kind: opts.kind, status: "running", input: opts.input ?? {}, createdBy: opts.userId })
    .returning({ id: jobs.id });
  const jobId = row.id;
  const heartbeat = setInterval(() => {
    void db.update(jobs).set({ updatedAt: now() }).where(eq(jobs.id, jobId)).catch(() => {});
  }, HEARTBEAT_MS);
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("job timeout")), MAX_RUNTIME_MS).unref());

  void (async () => {
    try {
      const data = await Promise.race([work(), timeout]);
      // JSON round trip: the result is stored as jsonb and must look the same whether polled now or after a reload.
      const json = data === undefined ? null : JSON.parse(JSON.stringify(data));
      await db.update(jobs).set({ status: "done", result: { data: json }, finishedAt: now(), updatedAt: now() }).where(eq(jobs.id, jobId));
    } catch (e) {
      let err: { error: string; detail?: string };
      try {
        err = toActionError(e);
      } catch {
        err = { error: "unexpected" }; // redirect()/notFound() make no sense in a background job
      }
      await db
        .update(jobs)
        .set({ status: "failed", error: err.error, result: err.detail ? { detail: err.detail.slice(0, 500) } : {}, finishedAt: now(), updatedAt: now() })
        .where(eq(jobs.id, jobId))
        .catch((e2) => console.error("[jobs] could not store failure", e2));
    } finally {
      clearInterval(heartbeat);
    }
  })();

  return { jobId, restaurantId: opts.restaurantId };
}

/**
 * Server action that runs its work as a background job.
 * `prepare` runs inside the request: validate, check permissions, read cookies/locale – and return the work.
 *   export const generateX = jobAction("theme_prompt", schema, async (input) => {
 *     const ctx = await themeAiContext(input.restaurantId);
 *     const locale = await uiLocale();
 *     return { restaurantId: input.restaurantId, userId: ctx.user.id, run: () => generate({ ...input, locale }) };
 *   });
 */
export function jobAction<S extends z.ZodType, R>(
  kind: string | ((input: z.infer<S>) => string),
  schema: S,
  prepare: (input: z.infer<S>) => Promise<{ restaurantId: string; userId: string; run: () => Promise<R> }>,
) {
  return action(schema, async (input): Promise<JobRef<R>> => {
    const p = await prepare(input);
    return startBackgroundJob<R>({ restaurantId: p.restaurantId, userId: p.userId, kind: typeof kind === "function" ? kind(input) : kind }, p.run);
  });
}

type JobRow = typeof jobs.$inferSelect;

function toDto(r: JobRow): JobStatusDto {
  const stale = r.status === "running" && (now().getTime() - r.updatedAt.getTime() > STALE_MS || now().getTime() - r.createdAt.getTime() > MAX_RUNTIME_MS + STALE_MS);
  if (stale) {
    void db.update(jobs).set({ status: "failed", error: "interrupted", finishedAt: now() }).where(and(eq(jobs.id, r.id), eq(jobs.status, "running"))).catch(() => {});
    return { id: r.id, kind: r.kind, status: "failed", error: "interrupted", createdAt: r.createdAt.toISOString() };
  }
  const status = r.status === "done" ? "done" : r.status === "running" || r.status === "queued" ? "running" : "failed";
  const res = (r.result ?? {}) as { data?: unknown; detail?: string };
  return {
    id: r.id,
    kind: r.kind,
    status,
    data: status === "done" ? res.data : undefined,
    error: status === "failed" ? (r.error ?? "unexpected") : undefined,
    detail: status === "failed" ? res.detail : undefined,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Status of one of the user's own jobs (null if it does not exist or belongs to someone else). */
export async function getOwnJob(restaurantId: string, jobId: string, userId: string): Promise<JobStatusDto | null> {
  const [r] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.restaurantId, restaurantId), eq(jobs.createdBy, userId)))
    .limit(1);
  return r ? toDto(r) : null;
}

/** The user's most recent job of one of `kinds` that is still running (for resuming the UI after a reload). */
export async function findRunningJob(restaurantId: string, userId: string, kinds: string[]): Promise<JobStatusDto | null> {
  if (!kinds.length) return null;
  const rows = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.restaurantId, restaurantId),
        eq(jobs.createdBy, userId),
        inArray(jobs.kind, kinds),
        eq(jobs.status, "running"),
        gt(jobs.createdAt, new Date(Date.now() - MAX_RUNTIME_MS - STALE_MS)),
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  const dto = rows[0] ? toDto(rows[0]) : null;
  return dto?.status === "running" ? dto : null;
}
