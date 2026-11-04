"use client";
import { useEffect, useRef } from "react";
import type { ActionResult } from "@/core/http/action";
import type { JobStatusDto } from "./background";
import { findRunningJob, pollJob } from "./client";

/**
 * After a reload: if the current user still has a running background job of one of `kinds` for this restaurant,
 * calls `onResume(job)` (show the progress UI again) and later `onDone(result, job)` when it finishes.
 */
export function useResumeJob<R>(
  restaurantId: string,
  kinds: string[],
  handlers: { onResume: (job: JobStatusDto) => void; onDone: (res: ActionResult<R>, job: JobStatusDto) => void },
  enabled = true,
) {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  const key = kinds.join(",");
  useEffect(() => {
    if (!enabled) return;
    const ac = new AbortController();
    void (async () => {
      const job = await findRunningJob(restaurantId, key.split(","));
      if (!job || ac.signal.aborted) return;
      ref.current.onResume(job);
      const res = await pollJob<R>(restaurantId, job.id, { signal: ac.signal });
      if (!ac.signal.aborted) ref.current.onDone(res, job);
    })();
    return () => ac.abort();
  }, [restaurantId, key, enabled]);
}
