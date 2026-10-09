import "server-only";
import { and, asc, eq, gt, isNull, sql as dsql } from "drizzle-orm";
import { db, type DbOrTx } from "@/core/db";
import { invitations, memberships, restaurants, roles, users } from "@/core/db/schema";
import { AppError } from "@/core/http/errors";
import { randomToken, sha256 } from "@/core/crypto";
import { env } from "@/core/env";
import { isPermission, type Permission } from "@/core/auth/permissions";
import type { RestaurantContext } from "@/core/auth/guards";
import { getPlan, planHas } from "@/modules/billing/plans";

/**
 * Team & roles. Invariants:
 *  - a restaurant always keeps at least one owner (AppError "lastOwner")
 *  - only owners (or platform admins) may grant / revoke the owner role
 *  - the owner role is locked; system roles cannot be deleted; custom roles need plan feature "staff_roles"
 *  - seats (plan limit "users") = members + open invitations
 */
export const INVITE_DAYS = 7;

export type MemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleKey: string | null;
  joinedAt: Date;
  lastLoginAt: Date | null;
};

export async function listMembers(restaurantId: string): Promise<MemberRow[]> {
  return db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      roleId: roles.id,
      roleKey: roles.key,
      joinedAt: memberships.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(eq(memberships.restaurantId, restaurantId))
    .orderBy(asc(memberships.createdAt));
}

export async function listRoles(restaurantId: string) {
  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      key: roles.key,
      permissions: roles.permissions,
      createdAt: roles.createdAt,
      members: dsql<number>`(select count(*)::int from ${memberships} m where m.role_id = ${roles.id})`,
      invites: dsql<number>`(select count(*)::int from ${invitations} i where i.role_id = ${roles.id} and i.accepted_at is null and i.expires_at > now())`,
    })
    .from(roles)
    .where(eq(roles.restaurantId, restaurantId))
    .orderBy(asc(roles.createdAt));
  const order = ["owner", "manager", "service", "kitchen", "editor"];
  return rows.sort((a, b) => {
    const ia = a.key ? order.indexOf(a.key) : 99;
    const ib = b.key ? order.indexOf(b.key) : 99;
    return ia - ib || a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export async function listInvitations(restaurantId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      roleId: invitations.roleId,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
      invitedByName: users.name,
    })
    .from(invitations)
    .leftJoin(users, eq(users.id, invitations.invitedBy))
    .where(and(eq(invitations.restaurantId, restaurantId), isNull(invitations.acceptedAt)))
    .orderBy(asc(invitations.createdAt));
}

export async function seatUsage(restaurantId: string, q: DbOrTx = db) {
  const [r] = await q.select({ plan: restaurants.plan }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  const [m] = await q.select({ n: dsql<number>`count(*)::int` }).from(memberships).where(eq(memberships.restaurantId, restaurantId));
  const [i] = await q
    .select({ n: dsql<number>`count(*)::int` })
    .from(invitations)
    .where(and(eq(invitations.restaurantId, restaurantId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
  return { members: m.n, pending: i.n, used: m.n + i.n, limit: getPlan(r?.plan).limits.users };
}

async function getRole(restaurantId: string, roleId: string) {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.restaurantId, restaurantId)))
    .limit(1);
  if (!role) throw new AppError("notFound");
  return role;
}

async function actorIsOwner(ctx: RestaurantContext) {
  if (ctx.isAdminOverride || ctx.user.isPlatformAdmin) return true;
  const [m] = await db
    .select({ key: roles.key })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.restaurantId, ctx.restaurant.id), eq(memberships.userId, ctx.user.id)))
    .limit(1);
  return m?.key === "owner";
}

async function ownerCount(restaurantId: string, q: DbOrTx = db) {
  const [r] = await q
    .select({ n: dsql<number>`count(*)::int` })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.restaurantId, restaurantId), eq(roles.key, "owner")));
  return r.n;
}

export function inviteLink(token: string, locale: string) {
  const base = env().APP_URL.replace(/\/+$/, "");
  return `${base}${locale === "de" ? "" : `/${locale}`}/invite/${token}`;
}

// ------------------------------------------------------------------ invitations

export async function createInvitation(ctx: RestaurantContext, input: { email: string; roleId: string }) {
  const rid = ctx.restaurant.id;
  const role = await getRole(rid, input.roleId);
  if (role.key === "owner" && !(await actorIsOwner(ctx))) throw new AppError("forbidden");
  if (!role.key && !planHas(ctx.restaurant.plan, "staff_roles")) throw new AppError("featureNotInPlan");

  const [existingMember] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.restaurantId, rid), eq(users.email, input.email)))
    .limit(1);
  if (existingMember) throw new AppError("validation", "alreadyMember");

  return db.transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${"team:" + rid}))`);
    // Re-inviting the same address replaces the previous open invitation.
    await tx.delete(invitations).where(and(eq(invitations.restaurantId, rid), eq(invitations.email, input.email), isNull(invitations.acceptedAt)));
    const usage = await seatUsage(rid, tx);
    if (usage.used + 1 > usage.limit) throw new AppError("planLimit", `${usage.used}/${usage.limit}`);
    const token = randomToken(32);
    const [inv] = await tx
      .insert(invitations)
      .values({
        restaurantId: rid,
        email: input.email,
        roleId: role.id,
        tokenHash: sha256(token),
        invitedBy: ctx.user.id,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5),
      })
      .returning();
    return { invitation: inv, token, role };
  });
}

/** New token + new 7-day window for an open invitation (old link stops working). */
export async function renewInvitation(ctx: RestaurantContext, invitationId: string) {
  const token = randomToken(32);
  const [inv] = await db
    .update(invitations)
    .set({ tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5) })
    .where(and(eq(invitations.id, invitationId), eq(invitations.restaurantId, ctx.restaurant.id), isNull(invitations.acceptedAt)))
    .returning();
  if (!inv) throw new AppError("notFound");
  return { invitation: inv, token, role: await getRole(ctx.restaurant.id, inv.roleId) };
}

export async function revokeInvitation(restaurantId: string, invitationId: string) {
  const [inv] = await db
    .delete(invitations)
    .where(and(eq(invitations.id, invitationId), eq(invitations.restaurantId, restaurantId), isNull(invitations.acceptedAt)))
    .returning();
  if (!inv) throw new AppError("notFound");
  return inv;
}

// ------------------------------------------------------------------ members

async function getMembership(restaurantId: string, membershipId: string) {
  const [m] = await db
    .select({ id: memberships.id, userId: memberships.userId, roleId: memberships.roleId, roleKey: roles.key, email: users.email })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.id, membershipId), eq(memberships.restaurantId, restaurantId)))
    .limit(1);
  if (!m) throw new AppError("notFound");
  return m;
}

export async function changeMemberRole(ctx: RestaurantContext, membershipId: string, roleId: string) {
  const rid = ctx.restaurant.id;
  const m = await getMembership(rid, membershipId);
  const role = await getRole(rid, roleId);
  if (m.roleId === role.id) return m;
  if ((m.roleKey === "owner" || role.key === "owner") && !(await actorIsOwner(ctx))) throw new AppError("forbidden");
  return db.transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${"team:" + rid}))`);
    if (m.roleKey === "owner" && role.key !== "owner" && (await ownerCount(rid, tx)) <= 1) throw new AppError("lastOwner");
    await tx.update(memberships).set({ roleId: role.id }).where(eq(memberships.id, m.id));
    return { ...m, roleId: role.id, newRoleName: role.name };
  });
}

export async function removeMember(ctx: RestaurantContext, membershipId: string) {
  const rid = ctx.restaurant.id;
  const m = await getMembership(rid, membershipId);
  if (m.roleKey === "owner" && !(await actorIsOwner(ctx))) throw new AppError("forbidden");
  return db.transaction(async (tx) => {
    await tx.execute(dsql`select pg_advisory_xact_lock(hashtext(${"team:" + rid}))`);
    if (m.roleKey === "owner" && (await ownerCount(rid, tx)) <= 1) throw new AppError("lastOwner");
    await tx.delete(memberships).where(eq(memberships.id, m.id));
    return m;
  });
}

// ------------------------------------------------------------------ roles

const cleanPermissions = (list: string[]): Permission[] => Array.from(new Set(list.filter(isPermission)));

export async function createRole(ctx: RestaurantContext, input: { name: string; permissions: string[] }) {
  if (!planHas(ctx.restaurant.plan, "staff_roles")) throw new AppError("featureNotInPlan");
  const [role] = await db
    .insert(roles)
    .values({ restaurantId: ctx.restaurant.id, name: input.name, key: null, permissions: cleanPermissions(input.permissions) })
    .returning();
  return role;
}

export async function updateRole(ctx: RestaurantContext, roleId: string, input: { name?: string; permissions: string[] }) {
  if (!planHas(ctx.restaurant.plan, "staff_roles")) throw new AppError("featureNotInPlan");
  const role = await getRole(ctx.restaurant.id, roleId);
  if (role.key === "owner") throw new AppError("forbidden");
  const [updated] = await db
    .update(roles)
    .set({
      // System roles keep their (translated) name; only custom roles can be renamed.
      name: role.key ? role.name : (input.name ?? role.name),
      permissions: cleanPermissions(input.permissions),
    })
    .where(eq(roles.id, role.id))
    .returning();
  return updated;
}

export async function deleteRole(ctx: RestaurantContext, roleId: string) {
  const role = await getRole(ctx.restaurant.id, roleId);
  if (role.key) throw new AppError("forbidden");
  const [used] = await db.select({ n: dsql<number>`count(*)::int` }).from(memberships).where(eq(memberships.roleId, role.id));
  if (used.n > 0) throw new AppError("validation", "roleInUse");
  await db.delete(roles).where(eq(roles.id, role.id)); // open invitations with this role cascade
  return role;
}
