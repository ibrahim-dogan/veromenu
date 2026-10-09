import { clientIp, rateLimit } from "@/core/http/rate-limit";
import { getPublicOrder } from "@/modules/ordering/service";

/**
 * GET /api/public/orders/{publicId} (guest status polling, no auth)
 * → {publicId, number, status, totalCents, currency, createdAt, items:[{name, variant, quantity, unitPriceCents}], rejectReason}
 */
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function GET(req: Request, { params }: RouteContext<"/api/public/orders/[publicId]">) {
  const { publicId } = await params;
  if (!rateLimit(`orders:status:${clientIp(req.headers)}`, 240, 60_000)) return json({ error: "rate_limited" }, 429);
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(publicId)) return json({ error: "invalid" }, 404);
  const order = await getPublicOrder(publicId);
  if (!order) return json({ error: "invalid" }, 404);
  return json(order);
}
