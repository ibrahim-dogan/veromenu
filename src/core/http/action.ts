import "server-only";
import { z } from "zod";
import { AppError, ForbiddenError } from "./errors";

export { AppError, ForbiddenError };

/**
 * Uniform result for server actions. `error` is an i18n key in the "errors" namespace
 * (e.g. "forbidden", "validation", "planLimit") or a raw message for unexpected failures.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]>; detail?: string };

/**
 * Wrap a server action: validates input with zod, maps known errors to i18n keys.
 *   export const renameItem = action(z.object({...}), async (input) => { ... return data });
 */
export function action<S extends z.ZodType, R>(schema: S, handler: (input: z.infer<S>) => Promise<R>) {
  return async (input: z.input<S>): Promise<ActionResult<R>> => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path.join(".") || "_";
        (fieldErrors[k] ??= []).push(issue.message);
      }
      return { ok: false, error: "validation", fieldErrors };
    }
    try {
      return { ok: true, data: await handler(parsed.data) };
    } catch (e) {
      return toActionError(e);
    }
  };
}

export function toActionError(e: unknown): { ok: false; error: string; detail?: string } {
  if (e instanceof ForbiddenError) return { ok: false, error: "forbidden" };
  if (e instanceof AppError) return { ok: false, error: e.code, detail: e.detail };
  // Next.js redirect()/notFound() must propagate
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  console.error("[action]", e);
  return { ok: false, error: "unexpected", detail: e instanceof Error ? e.message : String(e) };
}
