import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/core/db";
import { analyticsEvents, type AnalyticsEventType } from "@/core/db/schema";
import { env } from "@/core/env";
import { clientIp } from "@/core/http/rate-limit";
import { isBotUserAgent } from "./bots";

export { isBotUserAgent };

let saltCache: { day: string; salt: string } | null = null;

/** Daily rotating salt derived from APP_SECRET (Berlin calendar day) → hashes can't be linked across days. */
function dailySalt(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (saltCache?.day === day) return saltCache.salt;
  const salt = createHash("sha256").update(`${env().APP_SECRET}:vm-analytics:${day}`).digest("hex");
  saltCache = { day, salt };
  return salt;
}

/** Non-reversible visitor id: sha256(ip + ua + restaurantId + daily salt). Raw IP / UA are never stored. */
export function visitorHash(h: Headers, restaurantId: string) {
  const ip = clientIp(h);
  const ua = h.get("user-agent") ?? "";
  return createHash("sha256").update(`${ip}|${ua}|${restaurantId}|${dailySalt()}`).digest("hex").slice(0, 32);
}

/**
 * CONTRACT (owned by the guest module): records a cookie-less analytics event.
 * visitorHash = sha256(ip + user-agent + restaurantId + daily salt), never stores raw IP/UA.
 * Bots are ignored. Never throws (analytics must not break a page or an order).
 */
export async function trackEvent(e: {
  restaurantId: string;
  type: AnalyticsEventType;
  headers: Headers;
  tableId?: string | null;
  itemId?: string | null;
  categoryId?: string | null;
  locale?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    if (isBotUserAgent(e.headers.get("user-agent"))) return;
    // Prefetches (link hover / speculation rules) are not views.
    const purpose = e.headers.get("sec-purpose") ?? e.headers.get("purpose") ?? "";
    if (/prefetch|prerender/i.test(purpose)) return;
    await db.insert(analyticsEvents).values({
      restaurantId: e.restaurantId,
      type: e.type,
      tableId: e.tableId ?? null,
      itemId: e.itemId ?? null,
      categoryId: e.categoryId ?? null,
      locale: e.locale ?? null,
      visitorHash: visitorHash(e.headers, e.restaurantId),
      meta: e.meta ?? null,
    });
  } catch (err) {
    console.error("[analytics] trackEvent failed", err);
  }
}
