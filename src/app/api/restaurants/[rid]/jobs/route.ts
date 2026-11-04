import { getRestaurantContext } from "@/core/auth/guards";
import { findRunningJob } from "@/core/jobs/background";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KIND = /^[a-z_]{2,40}$/;
const NO_STORE = { "cache-control": "private, no-store" };

/**
 * GET /api/restaurants/[rid]/jobs?kinds=a,b → { ok, data: JobStatusDto | null }
 * The current user's running background job of one of the kinds – lets a page resume its progress UI after a reload.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/jobs">) {
  const { rid } = await params;
  if (!UUID.test(rid)) return Response.json({ ok: false, error: "notFound" }, { status: 404, headers: NO_STORE });
  const ctx = await getRestaurantContext(rid);
  if (!ctx) return Response.json({ ok: false, error: "forbidden" }, { status: 401, headers: NO_STORE });
  const kinds = (new URL(req.url).searchParams.get("kinds") ?? "").split(",").filter((k) => KIND.test(k)).slice(0, 10);
  return Response.json({ ok: true, data: await findRunningJob(rid, ctx.user.id, kinds) }, { headers: NO_STORE });
}
