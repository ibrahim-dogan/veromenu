import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql as dsql, type SQL } from "drizzle-orm";
import { db } from "@/core/db";
import {
  aiUsage,
  analyticsEvents,
  auditLog,
  items,
  memberships,
  orders,
  restaurants,
  roles,
  userTokens,
  users,
} from "@/core/db/schema";
import { getPlan, PLANS, AI_CREDIT_COST } from "@/modules/billing/plans";
import { randomToken, sha256 } from "@/core/crypto";
import { sendMail } from "@/core/mail";

const DAY = 864e5;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
export const monthStartUtc = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};
/** ISO timestamp param for raw sql templates (postgres-js doesn't serialize Date inside sql``). */
const ts = (d: Date) => dsql`${d.toISOString()}::timestamptz`;
/** Fully qualified outer columns for correlated subqueries (drizzle omits the table name in single-table selects). */
const R_ID = dsql.raw(`"restaurants"."id"`);
const U_ID = dsql.raw(`"users"."id"`);
/** Escapes LIKE wildcards in user input. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

/* ================================================================ overview */

export async function getPlatformOverview() {
  const now = new Date();
  const [counts] = await db
    .select({
      total: dsql<number>`count(*)::int`,
      active: dsql<number>`count(*) filter (where ${restaurants.status} = 'active')::int`,
      new7: dsql<number>`count(*) filter (where ${restaurants.createdAt} >= ${ts(daysAgo(7))})::int`,
      new30: dsql<number>`count(*) filter (where ${restaurants.createdAt} >= ${ts(daysAgo(30))})::int`,
    })
    .from(restaurants);

  const [userCounts] = await db
    .select({
      total: dsql<number>`count(*)::int`,
      new7: dsql<number>`count(*) filter (where ${users.createdAt} >= ${ts(daysAgo(7))})::int`,
      new30: dsql<number>`count(*) filter (where ${users.createdAt} >= ${ts(daysAgo(30))})::int`,
    })
    .from(users);

  const [views] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.type, "menu_view"), gte(analyticsEvents.createdAt, daysAgo(30))));

  const [orderCount] = await db
    .select({ n: dsql<number>`count(*)::int`, revenue: dsql<number>`coalesce(sum(${orders.totalCents}),0)::bigint` })
    .from(orders)
    .where(gte(orders.createdAt, daysAgo(30)));

  // MRR estimate: active restaurants on a paid plan whose plan has not expired.
  const planRows = await db
    .select({ plan: restaurants.plan, n: dsql<number>`count(*)::int` })
    .from(restaurants)
    .where(
      and(
        eq(restaurants.status, "active"),
        or(isNull(restaurants.planValidUntil), gte(restaurants.planValidUntil, now)),
      ),
    )
    .groupBy(restaurants.plan);
  const planMix = PLANS.map((p) => ({ plan: p.id, count: planRows.find((r) => r.plan === p.id)?.n ?? 0 }));
  const mrrCents = planRows.reduce((s, r) => s + getPlan(r.plan).priceMonthlyCents * r.n, 0);

  const [ai] = await db
    .select({
      cost: dsql<number>`coalesce(sum(${aiUsage.costUsd}),0)::float8`,
      calls: dsql<number>`count(*)::int`,
      failed: dsql<number>`count(*) filter (where not ${aiUsage.ok})::int`,
    })
    .from(aiUsage)
    .where(gte(aiUsage.createdAt, monthStartUtc()));

  // Signups per ISO week (last 12 weeks), zero-filled.
  const weekRows = await db
    .select({
      week: dsql<string>`to_char(date_trunc('week', ${restaurants.createdAt} at time zone 'Europe/Berlin'), 'YYYY-MM-DD')`,
      n: dsql<number>`count(*)::int`,
    })
    .from(restaurants)
    .where(gte(restaurants.createdAt, daysAgo(7 * 12)))
    .groupBy(dsql`1`);
  const weeks: { week: string; signups: number }[] = [];
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let i = 11; i >= 0; i--) {
    const d = new Date(monday.getTime() - i * 7 * DAY);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    weeks.push({ week: key, signups: weekRows.find((r) => r.week === key)?.n ?? 0 });
  }

  const topByViews = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      plan: restaurants.plan,
      views: dsql<number>`count(*)::int`,
    })
    .from(analyticsEvents)
    .innerJoin(restaurants, eq(restaurants.id, analyticsEvents.restaurantId))
    .where(and(eq(analyticsEvents.type, "menu_view"), gte(analyticsEvents.createdAt, daysAgo(30))))
    .groupBy(restaurants.id)
    .orderBy(desc(dsql`count(*)`))
    .limit(10);

  return {
    restaurants: counts,
    users: userCounts,
    menuViews30: views.n,
    orders30: orderCount.n,
    orderRevenue30Cents: Number(orderCount.revenue),
    mrrCents,
    planMix,
    ai,
    weeks,
    topByViews,
  };
}

/* ============================================================= restaurants */

export const PAGE_SIZE = 25;

/** Owner email: the first member holding the system "owner" role. */
const ownerEmailSql = dsql<string | null>`(
  select u.email from ${memberships} m
  join ${roles} r on r.id = m.role_id and r.key = 'owner'
  join ${users} u on u.id = m.user_id
  where m.restaurant_id = ${R_ID}
  order by m.created_at asc limit 1)`;

const lastActivitySql = dsql<Date | null>`greatest(
  "restaurants"."updated_at",
  (select max(a.created_at) from ${auditLog} a where a.restaurant_id = ${R_ID}),
  (select max(o.created_at) from ${orders} o where o.restaurant_id = ${R_ID}))`;

export async function listRestaurants(opts: { q?: string; status?: string; plan?: string; page?: number }) {
  const where: SQL[] = [];
  if (opts.q?.trim()) {
    const q = like(opts.q.trim());
    where.push(
      or(
        ilike(restaurants.name, q),
        ilike(restaurants.slug, q),
        dsql`exists (select 1 from ${memberships} m join ${users} u on u.id = m.user_id
                     where m.restaurant_id = ${R_ID} and u.email ilike ${q})`,
      )!,
    );
  }
  if (opts.status === "active" || opts.status === "suspended") where.push(eq(restaurants.status, opts.status));
  if (opts.plan && PLANS.some((p) => p.id === opts.plan)) where.push(eq(restaurants.plan, opts.plan));
  const cond = where.length ? and(...where) : undefined;
  const page = Math.max(1, opts.page ?? 1);

  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        slug: restaurants.slug,
        plan: restaurants.plan,
        planValidUntil: restaurants.planValidUntil,
        status: restaurants.status,
        createdAt: restaurants.createdAt,
        ownerEmail: ownerEmailSql,
        itemCount: dsql<number>`(select count(*)::int from ${items} i where i.restaurant_id = ${R_ID})`,
        lastActivity: lastActivitySql,
      })
      .from(restaurants)
      .where(cond)
      .orderBy(desc(restaurants.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: dsql<number>`count(*)::int` }).from(restaurants).where(cond),
  ]);
  const now = Date.now();
  return {
    rows: rows.map((r) => ({
      ...r,
      lastActivity: r.lastActivity ? new Date(r.lastActivity) : null,
      planExpired: !!r.planValidUntil && r.planValidUntil.getTime() < now,
    })),
    total: n,
    page,
  };
}

export async function getRestaurantDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
  if (!r) return null;

  const [members, [itemStats], aiByTask, [orderStats], [viewStats], recentAudit] = await Promise.all([
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: roles.name,
        roleKey: roles.key,
        joinedAt: memberships.createdAt,
        lastLoginAt: users.lastLoginAt,
        disabledAt: users.disabledAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .innerJoin(roles, eq(roles.id, memberships.roleId))
      .where(eq(memberships.restaurantId, id))
      .orderBy(asc(memberships.createdAt)),
    db
      .select({
        total: dsql<number>`count(*)::int`,
        confirmed: dsql<number>`count(*) filter (where ${items.allergenStatus} = 'confirmed')::int`,
      })
      .from(items)
      .where(eq(items.restaurantId, id)),
    db
      .select({
        task: aiUsage.task,
        calls: dsql<number>`count(*)::int`,
        ok: dsql<number>`count(*) filter (where ${aiUsage.ok})::int`,
        tokens: dsql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}),0)::int`,
        cost: dsql<number>`coalesce(sum(${aiUsage.costUsd}),0)::float8`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.restaurantId, id), gte(aiUsage.createdAt, monthStartUtc())))
      .groupBy(aiUsage.task)
      .orderBy(aiUsage.task),
    db
      .select({ n: dsql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.restaurantId, id), gte(orders.createdAt, daysAgo(30)))),
    db
      .select({ n: dsql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.restaurantId, id), eq(analyticsEvents.type, "menu_view"), gte(analyticsEvents.createdAt, daysAgo(30)))),
    db
      .select({ id: auditLog.id, action: auditLog.action, createdAt: auditLog.createdAt, email: users.email })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(eq(auditLog.restaurantId, id))
      .orderBy(desc(auditLog.createdAt))
      .limit(8),
  ]);

  const creditsUsed = aiByTask.reduce((s, t) => s + t.ok * (AI_CREDIT_COST[t.task] ?? 1), 0);
  return {
    restaurant: r,
    members,
    items: itemStats,
    ai: {
      byTask: aiByTask,
      creditsUsed,
      creditsLimit: getPlan(r.plan).limits.aiCredits,
      cost: aiByTask.reduce((s, t) => s + t.cost, 0),
    },
    orders30: orderStats.n,
    views30: viewStats.n,
    recentAudit,
  };
}

/* =================================================================== users */

export async function listUsers(opts: { q?: string; filter?: string; page?: number }) {
  const where: SQL[] = [];
  if (opts.q?.trim()) {
    const q = like(opts.q.trim());
    where.push(or(ilike(users.email, q), ilike(users.name, q))!);
  }
  if (opts.filter === "admins") where.push(eq(users.isPlatformAdmin, true));
  if (opts.filter === "disabled") where.push(dsql`${users.disabledAt} is not null`);
  if (opts.filter === "unverified") where.push(isNull(users.emailVerifiedAt));
  const cond = where.length ? and(...where) : undefined;
  const page = Math.max(1, opts.page ?? 1);

  const [rows, [{ n }], [{ admins }]] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        isPlatformAdmin: users.isPlatformAdmin,
        emailVerifiedAt: users.emailVerifiedAt,
        disabledAt: users.disabledAt,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        restaurants: dsql<{ id: string; name: string }[] | null>`(
          select json_agg(json_build_object('id', r.id, 'name', r.name) order by r.name)
          from ${memberships} m join ${restaurants} r on r.id = m.restaurant_id
          where m.user_id = ${U_ID})`,
      })
      .from(users)
      .where(cond)
      .orderBy(desc(users.isPlatformAdmin), desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: dsql<number>`count(*)::int` }).from(users).where(cond),
    activeAdminCount(),
  ]);
  return { rows: rows.map((r) => ({ ...r, restaurants: r.restaurants ?? [] })), total: n, page, activeAdmins: admins };
}

export function activeAdminCount() {
  return db
    .select({ admins: dsql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.isPlatformAdmin, true), isNull(users.disabledAt)));
}

/**
 * Issues a password-reset token (same flow as "forgot password") and mails the link.
 * Used for invitations of new owners/admins (72 h validity) and for admin-triggered resets.
 */
export async function sendPasswordSetupLink(user: { id: string; email: string; locale: string }, kind: "invite" | "reset") {
  const token = randomToken(32);
  const hours = kind === "invite" ? 72 : 24;
  await db.insert(userTokens).values({
    id: sha256(token),
    userId: user.id,
    type: "reset_password",
    expiresAt: new Date(Date.now() + hours * 36e5),
  });
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const prefix = user.locale === "en" || user.locale === "tr" ? `/${user.locale}` : "";
  const link = `${base}${prefix}/reset-password?token=${token}`;
  const M = MAILS[kind];
  await sendMail(user.email, M.subject, M.text(link, hours));
  return link;
}

/** Bilingual (DE/EN) mails – recipients may not have chosen a UI language yet. */
const MAILS = {
  invite: {
    subject: "Dein Zugang zu VeroMenu / Your VeroMenu access",
    text: (link: string, h: number) =>
      `Hallo,\n\nfür dich wurde ein Zugang zu VeroMenu eingerichtet. Lege hier dein Passwort fest (Link ${h} Stunden gültig):\n${link}\n\n—\n\nHi,\n\nan account has been set up for you on VeroMenu. Set your password here (link valid for ${h} hours):\n${link}\n`,
  },
  reset: {
    subject: "VeroMenu – Passwort festlegen / Set your password",
    text: (link: string, h: number) =>
      `Hallo,\n\nein Administrator hat einen Link zum Zurücksetzen deines Passworts angefordert (${h} Stunden gültig):\n${link}\n\n—\n\nAn administrator requested a password reset link for your account (valid for ${h} hours):\n${link}\n`,
  },
} as const;

/* =================================================================== audit */

export const AUDIT_PAGE_SIZE = 50;

export async function listAudit(opts: {
  restaurantId?: string;
  user?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
}) {
  const where: SQL[] = [];
  if (opts.restaurantId && /^[0-9a-f-]{36}$/i.test(opts.restaurantId)) where.push(eq(auditLog.restaurantId, opts.restaurantId));
  if (opts.user?.trim()) where.push(or(ilike(users.email, like(opts.user.trim())), ilike(users.name, like(opts.user.trim())))!);
  if (opts.action?.trim()) where.push(ilike(auditLog.action, `${opts.action.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`));
  const from = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? new Date(`${opts.from}T00:00:00`) : null;
  const to = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? new Date(`${opts.to}T23:59:59.999`) : null;
  if (from && !isNaN(+from)) where.push(gte(auditLog.createdAt, from));
  if (to && !isNaN(+to)) where.push(lte(auditLog.createdAt, to));
  const cond = where.length ? and(...where) : undefined;
  const page = Math.max(1, opts.page ?? 1);

  const base = db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      data: auditLog.data,
      createdAt: auditLog.createdAt,
      userId: auditLog.userId,
      userEmail: users.email,
      restaurantId: auditLog.restaurantId,
      restaurantName: restaurants.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .leftJoin(restaurants, eq(restaurants.id, auditLog.restaurantId))
    .where(cond);

  // Fetch one extra row to know whether a next page exists (avoids a costly count on large logs).
  const rows = await base.orderBy(desc(auditLog.createdAt)).limit(AUDIT_PAGE_SIZE + 1).offset((page - 1) * AUDIT_PAGE_SIZE);
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE, page };
}

export async function restaurantOptions(ids: string[] = []) {
  const list = await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants).orderBy(asc(restaurants.name)).limit(500);
  if (ids.length) {
    const missing = ids.filter((id) => !list.some((r) => r.id === id) && /^[0-9a-f-]{36}$/i.test(id));
    if (missing.length) list.push(...(await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants).where(inArray(restaurants.id, missing))));
  }
  return list;
}
