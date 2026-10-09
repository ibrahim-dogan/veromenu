"use client";
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Check, ChefHat, Clock, HandPlatter, MessageSquare, X, Zap } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn, formatPrice, toBcp47 } from "@/core/utils";
import { localeInfo } from "@/core/i18n/locales";
import type { OrderStatus } from "@/core/db/schema";
import type { BoardOrder } from "../service";

export const STATUS_TONE: Record<OrderStatus, "yellow" | "blue" | "purple" | "green" | "neutral" | "red"> = {
  pending: "yellow",
  accepted: "blue",
  preparing: "purple",
  ready: "green",
  served: "neutral",
  rejected: "red",
  cancelled: "red",
};

/** Next forward step for a status (main button on the card). */
const NEXT: Partial<Record<OrderStatus, { to: OrderStatus; key: string; icon: React.ReactNode }>> = {
  pending: { to: "accepted", key: "accept", icon: <Check size={16} aria-hidden /> },
  accepted: { to: "preparing", key: "startPreparing", icon: <ChefHat size={16} aria-hidden /> },
  preparing: { to: "ready", key: "markReady", icon: <Check size={16} aria-hidden /> },
  ready: { to: "served", key: "markServed", icon: <HandPlatter size={16} aria-hidden /> },
};
const BACK: Partial<Record<OrderStatus, OrderStatus>> = { preparing: "accepted", ready: "preparing", served: "ready" };

export function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

export function OrderCard({
  order,
  now,
  canManage,
  highlight,
  onStatus,
  onReject,
}: {
  order: BoardOrder;
  now: number;
  canManage: boolean;
  highlight?: boolean;
  onStatus: (o: BoardOrder, to: OrderStatus) => void;
  onReject: (o: BoardOrder) => void;
}) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const age = minutesSince(order.createdAt, now);
  const open = order.status !== "served";
  const late = open && age >= 20;
  const warn = open && age >= 10 && !late;
  const next = NEXT[order.status];
  const back = BACK[order.status];
  const lang = order.guestLocale ? localeInfo(order.guestLocale) : null;

  return (
    <article
      className={cn(
        "rounded-xl border bg-white shadow-sm transition-shadow",
        order.status === "pending" ? "border-amber-300" : "border-stone-200",
        highlight && "animate-pulse ring-2 ring-accent-400",
        order.status === "served" && "opacity-70",
      )}
      aria-label={t("card.aria", { number: order.number })}
    >
      <header className="flex items-start justify-between gap-2 border-b border-stone-100 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-lg font-semibold leading-tight text-stone-900">
            #{order.number}
            {order.autoAccepted && (
              <span title={t("card.autoAccepted")} className="text-accent-600">
                <Zap size={14} aria-label={t("card.autoAccepted")} />
              </span>
            )}
          </p>
          <p className="truncate text-sm font-medium text-stone-700">
            {order.tableLabel ?? <span className="text-stone-400">{t("card.noTable")}</span>}
            {order.tableArea && <span className="font-normal text-stone-400"> · {order.tableArea}</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            suppressHydrationWarning
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
              late ? "bg-red-50 text-red-700" : warn ? "bg-amber-50 text-amber-800" : "bg-stone-100 text-stone-600",
            )}
          >
            <Clock size={12} aria-hidden />
            {age < 1 ? t("card.justNow") : t("card.minutes", { count: age })}
          </span>
          {lang && lang.code !== "de" && (
            <span className="text-xs text-stone-400" title={lang.native}>
              {lang.flag} {lang.code.toUpperCase()}
            </span>
          )}
        </div>
      </header>

      <ul className="space-y-1.5 px-3.5 py-2.5">
        {order.items.map((it, i) => (
          <li key={i} className="text-sm">
            <div className="flex gap-2">
              <span className="min-w-6 font-semibold tabular-nums text-stone-900">{it.quantity}×</span>
              <span className="min-w-0 flex-1 text-stone-800">
                {it.name}
                {it.variant && <span className="text-stone-500"> ({it.variant})</span>}
              </span>
            </div>
            {it.note && <p className="ml-8 text-xs italic text-amber-800">„{it.note}“</p>}
          </li>
        ))}
      </ul>

      {order.guestNote && (
        <p className="mx-3.5 mb-2.5 flex gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          <MessageSquare size={13} className="mt-0.5 shrink-0" aria-hidden />
          <span>{order.guestNote}</span>
        </p>
      )}

      <footer className="flex items-center justify-between gap-2 border-t border-stone-100 px-3.5 py-2">
        <span className="text-sm font-semibold tabular-nums text-stone-900">
          {formatPrice(order.totalCents, toBcp47(locale), order.currency)}
        </span>
        {canManage && (
          <div className="flex items-center gap-1">
            {back && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onStatus(order, back)} title={t("actions.back")} aria-label={t("actions.back")}>
                <ArrowLeft size={15} aria-hidden />
              </Button>
            )}
            {(order.status === "pending" || order.status === "accepted") && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => onReject(order)} title={t("actions.reject")} aria-label={t("actions.reject")}>
                <X size={16} aria-hidden />
              </Button>
            )}
            {next && (
              <Button size="sm" variant={order.status === "pending" ? "accent" : "primary"} onClick={() => onStatus(order, next.to)}>
                {next.icon}
                {t(`actions.${next.key}`)}
              </Button>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("orders");
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}
