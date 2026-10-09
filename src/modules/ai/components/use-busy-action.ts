"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/core/http/action";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/components/use-action";

/**
 * `useAction` + a `pending` flag that covers the whole server-action call (not only the refresh)
 * and a network/timeout guard – AI calls can take a minute and must never leave the UI stuck.
 */
export function useBusyAction<I, O>(
  fn: (input: I) => Promise<ActionResult<O>>,
  opts: { success?: string; refresh?: boolean; onSuccess?: (data: O) => void } = {},
) {
  const te = useTranslations("errors");
  const inner = useAction(fn, opts);
  const [busy, setBusy] = useState(false);

  async function run(input: I): Promise<ActionResult<O>> {
    setBusy(true);
    try {
      return await inner.run(input);
    } catch (e) {
      console.error(e);
      toast.error(te("unexpected"));
      return { ok: false, error: "unexpected" };
    } finally {
      setBusy(false);
    }
  }
  return { run, pending: busy || inner.pending, fieldErrors: inner.fieldErrors };
}
