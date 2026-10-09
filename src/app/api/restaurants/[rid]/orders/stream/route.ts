import { getRestaurantContext } from "@/core/auth/guards";
import { subscribe } from "@/core/events";
import { ORDER_CHANNEL } from "@/modules/ordering/service";

/**
 * GET /api/restaurants/[rid]/orders/stream – Server-Sent Events for the staff order board.
 * Emits `event: order` with {type, id} for this restaurant; heartbeat comment every 25 s.
 * Backed by Postgres LISTEN/NOTIFY, so it works across several app instances.
 */
const HEARTBEAT_MS = 25_000;

export async function GET(req: Request, { params }: RouteContext<"/api/restaurants/[rid]/orders/stream">) {
  const { rid } = await params;
  const ctx = await getRestaurantContext(rid);
  if (!ctx) return new Response("unauthorized", { status: 401 });
  if (!ctx.can("orders.view")) return new Response("forbidden", { status: 403 });

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup?.();
        }
      };
      let unlisten: (() => Promise<void>) | null = null;
      const heartbeat = setInterval(() => send(`: ping ${Date.now()}\n\n`), HEARTBEAT_MS);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        req.signal.removeEventListener("abort", onAbort);
        unlisten?.().catch(() => {});
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const onAbort = () => cleanup?.();
      req.signal.addEventListener("abort", onAbort);

      send(`retry: 5000\nevent: ready\ndata: {}\n\n`);
      try {
        unlisten = await subscribe(ORDER_CHANNEL, (e) => {
          if (e.restaurantId !== rid) return;
          send(`event: order\ndata: ${JSON.stringify({ type: e.type, id: e.id ?? null })}\n\n`);
        });
        // The client may have gone away while we were subscribing.
        if (closed || req.signal.aborted) {
          const u = unlisten;
          unlisten = null;
          await u().catch(() => {});
          cleanup();
        }
      } catch (err) {
        console.error("[orders/stream] subscribe failed", err);
        cleanup();
      }
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
