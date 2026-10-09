import { getRestaurantContext } from "@/core/auth/guards";
import type { OrderStatus } from "@/core/db/schema";
import { listBoardOrders, listOrderHistory } from "@/modules/ordering/service";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const STATUSES: OrderStatus[] = ["pending", "accepted", "preparing", "ready", "served", "rejected", "cancelled"];

/**
 * GET /api/restaurants/[rid]/orders?scope=board                      → { orders: BoardOrder[] }
 * GET /api/restaurants/[rid]/orders?scope=history&range=today|7d&status=&table=
 * Used by the staff board (refresh after SSE events + polling fallback) and the history tab.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/orders">) {
  const { rid } = await params;
  const ctx = await getRestaurantContext(rid);
  if (!ctx) return json({ error: "unauthorized" }, 401);
  if (!ctx.can("orders.view")) return json({ error: "forbidden" }, 403);

  const url = new URL(req.url);
  if (url.searchParams.get("scope") === "history") {
    const status = url.searchParams.get("status") as OrderStatus | null;
    const table = url.searchParams.get("table");
    const orders = await listOrderHistory(rid, ctx.restaurant.timezone, {
      range: url.searchParams.get("range") === "7d" ? "7d" : "today",
      status: status && STATUSES.includes(status) ? status : null,
      tableId: table && /^[0-9a-f-]{36}$/i.test(table) ? table : null,
    });
    return json({ orders });
  }
  return json({ orders: await listBoardOrders(rid), serverTime: new Date().toISOString() });
}
