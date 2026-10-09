"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/core/utils";
import { createGuestT, makePriceFormatter, type GuestMessages } from "../t";

type OrderStatusValue = "pending" | "accepted" | "preparing" | "ready" | "served" | "rejected" | "cancelled";
type PublicOrder = {
  publicId: string;
  number: number;
  status: OrderStatusValue;
  totalCents: number;
  currency: string;
  createdAt: string;
  items: { name: string; variant: string | null; quantity: number; unitPriceCents: number }[];
  rejectReason: string | null;
};

const STEPS: OrderStatusValue[] = ["pending", "accepted", "preparing", "ready", "served"];
const TERMINAL: OrderStatusValue[] = ["served", "rejected", "cancelled"];
const POLL_MS = 5000;

/** Live order status: polls GET /api/public/orders/{publicId} every 5 s (paused in background tabs). */
export function OrderStatus({ publicId, locale, messages }: { publicId: string; locale: string; messages: GuestMessages }) {
  const t = useMemo(() => createGuestT(messages), [messages]);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<"not_found" | "network" | null>(null);
  const prevStatus = useRef<OrderStatusValue | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let done = false;
    let first = true;
    async function poll() {
      if (stopped) return;
      // Always load once; afterwards pause polling while the tab is in the background.
      if (first || document.visibilityState === "visible") {
        first = false;
        try {
          const res = await fetch(`/api/public/orders/${encodeURIComponent(publicId)}`, { cache: "no-store" });
          if (res.status === 404) {
            setError("not_found");
            done = true;
          } else if (res.ok) {
            const o = (await res.json()) as PublicOrder;
            setOrder(o);
            setError(null);
            if (prevStatus.current && prevStatus.current !== o.status && o.status === "ready") navigator.vibrate?.([120, 80, 120]);
            prevStatus.current = o.status;
            if (TERMINAL.includes(o.status)) done = true;
          } else setError("network");
        } catch {
          setError("network");
        }
      }
      if (!done && !stopped) timer = setTimeout(poll, POLL_MS);
    }
    const onVisible = () => {
      if (document.visibilityState === "visible" && !done) {
        clearTimeout(timer);
        poll();
      }
    };
    poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [publicId]);

  if (error === "not_found")
    return (
      <div className="py-16 text-center">
        <h1 className="font-g-display text-2xl font-semibold">{t("orderNotFound")}</h1>
      </div>
    );

  if (!order)
    return (
      <div className="animate-pulse space-y-4 py-6" aria-busy="true" aria-label={t("loading")}>
        <div className="bg-g-text/10 mx-auto h-6 w-40 rounded" />
        <div className="bg-g-text/10 mx-auto h-24 w-32 rounded-xl" />
        <div className="bg-g-text/10 h-24 rounded-xl" />
      </div>
    );

  const price = makePriceFormatter(locale, order.currency || "EUR");
  const failed = order.status === "rejected" || order.status === "cancelled";
  const stepIdx = STEPS.indexOf(order.status);

  return (
    <div className="space-y-6">
      <header className="text-center">
        <h1 className="font-g-display text-2xl font-semibold">{t("orderTitle")}</h1>
        <p className="text-g-muted mt-4 text-sm font-semibold tracking-wide uppercase">{t("orderNumber")}</p>
        <p className="font-g-display text-g-primary text-7xl leading-none font-bold tabular-nums">{order.number}</p>
      </header>

      <section
        aria-live="polite"
        className={cn("rounded-[var(--g-radius)] border p-5 text-center", failed ? "border-red-300 bg-red-50 text-red-900" : "border-g-border bg-g-surface")}
      >
        <p className="text-xl font-semibold">{t(`orderStatus.${order.status}`)}</p>
        <p className={cn("mt-1 text-sm", failed ? "text-red-800" : "text-g-muted")}>{t(`orderStatusHint.${order.status}`)}</p>
        {failed && order.rejectReason && <p className="mt-2 text-sm">{t("rejectReason", { reason: order.rejectReason })}</p>}
        {!failed && (
          <ol className="mt-5 flex items-center justify-between gap-1" aria-label={t("orderProgress")}>
            {STEPS.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition-colors",
                    i < stepIdx && "bg-g-primary text-g-on-primary",
                    i === stepIdx && "bg-g-primary text-g-on-primary ring-g-primary/25 ring-4",
                    i > stepIdx && "bg-g-text/10 text-g-muted",
                  )}
                  aria-current={i === stepIdx ? "step" : undefined}
                >
                  {i < stepIdx ? <Check size={16} aria-hidden /> : i + 1}
                </span>
                <span className={cn("text-[11px] leading-tight", i === stepIdx ? "font-semibold" : "text-g-muted")}>{t(`orderStep.${s}`)}</span>
              </li>
            ))}
          </ol>
        )}
        {failed && <X size={28} className="mx-auto mt-3 text-red-700" aria-hidden />}
      </section>

      <section className="bg-g-surface border-g-border rounded-[var(--g-radius)] border p-5">
        <h2 className="font-semibold">{t("orderItems")}</h2>
        <ul className="divide-g-border mt-2 divide-y text-sm">
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 py-2">
              <span>
                <span className="font-semibold tabular-nums">{it.quantity}×</span> {it.name}
                {it.variant && <span className="text-g-muted"> · {it.variant}</span>}
              </span>
              <span className="tabular-nums">{price(it.unitPriceCents * it.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="border-g-border mt-2 flex justify-between border-t pt-3 font-semibold">
          <span>{t("total")}</span>
          <span className="tabular-nums">{price(order.totalCents)}</span>
        </div>
      </section>

      {!TERMINAL.includes(order.status) && (
        <p className="text-g-muted flex items-center justify-center gap-2 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="bg-g-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
            <span className="bg-g-primary relative inline-flex h-2 w-2 rounded-full" />
          </span>
          {error === "network" ? t("orderOffline") : t("statusAutoUpdate")}
        </p>
      )}
    </div>
  );
}
