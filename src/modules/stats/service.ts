import "server-only";
import { sql } from "@/core/db";

/**
 * Statistics from cookie-less analytics_events + orders. All day/hour buckets are computed in the
 * restaurant time zone (Europe/Berlin by default) directly in SQL.
 */
export const STATS_RANGES = [7, 30, 90] as const;
export type StatsRange = (typeof STATS_RANGES)[number];
export const parseRange = (v: unknown): StatsRange => (STATS_RANGES as readonly number[]).includes(Number(v)) ? (Number(v) as StatsRange) : 30;

const REVENUE = ["accepted", "preparing", "ready", "served"];

export type DailyPoint = { day: string; views: number; visitors: number; scans: number; orders: number; paidOrders: number; revenueCents: number };
export type Kpis = {
  views: number;
  visitors: number;
  scans: number;
  orders: number;
  paidOrders: number;
  revenueCents: number;
  avgOrderCents: number;
};
export type KpiSet = { current: Kpis; previous: Kpis };

/** Start of the local day `daysBack` days ago, as timestamptz. */
const dayStart = (tz: string, daysBack: number) =>
  sql`((date_trunc('day', now() at time zone ${tz}) - make_interval(days => ${daysBack}::int)) at time zone ${tz})`;

/** One row per local day for the current AND the previous period (2 × days rows, oldest first). */
async function dailySeries(restaurantId: string, tz: string, days: number): Promise<DailyPoint[]> {
  const rows = await sql<{ day: string; views: number; visitors: number; scans: number; orders: number; paid: number; revenue: number }[]>`
    with d as (
      select generate_series(
        (now() at time zone ${tz})::date - ${2 * days - 1}::int,
        (now() at time zone ${tz})::date,
        interval '1 day'
      )::date as day
    ),
    a as (
      select (created_at at time zone ${tz})::date as day,
             count(*) filter (where type = 'menu_view')::int as views,
             count(*) filter (where type = 'qr_scan')::int as scans,
             count(distinct visitor_hash)::int as visitors
      from analytics_events
      where restaurant_id = ${restaurantId} and created_at >= ${dayStart(tz, 2 * days - 1)}
      group by 1
    ),
    o as (
      select (created_at at time zone ${tz})::date as day,
             count(*)::int as orders,
             count(*) filter (where status in ${sql(REVENUE)})::int as paid,
             coalesce(sum(total_cents) filter (where status in ${sql(REVENUE)}), 0)::int as revenue
      from orders
      where restaurant_id = ${restaurantId} and created_at >= ${dayStart(tz, 2 * days - 1)}
      group by 1
    )
    select d.day::text as day,
           coalesce(a.views, 0) as views, coalesce(a.visitors, 0) as visitors, coalesce(a.scans, 0) as scans,
           coalesce(o.orders, 0) as orders, coalesce(o.paid, 0) as paid, coalesce(o.revenue, 0) as revenue
    from d left join a on a.day = d.day left join o on o.day = d.day
    order by d.day`;
  return rows.map((r) => ({
    day: r.day,
    views: r.views,
    visitors: r.visitors,
    scans: r.scans,
    orders: r.orders,
    paidOrders: r.paid,
    revenueCents: r.revenue,
  }));
}

function sumKpis(points: DailyPoint[]): Kpis {
  const s = points.reduce(
    (acc, p) => ({
      views: acc.views + p.views,
      visitors: acc.visitors + p.visitors,
      scans: acc.scans + p.scans,
      orders: acc.orders + p.orders,
      paidOrders: acc.paidOrders + p.paidOrders,
      revenueCents: acc.revenueCents + p.revenueCents,
    }),
    { views: 0, visitors: 0, scans: 0, orders: 0, paidOrders: 0, revenueCents: 0 },
  );
  return { ...s, avgOrderCents: s.paidOrders ? Math.round(s.revenueCents / s.paidOrders) : 0 };
}

/** KPIs for the last `days` days + the period before (for trend arrows). Used by the overview. */
export async function getKpis(restaurantId: string, tz: string, days: number): Promise<KpiSet & { series: DailyPoint[] }> {
  const all = await dailySeries(restaurantId, tz, days);
  const previous = all.slice(0, days);
  const current = all.slice(days);
  return { current: sumKpis(current), previous: sumKpis(previous), series: current };
}

export type StatsData = KpiSet & {
  days: number;
  series: DailyPoint[];
  scansByTable: { tableId: string | null; label: string | null; count: number }[];
  topViewed: { itemId: string; name: string; count: number }[];
  topOrdered: { name: string; quantity: number; revenueCents: number }[];
  languages: { locale: string; count: number }[];
  heatmap: { views: number[][]; orders: number[][] }; // [weekday 0=Mon..6=Sun][hour 0..23]
  hasAnyData: boolean;
};

export async function getStats(restaurantId: string, tz: string, days: StatsRange): Promise<StatsData> {
  const from = dayStart(tz, days - 1);
  const [kpis, scansByTable, topViewed, topOrdered, languages, heatViews, heatOrders] = await Promise.all([
    getKpis(restaurantId, tz, days),
    sql<{ tableId: string | null; label: string | null; count: number }[]>`
      select e.table_id as "tableId", t.label, count(*)::int as count
      from analytics_events e left join tables t on t.id = e.table_id
      where e.restaurant_id = ${restaurantId} and e.type = 'qr_scan' and e.created_at >= ${from}
      group by e.table_id, t.label
      order by count desc
      limit 25`,
    sql<{ itemId: string; name: string; count: number }[]>`
      select e.item_id as "itemId", i.name, count(*)::int as count
      from analytics_events e join items i on i.id = e.item_id
      where e.restaurant_id = ${restaurantId} and e.type = 'item_view' and e.created_at >= ${from}
      group by e.item_id, i.name
      order by count desc
      limit 10`,
    sql<{ name: string; quantity: number; revenueCents: number }[]>`
      select coalesce(max(i.name), max(oi.name_snapshot)) as name,
             sum(oi.quantity)::int as quantity,
             sum(oi.quantity * oi.unit_price_cents)::int as "revenueCents"
      from order_items oi
      join orders o on o.id = oi.order_id
      left join items i on i.id = oi.item_id
      where o.restaurant_id = ${restaurantId} and o.created_at >= ${from} and o.status in ${sql(REVENUE)}
      group by coalesce(oi.item_id::text, oi.name_snapshot)
      order by quantity desc
      limit 10`,
    sql<{ locale: string; count: number }[]>`
      select coalesce(locale, '?') as locale, count(*)::int as count
      from analytics_events
      where restaurant_id = ${restaurantId} and type = 'menu_view' and created_at >= ${from}
      group by 1
      order by count desc`,
    sql<{ dow: number; hour: number; count: number }[]>`
      select extract(isodow from created_at at time zone ${tz})::int as dow,
             extract(hour from created_at at time zone ${tz})::int as hour,
             count(*)::int as count
      from analytics_events
      where restaurant_id = ${restaurantId} and type = 'menu_view' and created_at >= ${from}
      group by 1, 2`,
    sql<{ dow: number; hour: number; count: number }[]>`
      select extract(isodow from created_at at time zone ${tz})::int as dow,
             extract(hour from created_at at time zone ${tz})::int as hour,
             count(*)::int as count
      from orders
      where restaurant_id = ${restaurantId} and created_at >= ${from}
      group by 1, 2`,
  ]);

  const grid = (rows: { dow: number; hour: number; count: number }[]) => {
    const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const r of rows) g[r.dow - 1][r.hour] = r.count;
    return g;
  };

  return {
    days,
    current: kpis.current,
    previous: kpis.previous,
    series: kpis.series,
    scansByTable: [...scansByTable],
    topViewed: [...topViewed],
    topOrdered: [...topOrdered],
    languages: [...languages],
    heatmap: { views: grid([...heatViews]), orders: grid([...heatOrders]) },
    hasAnyData: kpis.current.views + kpis.current.scans + kpis.current.orders > 0,
  };
}
