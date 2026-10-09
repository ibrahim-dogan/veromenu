import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/core/db";
import { categories, items, restaurants, tables } from "@/core/db/schema";
import { clientIp, rateLimit } from "@/core/http/rate-limit";
import { trackEvent } from "@/modules/analytics/track";
import { isBotUserAgent } from "@/modules/analytics/bots";

/**
 * Cookie-less guest analytics beacon (navigator.sendBeacon from the guest menu).
 * POST {slug, type, itemId?, categoryId?, locale?, tableToken?} → 204. Validates that ids belong to the restaurant.
 * menu_view / qr_scan are tracked server-side by the page, order_placed by the order API.
 */
const schema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  type: z.enum(["item_view", "category_view", "locale_switch", "cart_add"]),
  itemId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  locale: z.string().regex(/^[a-z]{2,3}$/).optional(),
  tableToken: z.string().regex(/^[A-Za-z0-9_-]{4,128}$/).optional(),
});

const noContent = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
const bad = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const h = req.headers;
  if (isBotUserAgent(h.get("user-agent"))) return noContent();
  const ip = clientIp(h);
  if (!rateLimit(`ev:${ip}`, 240, 60_000)) return bad(429, "rate_limited");

  const raw = await req.text();
  if (raw.length > 2048) return bad(413, "invalid");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return bad(400, "invalid");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return bad(400, "invalid");
  const e = parsed.data;
  if (e.type === "item_view" || e.type === "cart_add") {
    if (!e.itemId) return bad(400, "invalid");
  }
  if (e.type === "category_view" && !e.categoryId) return bad(400, "invalid");
  // one event of a kind per entity and visitor-ish key per 10 s (double taps, scrollspy flicker)
  if (!rateLimit(`ev:${ip}:${e.slug}:${e.type}:${e.itemId ?? e.categoryId ?? e.locale ?? ""}`, 3, 10_000)) return noContent();

  const [r] = await db
    .select({ id: restaurants.id, status: restaurants.status, enabledLocales: restaurants.enabledLocales, defaultLocale: restaurants.defaultLocale })
    .from(restaurants)
    .where(eq(restaurants.slug, e.slug))
    .limit(1);
  if (!r || r.status !== "active") return bad(404, "invalid");

  const [itemOk, catOk, table] = await Promise.all([
    e.itemId
      ? db.select({ id: items.id }).from(items).where(and(eq(items.id, e.itemId), eq(items.restaurantId, r.id))).limit(1).then((x) => x.length > 0)
      : Promise.resolve(true),
    e.categoryId
      ? db
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.id, e.categoryId), eq(categories.restaurantId, r.id)))
          .limit(1)
          .then((x) => x.length > 0)
      : Promise.resolve(true),
    e.tableToken
      ? db
          .select({ id: tables.id })
          .from(tables)
          .where(and(eq(tables.token, e.tableToken), eq(tables.restaurantId, r.id)))
          .limit(1)
          .then((x) => x[0])
      : Promise.resolve(undefined),
  ]);
  if (!itemOk || !catOk) return bad(422, "invalid");

  const allowed = new Set([r.defaultLocale, ...r.enabledLocales]);
  const locale = e.locale && allowed.has(e.locale) ? e.locale : null;
  if (e.type === "locale_switch" && !locale) return bad(422, "invalid");

  const headersCopy = new Headers(h);
  after(() =>
    trackEvent({
      restaurantId: r.id,
      type: e.type,
      headers: headersCopy,
      tableId: table?.id ?? null,
      itemId: e.itemId ?? null,
      categoryId: e.categoryId ?? null,
      locale,
    }),
  );
  return noContent();
}
