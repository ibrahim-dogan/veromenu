"use client";
import * as React from "react";
import type { BoardOrder } from "../service";

export type FeedState = "connecting" | "live" | "polling";

/**
 * Keeps the board orders fresh: SSE (`/orders/stream`) triggers a refetch of `/orders?scope=board`;
 * when the stream is down it falls back to polling every 10 s (plus a 60 s safety refresh when live).
 */
export function useOrderFeed(restaurantId: string, initial: BoardOrder[], onNew: (orders: BoardOrder[]) => void) {
  const [orders, setOrders] = React.useState(initial);
  const [state, setState] = React.useState<FeedState>("connecting");
  const known = React.useRef(new Set(initial.map((o) => o.id)));
  const onNewRef = React.useRef(onNew);
  React.useEffect(() => {
    onNewRef.current = onNew;
  });

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/restaurants/${restaurantId}/orders?scope=board`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { orders: BoardOrder[] };
      const fresh = data.orders.filter((o) => !known.current.has(o.id));
      data.orders.forEach((o) => known.current.add(o.id));
      setOrders(data.orders);
      if (fresh.length) onNewRef.current(fresh);
    } catch {
      /* offline – next tick */
    }
  }, [restaurantId]);

  // SSE
  React.useEffect(() => {
    if (typeof EventSource === "undefined") return; // stays "connecting" → 10 s polling
    let timer: ReturnType<typeof setTimeout> | null = null;
    const es = new EventSource(`/api/restaurants/${restaurantId}/orders/stream`);
    es.addEventListener("ready", () => {
      setState("live");
      void refresh(); // catch up on anything missed while reconnecting
    });
    es.addEventListener("order", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 250);
    });
    es.onerror = () => setState(es.readyState === EventSource.CLOSED ? "polling" : "connecting");
    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [restaurantId, refresh]);

  // Polling fallback / safety net
  React.useEffect(() => {
    const ms = state === "live" ? 60_000 : 10_000;
    const id = setInterval(() => void refresh(), ms);
    return () => clearInterval(id);
  }, [state, refresh]);

  // Refresh when the tablet wakes up / tab becomes visible again
  React.useEffect(() => {
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  return { orders, setOrders, state, refresh };
}

const SOUND_KEY = "vm_order_sound";
const SOUND_EVENT = "vm-order-sound";
function readSound() {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}
function subscribeSound(cb: () => void) {
  window.addEventListener(SOUND_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SOUND_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Short two-tone chime via WebAudio (no asset needed). Preference stored per device. */
export function useChime() {
  const ctxRef = React.useRef<AudioContext | null>(null);
  const enabled = React.useSyncExternalStore(subscribeSound, readSound, () => false);

  const ensure = React.useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // Browsers only allow audio after a user gesture → unlock on first interaction.
  React.useEffect(() => {
    if (!enabled) return;
    const unlock = () => ensure();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [enabled, ensure]);

  const play = React.useCallback(() => {
    if (!enabled) return;
    const ctx = ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.5);
    });
  }, [enabled, ensure]);

  const toggle = React.useCallback(() => {
    try {
      localStorage.setItem(SOUND_KEY, readSound() ? "0" : "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(SOUND_EVENT));
    ensure();
  }, [ensure]);

  return { enabled, toggle, play };
}

/** Prefixes the document title with the number of new orders, e.g. "(2) Bestellungen". */
export function useTitleBadge(count: number) {
  const base = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (base.current === null) base.current = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = count > 0 ? `(${count}) ${base.current}` : base.current;
  }, [count]);
  React.useEffect(
    () => () => {
      if (base.current !== null) document.title = base.current;
    },
    [],
  );
}

/** Re-renders every `ms` so age timers stay current. */
export function useNow(ms = 15_000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
