import { getRestaurantContext } from "@/core/auth/guards";
import { toActionError } from "@/core/http/action";
import { getKitDto } from "@/modules/kit/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "cache-control": "private, no-store" };
const STATUS: Record<string, number> = { forbidden: 403, notFound: 404, validation: 400 };

/**
 * GET /api/restaurants/[rid]/jobs/[jobId] → { ok, data: KitJobDto } – polled by the onboarding / kit review screen.
 * Session + membership; the kit is a menu-editing feature (menu.edit or ai.use).
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/restaurants/[rid]/jobs/[jobId]">) {
  const { rid, jobId } = await params;
  if (!UUID.test(rid) || !UUID.test(jobId)) return Response.json({ ok: false, error: "notFound" }, { status: 404, headers: NO_STORE });
  try {
    const ctx = await getRestaurantContext(rid);
    if (!ctx) return Response.json({ ok: false, error: "forbidden" }, { status: 401, headers: NO_STORE });
    if (!ctx.can("menu.edit") && !ctx.can("ai.use")) return Response.json({ ok: false, error: "forbidden" }, { status: 403, headers: NO_STORE });
    return Response.json({ ok: true, data: await getKitDto(rid, jobId) }, { headers: NO_STORE });
  } catch (e) {
    const r = toActionError(e);
    return Response.json(r, { status: STATUS[r.error] ?? 500, headers: NO_STORE });
  }
}
