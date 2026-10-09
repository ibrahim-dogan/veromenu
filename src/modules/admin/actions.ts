"use server";
import { z } from "zod";
import { and, eq, isNull, ne, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { restaurants, users } from "@/core/db/schema";
import { action, AppError, ForbiddenError } from "@/core/http/action";
import { requirePlatformAdmin } from "@/core/auth/guards";
import { hashPassword } from "@/core/auth/password";
import { destroyAllSessions } from "@/core/auth/session";
import { randomToken } from "@/core/crypto";
import { audit } from "@/core/audit";
import { createRestaurant } from "@/modules/tenancy/service";
import { PLANS } from "@/modules/billing/plans";
import { sendPasswordSetupLink } from "./service";
import { ADMIN_MODULES } from "./constants";

const uuid = z.string().uuid();
const email = z.string().trim().toLowerCase().email().max(200);
const planId = z.enum(PLANS.map((p) => p.id) as [string, ...string[]]);
const uiLocale = z.enum(["de", "en", "tr"]);

/* ============================================================= restaurants */

/**
 * Creates a restaurant for an existing user (by email) or a new user. New users get a random password
 * and a 72 h "set your password" link via the password-reset token flow.
 */
export const adminCreateRestaurant = action(
  z.object({
    name: z.string().trim().min(2).max(100),
    ownerEmail: email,
    ownerName: z.string().trim().max(100).optional(),
    plan: planId,
    locale: uiLocale.default("de"),
  }),
  async (input) => {
    const admin = await requirePlatformAdmin();
    let [owner] = await db.select().from(users).where(eq(users.email, input.ownerEmail)).limit(1);
    let invited = false;
    if (!owner) {
      [owner] = await db
        .insert(users)
        .values({
          email: input.ownerEmail,
          name: input.ownerName ?? "",
          passwordHash: await hashPassword(randomToken(24)),
          locale: input.locale,
        })
        .returning();
      await audit({ userId: admin.id, action: "admin.user.create", entityType: "user", entityId: owner.id, data: { email: owner.email } });
      invited = true;
    }
    const r = await createRestaurant({
      name: input.name,
      ownerUserId: owner.id,
      createdBy: admin.id,
      plan: input.plan,
      uiLocale: owner.locale ?? input.locale,
    });
    if (invited) await sendPasswordSetupLink(owner, "invite");
    await audit({
      restaurantId: r.id,
      userId: admin.id,
      action: "admin.restaurant.create",
      entityType: "restaurant",
      entityId: r.id,
      data: { owner: owner.email, plan: input.plan, newOwner: invited },
    });
    return { restaurantId: r.id, invited };
  },
);

export const adminUpdateRestaurant = action(
  z.object({
    id: uuid,
    plan: planId,
    /** yyyy-mm-dd or empty = unlimited */
    planValidUntil: z
      .string()
      .regex(/^(\d{4}-\d{2}-\d{2})?$/)
      .optional(),
    status: z.enum(["active", "suspended"]),
    modules: z.array(z.enum(ADMIN_MODULES)).max(ADMIN_MODULES.length),
  }),
  async (input) => {
    const admin = await requirePlatformAdmin();
    const [before] = await db.select().from(restaurants).where(eq(restaurants.id, input.id)).limit(1);
    if (!before) throw new AppError("notFound");
    const planValidUntil = input.planValidUntil ? new Date(`${input.planValidUntil}T23:59:59Z`) : null;
    await db
      .update(restaurants)
      .set({ plan: input.plan, planValidUntil, status: input.status, modules: [...new Set(input.modules)], updatedAt: new Date() })
      .where(eq(restaurants.id, input.id));
    const changes: Record<string, unknown> = {};
    if (before.plan !== input.plan) changes.plan = [before.plan, input.plan];
    if ((before.planValidUntil?.toISOString() ?? null) !== (planValidUntil?.toISOString() ?? null))
      changes.planValidUntil = [before.planValidUntil, planValidUntil];
    if (before.status !== input.status) changes.status = [before.status, input.status];
    if ([...before.modules].sort().join() !== [...input.modules].sort().join()) changes.modules = [before.modules, input.modules];
    await audit({
      restaurantId: input.id,
      userId: admin.id,
      action: input.status !== before.status ? `admin.restaurant.${input.status === "suspended" ? "suspend" : "activate"}` : "admin.restaurant.update",
      entityType: "restaurant",
      entityId: input.id,
      data: changes,
    });
    return null;
  },
);

/* =================================================================== users */

export const adminCreateAdmin = action(
  z.object({
    email,
    name: z.string().trim().min(1).max(100),
    /** Empty → a "set your password" link is mailed instead. */
    password: z.union([z.literal(""), z.string().min(8, "weakPassword").max(200)]).optional(),
    locale: uiLocale.default("de"),
  }),
  async (input) => {
    const admin = await requirePlatformAdmin();
    const [existing] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (existing) {
      if (existing.isPlatformAdmin) throw new AppError("emailTaken");
      await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, existing.id));
      await audit({ userId: admin.id, action: "admin.user.grant_admin", entityType: "user", entityId: existing.id, data: { email: existing.email } });
      return { userId: existing.id, promoted: true, linkSent: false };
    }
    const password = input.password || "";
    const [u] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash: await hashPassword(password || randomToken(24)),
        isPlatformAdmin: true,
        locale: input.locale,
        // An admin-chosen password doesn't prove the address; a reset link will.
        emailVerifiedAt: null,
      })
      .returning();
    if (!password) await sendPasswordSetupLink(u, "invite");
    await audit({ userId: admin.id, action: "admin.user.create_admin", entityType: "user", entityId: u.id, data: { email: u.email, linkSent: !password } });
    return { userId: u.id, promoted: false, linkSent: !password };
  },
);

async function otherActiveAdmins(exceptUserId: string) {
  const [{ n }] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.isPlatformAdmin, true), isNull(users.disabledAt), ne(users.id, exceptUserId)));
  return n;
}

export const adminSetPlatformAdmin = action(z.object({ userId: uuid, isAdmin: z.boolean() }), async ({ userId, isAdmin }) => {
  const admin = await requirePlatformAdmin();
  if (!isAdmin) {
    if (userId === admin.id) throw new ForbiddenError("cannot remove own admin flag");
    if ((await otherActiveAdmins(userId)) < 1) throw new ForbiddenError("at least one admin required");
  }
  const [u] = await db.update(users).set({ isPlatformAdmin: isAdmin }).where(eq(users.id, userId)).returning({ email: users.email });
  if (!u) throw new AppError("notFound");
  await audit({
    userId: admin.id,
    action: isAdmin ? "admin.user.grant_admin" : "admin.user.revoke_admin",
    entityType: "user",
    entityId: userId,
    data: { email: u.email },
  });
  return null;
});

export const adminSetUserDisabled = action(z.object({ userId: uuid, disabled: z.boolean() }), async ({ userId, disabled }) => {
  const admin = await requirePlatformAdmin();
  if (disabled) {
    if (userId === admin.id) throw new ForbiddenError("cannot disable yourself");
    const [target] = await db.select({ isPlatformAdmin: users.isPlatformAdmin }).from(users).where(eq(users.id, userId)).limit(1);
    if (!target) throw new AppError("notFound");
    if (target.isPlatformAdmin && (await otherActiveAdmins(userId)) < 1) throw new ForbiddenError("at least one admin required");
  }
  const [u] = await db
    .update(users)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(users.id, userId))
    .returning({ email: users.email });
  if (!u) throw new AppError("notFound");
  if (disabled) await destroyAllSessions(userId);
  await audit({ userId: admin.id, action: disabled ? "admin.user.disable" : "admin.user.enable", entityType: "user", entityId: userId, data: { email: u.email } });
  return null;
});

export const adminSendPasswordReset = action(z.object({ userId: uuid }), async ({ userId }) => {
  const admin = await requirePlatformAdmin();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new AppError("notFound");
  if (u.disabledAt) throw new AppError("accountDisabled");
  await sendPasswordSetupLink(u, "reset");
  await audit({ userId: admin.id, action: "admin.user.send_reset", entityType: "user", entityId: userId, data: { email: u.email } });
  return null;
});
