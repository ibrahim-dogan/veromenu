import { z } from "zod";
import { clientIp, rateLimit } from "@/core/http/rate-limit";
import { placeOrder, PublicOrderError } from "@/modules/ordering/service";

/**
 * POST /api/public/orders  (guest menu, no auth)
 * body {slug, tableToken?, locale, note?, items:[{itemId, variantId?, quantity 1..50, note?}]}
 * → 201 {publicId, number, status, totalCents} | 4xx {error: ordering_disabled|table_required|item_unavailable|invalid|rate_limited}
 */
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const body = z.object({
  slug: z.string().trim().min(1).max(80),
  tableToken: z.string().trim().max(64).nullish(),
  locale: z.string().trim().min(2).max(10),
  note: z.string().max(1000).nullish(),
  items: z
    .array(
      z.object({
        itemId: uuid,
        variantId: uuid.nullish(),
        quantity: z.number().int().min(1).max(50),
        note: z.string().max(500).nullish(),
      }),
    )
    .min(1)
    .max(50),
});

const json = (data: unknown, status: number) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`orders:place:${ip}`, 30, 10 * 60_000)) return json({ error: "rate_limited" }, 429);

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > 64_000) return json({ error: "invalid" }, 413);
    raw = JSON.parse(text);
  } catch {
    return json({ error: "invalid" }, 400);
  }
  const parsed = body.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid" }, 400);

  try {
    const order = await placeOrder(parsed.data, req.headers);
    return json(order, 201);
  } catch (e) {
    if (e instanceof PublicOrderError) return json({ error: e.code }, e.status);
    console.error("[api/public/orders]", e);
    return json({ error: "invalid" }, 500);
  }
}
