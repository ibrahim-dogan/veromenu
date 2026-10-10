import "server-only";
/**
 * Route-handler wrapper for the Theme Studio read endpoints (GET /api/restaurants/[rid]/themes/…).
 * Same checks as the studio server actions (session + `theme.manage` + plan feature `theme_studio`) and the same
 * response body as ActionResult, so the client handles both identically (see lib/client.ts → studioGet).
 */
import { getRestaurantContext, type RestaurantContext } from "@/core/auth/guards";
import { toActionError } from "@/core/http/action";
import { planHas } from "@/modules/billing/plans";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | null | undefined): v is string => !!v && UUID.test(v);

const NO_STORE = { "cache-control": "private, no-store" };

export const studioError = (error: string, status: number, detail?: string) =>
  Response.json({ ok: false, error, ...(detail ? { detail } : {}) }, { status, headers: NO_STORE });

const STATUS: Record<string, number> = { forbidden: 403, featureNotInPlan: 403, notFound: 404, validation: 400 };

export async function studioRoute<T>(rid: string, handler: (ctx: RestaurantContext) => Promise<T>): Promise<Response> {
  if (!isUuid(rid)) return studioError("notFound", 404);
  try {
    const ctx = await getRestaurantContext(rid);
    if (!ctx) return studioError("forbidden", 401);
    if (!ctx.can("theme.manage")) return studioError("forbidden", 403);
    if (!planHas(ctx.restaurant.plan, "theme_studio")) return studioError("featureNotInPlan", 403);
    return Response.json({ ok: true, data: await handler(ctx) }, { headers: NO_STORE });
  } catch (e) {
    const r = toActionError(e);
    return Response.json(r, { status: STATUS[r.error] ?? 500, headers: NO_STORE });
  }
}
