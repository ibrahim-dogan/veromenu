"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/core/http/action";
import { toast } from "@/components/ui/toast";

/**
 * Client helper for server actions returning ActionResult.
 *   const { run, pending } = useAction(updateItem, { success: t("saved") });
 *   await run({ id, name });
 * Shows translated error toasts ("errors.<code>") and refreshes the route on success.
 */
export function useAction<I, O>(
  fn: (input: I) => Promise<ActionResult<O>>,
  opts: { success?: string; refresh?: boolean; onSuccess?: (data: O) => void } = {},
) {
  const t = useTranslations("errors");
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function run(input: I): Promise<ActionResult<O>> {
    setFieldErrors({});
    setRunning(true);
    let res: ActionResult<O>;
    try {
      res = await fn(input);
    } finally {
      setRunning(false);
    }
    if (res.ok) {
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(res.data);
      if (opts.refresh !== false) startTransition(() => router.refresh());
    } else {
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
      const msg = t.has(res.error) ? t(res.error) : t("unexpected");
      toast.error(res.detail && res.error === "unexpected" ? `${msg} (${res.detail.slice(0, 160)})` : msg);
    }
    return res;
  }
  return { run, pending: running || refreshing, fieldErrors };
}
