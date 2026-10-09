"use client";
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, BellOff, Expand, Inbox, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button, Card, DataTable, EmptyState, Select, Td, Textarea, Th } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/components/use-action";
import { cn, formatPrice, toBcp47 } from "@/core/utils";
import type { OrderStatus } from "@/core/db/schema";
import type { BoardOrder } from "../service";
import { updateOrderStatusAction } from "../actions";
import { OrderCard, StatusBadge } from "./order-card";
import { useChime, useNow, useOrderFeed, useTitleBadge, type FeedState } from "./use-order-feed";

const COLUMNS = ["pending", "accepted", "preparing", "ready", "served"] as const;
type Column = (typeof COLUMNS)[number];

const COLUMN_STYLE: Record<Column, string> = {
  pending: "bg-amber-50/70 border-amber-200",
  accepted: "bg-sky-50/60 border-sky-200",
  preparing: "bg-violet-50/60 border-violet-200",
  ready: "bg-emerald-50/60 border-emerald-200",
  served: "bg-stone-100/70 border-stone-200",
};

export function OrdersView({
  restaurantId,
  initialOrders,
  canManage,
  tables,
}: {
  restaurantId: string;
  initialOrders: BoardOrder[];
  canManage: boolean;
  tables: { id: string; label: string }[];
}) {
  const t = useTranslations("orders");
  const [tab, setTab] = React.useState<"board" | "history">("board");
  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "board", label: t("tabs.board") },
          { value: "history", label: t("tabs.history") },
        ]}
      />
      {/* Board stays mounted so the live connection + sound keep working while browsing history. */}
      <div hidden={tab !== "board"}>
        <OrderBoard restaurantId={restaurantId} initialOrders={initialOrders} canManage={canManage} />
      </div>
      {tab === "history" && <OrderHistory restaurantId={restaurantId} tables={tables} />}
    </div>
  );
}

function OrderBoard({ restaurantId, initialOrders, canManage }: { restaurantId: string; initialOrders: BoardOrder[]; canManage: boolean }) {
  const t = useTranslations("orders");
  const chime = useChime();
  const now = useNow();
  const [highlight, setHighlight] = React.useState<Set<string>>(new Set());
  const [mobileCol, setMobileCol] = React.useState<Column>("pending");
  const [rejecting, setRejecting] = React.useState<BoardOrder | null>(null);

  const { orders, setOrders, state, refresh } = useOrderFeed(restaurantId, initialOrders, (fresh) => {
    chime.play();
    toast(t("newOrderToast", { count: fresh.length, number: fresh[0].number }));
    setHighlight((h) => new Set([...h, ...fresh.map((o) => o.id)]));
    setTimeout(
      () =>
        setHighlight((h) => {
          const n = new Set(h);
          fresh.forEach((o) => n.delete(o.id));
          return n;
        }),
      8000,
    );
  });

  const pendingCount = orders.filter((o) => o.status === "pending").length;
  useTitleBadge(pendingCount);

  const mutate = useAction(updateOrderStatusAction, { refresh: false, onSuccess: () => void refresh() });

  function changeStatus(o: BoardOrder, to: OrderStatus, reason?: string) {
    const prev = orders;
    setOrders((list) =>
      to === "rejected" || to === "cancelled" ? list.filter((x) => x.id !== o.id) : list.map((x) => (x.id === o.id ? { ...x, status: to } : x)),
    );
    void mutate.run({ restaurantId, orderId: o.id, status: to, reason: reason ?? null }).then((res) => {
      if (!res.ok) {
        setOrders(prev);
        void refresh();
      }
    });
  }

  const byCol = React.useMemo(() => {
    const m = Object.fromEntries(COLUMNS.map((c) => [c, [] as BoardOrder[]])) as Record<Column, BoardOrder[]>;
    for (const o of orders) if ((COLUMNS as readonly string[]).includes(o.status)) m[o.status as Column].push(o);
    m.served.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return m;
  }, [orders]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ConnectionBadge state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={chime.enabled ? "secondary" : "accent"} size="sm" onClick={chime.toggle}>
            {chime.enabled ? <Bell size={14} aria-hidden /> : <BellOff size={14} aria-hidden />}
            {chime.enabled ? t("sound.on") : t("sound.enable")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void refresh()} aria-label={t("refresh")}>
            <RefreshCw size={14} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:inline-flex"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
          >
            <Expand size={14} aria-hidden /> {t("fullscreen")}
          </Button>
        </div>
      </div>

      {/* Phone / small tablet: one column at a time */}
      <div className="lg:hidden">
        <Tabs
          value={mobileCol}
          onChange={setMobileCol}
          items={COLUMNS.map((c) => ({
            value: c,
            label: t(`columns.${c}`),
            badge: byCol[c].length ? (
              <span className={cn("rounded-full px-1.5 text-xs", c === "pending" ? "bg-accent-500 text-stone-900" : "bg-stone-200 text-stone-700")}>
                {byCol[c].length}
              </span>
            ) : undefined,
          }))}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {byCol[mobileCol].length ? (
            byCol[mobileCol].map((o) => (
              <OrderCard key={o.id} order={o} now={now} canManage={canManage} highlight={highlight.has(o.id)} onStatus={changeStatus} onReject={setRejecting} />
            ))
          ) : (
            <p className="col-span-full py-10 text-center text-sm text-stone-400">{t("emptyColumn")}</p>
          )}
        </div>
      </div>

      {/* Desktop / landscape tablet: kanban */}
      <div className="hidden gap-3 lg:grid lg:grid-cols-5">
        {COLUMNS.map((c) => (
          <section key={c} className={cn("flex min-h-[60vh] flex-col rounded-xl border p-2", COLUMN_STYLE[c])} aria-label={t(`columns.${c}`)}>
            <h2 className="flex items-center justify-between px-1.5 pb-2 pt-1 text-sm font-semibold text-stone-700">
              {t(`columns.${c}`)}
              <span className="rounded-full bg-white px-2 text-xs tabular-nums text-stone-600 shadow-sm">{byCol[c].length}</span>
            </h2>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {byCol[c].map((o) => (
                <OrderCard key={o.id} order={o} now={now} canManage={canManage} highlight={highlight.has(o.id)} onStatus={changeStatus} onReject={setRejecting} />
              ))}
              {!byCol[c].length && <p className="py-8 text-center text-xs text-stone-400">{t("emptyColumn")}</p>}
            </div>
          </section>
        ))}
      </div>

      {orders.length === 0 && <p className="text-center text-sm text-stone-500">{t("emptyBoard")}</p>}

      <RejectDialog
        key={rejecting?.id ?? "none"}
        order={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => {
          if (rejecting) changeStatus(rejecting, "rejected", reason);
          setRejecting(null);
        }}
      />
    </div>
  );
}

function ConnectionBadge({ state }: { state: FeedState }) {
  const t = useTranslations("orders");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        state === "live" ? "bg-emerald-50 text-emerald-700" : state === "connecting" ? "bg-stone-100 text-stone-600" : "bg-amber-50 text-amber-800",
      )}
      role="status"
    >
      {state === "live" ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <Wifi size={12} aria-hidden /> {t("connection.live")}
        </>
      ) : state === "connecting" ? (
        <>
          <Wifi size={12} aria-hidden /> {t("connection.connecting")}
        </>
      ) : (
        <>
          <WifiOff size={12} aria-hidden /> {t("connection.polling")}
        </>
      )}
    </span>
  );
}

function RejectDialog({ order, onClose, onConfirm }: { order: BoardOrder | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const [reason, setReason] = React.useState("");
  const quick = [t("reject.quick.soldOut"), t("reject.quick.kitchenClosed"), t("reject.quick.tooBusy")];
  return (
    <Dialog
      open={!!order}
      onClose={onClose}
      size="sm"
      title={t("reject.title", { number: order?.number ?? 0 })}
      description={t("reject.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button variant="danger" onClick={() => onConfirm(reason.trim())}>
            {t("reject.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setReason(q)}
              className={cn(
                "focus-ring rounded-full border px-2.5 py-1 text-xs",
                reason === q ? "border-red-300 bg-red-50 text-red-700" : "border-stone-300 text-stone-600 hover:bg-stone-50",
              )}
            >
              {q}
            </button>
          ))}
        </div>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={t("reject.placeholder")} aria-label={t("reject.reason")} />
        <p className="text-xs text-stone-500">{t("reject.hint")}</p>
      </div>
    </Dialog>
  );
}

function OrderHistory({ restaurantId, tables }: { restaurantId: string; tables: { id: string; label: string }[] }) {
  const t = useTranslations("orders");
  const locale = useLocale();
  const [range, setRange] = React.useState<"today" | "7d">("today");
  const [status, setStatus] = React.useState<string>("");
  const [table, setTable] = React.useState<string>("");
  const [result, setResult] = React.useState<{ key: string; orders: BoardOrder[] } | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const qs = new URLSearchParams({ scope: "history", range });
  if (status) qs.set("status", status);
  if (table) qs.set("table", table);
  const key = qs.toString();
  const orders = result?.key === key ? result.orders : null;

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/restaurants/${restaurantId}/orders?${key}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((d: { orders: BoardOrder[] }) => !cancelled && setResult({ key, orders: d.orders }))
      .catch(() => !cancelled && setResult({ key, orders: [] }));
    return () => {
      cancelled = true;
    };
  }, [restaurantId, key]);

  const bcp = toBcp47(locale);
  const revenue = (orders ?? []).filter((o) => ["accepted", "preparing", "ready", "served"].includes(o.status));
  const total = revenue.reduce((s, o) => s + o.totalCents, 0);
  const currency = orders?.[0]?.currency ?? "EUR";
  const dt = new Intl.DateTimeFormat(bcp, range === "today" ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5 shadow-sm">
          {(["today", "7d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn("focus-ring rounded-md px-3 py-1.5 text-sm font-medium", range === r ? "bg-brand-700 text-white" : "text-stone-600 hover:bg-stone-50")}
            >
              {t(`history.range.${r}`)}
            </button>
          ))}
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-40" aria-label={t("history.status")}>
          <option value="">{t("history.allStatuses")}</option>
          {(["pending", "accepted", "preparing", "ready", "served", "rejected", "cancelled"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
        {tables.length > 0 && (
          <Select value={table} onChange={(e) => setTable(e.target.value)} className="w-auto min-w-40" aria-label={t("history.table")}>
            <option value="">{t("history.allTables")}</option>
            {tables.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="px-4 py-3">
          <p className="text-xs text-stone-500">{t("history.count")}</p>
          <p className="text-xl font-semibold tabular-nums">{orders?.length ?? "–"}</p>
        </Card>
        <Card className="px-4 py-3">
          <p className="text-xs text-stone-500">{t("history.revenue")}</p>
          <p className="text-xl font-semibold tabular-nums">{orders ? formatPrice(total, bcp, currency) : "–"}</p>
        </Card>
        <Card className="hidden px-4 py-3 sm:block">
          <p className="text-xs text-stone-500">{t("history.average")}</p>
          <p className="text-xl font-semibold tabular-nums">{orders && revenue.length ? formatPrice(Math.round(total / revenue.length), bcp, currency) : "–"}</p>
        </Card>
      </div>

      {orders === null ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-stone-100" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState icon={<Inbox size={28} />} title={t("history.emptyTitle")} description={t("history.emptyDescription")} />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>{t("history.time")}</Th>
              <Th>{t("history.table")}</Th>
              <Th className="hidden sm:table-cell">{t("history.items")}</Th>
              <Th>{t("history.status")}</Th>
              <Th className="text-right">{t("history.total")}</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <React.Fragment key={o.id}>
                <tr className="cursor-pointer hover:bg-stone-50" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                  <Td className="font-semibold text-stone-900">{o.number}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{dt.format(new Date(o.createdAt))}</Td>
                  <Td>{o.tableLabel ?? <span className="text-stone-400">{t("card.noTable")}</span>}</Td>
                  <Td className="hidden max-w-72 truncate sm:table-cell">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{formatPrice(o.totalCents, bcp, o.currency)}</Td>
                </tr>
                {expanded === o.id && (
                  <tr className="bg-stone-50/60">
                    <Td colSpan={6}>
                      <ul className="space-y-1 text-sm">
                        {o.items.map((i, k) => (
                          <li key={k} className="flex justify-between gap-4">
                            <span>
                              {i.quantity}× {i.name}
                              {i.variant && <span className="text-stone-500"> ({i.variant})</span>}
                              {i.note && <span className="italic text-amber-800"> – „{i.note}“</span>}
                            </span>
                            <span className="tabular-nums text-stone-500">{formatPrice(i.unitPriceCents * i.quantity, bcp, o.currency)}</span>
                          </li>
                        ))}
                      </ul>
                      {o.guestNote && <p className="mt-2 text-xs text-amber-900">{t("history.guestNote")}: {o.guestNote}</p>}
                      {o.rejectReason && <p className="mt-2 text-xs text-red-700">{t("history.rejectReason")}: {o.rejectReason}</p>}
                    </Td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
