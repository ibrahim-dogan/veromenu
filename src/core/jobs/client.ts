import type { ActionResult } from "@/core/http/action";
import type { JobRef, JobStatusDto } from "./background";

/**
 * Client side of background jobs (see ./background.ts). Only short GET requests – safe behind Cloudflare's 100 s limit.
 *   const generate = viaJob(generateThemeFromPrompt);          // same signature as a normal action, resolves when done
 *   const { run, pending } = useAction(generate, { … });
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls a job until it is done or failed and maps it to an ActionResult. Tolerates short network/proxy hiccups. */
export async function pollJob<R>(restaurantId: string, jobId: string, opts: { signal?: AbortSignal } = {}): Promise<ActionResult<R>> {
  let delay = 1500;
  let failures = 0;
  for (;;) {
    await sleep(delay);
    if (opts.signal?.aborted) return { ok: false, error: "cancelled" };
    delay = Math.min(Math.round(delay * 1.25), 4000);
    let res: Response;
    try {
      res = await fetch(`/api/restaurants/${restaurantId}/jobs/${jobId}`, { cache: "no-store", signal: opts.signal });
    } catch {
      if (opts.signal?.aborted) return { ok: false, error: "cancelled" };
      if (++failures > 30) return { ok: false, error: "unexpected" };
      continue;
    }
    if (res.status >= 500 || res.status === 429) {
      if (++failures > 30) return { ok: false, error: "unexpected" };
      continue;
    }
    failures = 0;
    const body = (await res.json().catch(() => null)) as { ok: boolean; data?: JobStatusDto; error?: string } | null;
    if (!body?.ok || !body.data) return { ok: false, error: body?.error ?? "unexpected" };
    const job = body.data;
    if (job.status === "done") return { ok: true, data: job.data as R };
    if (job.status === "failed") return { ok: false, error: job.error ?? "unexpected", detail: job.detail };
  }
}

/** Turns a job action (returns a JobRef) into a function with the normal action contract (resolves with the result). */
export function viaJob<I, R>(start: (input: I) => Promise<ActionResult<JobRef<R>>>): (input: I) => Promise<ActionResult<R>> {
  return async (input: I) => {
    const res = await start(input);
    if (!res.ok) return res;
    return pollJob<R>(res.data.restaurantId, res.data.jobId);
  };
}

/** The current user's running job of one of `kinds` (to resume a progress UI after a reload), or null. */
export async function findRunningJob(restaurantId: string, kinds: string[]): Promise<JobStatusDto | null> {
  try {
    const res = await fetch(`/api/restaurants/${restaurantId}/jobs?kinds=${encodeURIComponent(kinds.join(","))}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok: boolean; data: JobStatusDto | null };
    return body.ok ? body.data : null;
  } catch {
    return null;
  }
}
