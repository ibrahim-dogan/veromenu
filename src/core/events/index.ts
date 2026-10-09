import "server-only";
import { sql } from "@/core/db";

/**
 * Realtime events via Postgres LISTEN/NOTIFY → works with multiple app instances.
 * Channel names: "vm_orders" (payload: {restaurantId, orderId, type}).
 */
export type RealtimeEvent = { restaurantId: string; type: string; id?: string };

export async function publish(channel: string, event: RealtimeEvent) {
  await sql.notify(channel, JSON.stringify(event));
}

/** Returns an unsubscribe function. */
export async function subscribe(channel: string, onEvent: (e: RealtimeEvent) => void) {
  const { unlisten } = await sql.listen(channel, (payload) => {
    try {
      onEvent(JSON.parse(payload));
    } catch {
      /* ignore malformed */
    }
  });
  return unlisten;
}
