import "server-only";
import type { AnalyticsEventType } from "@/core/db/schema";

/**
 * CONTRACT (owned by the guest module): records a cookie-less analytics event.
 * visitorHash = sha256(ip + user-agent + restaurantId + daily salt), never stores raw IP/UA.
 */
export async function trackEvent(_e: {
  restaurantId: string;
  type: AnalyticsEventType;
  headers: Headers;
  tableId?: string | null;
  itemId?: string | null;
  categoryId?: string | null;
  locale?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {}
