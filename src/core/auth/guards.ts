import "server-only";
import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/core/db";
import { memberships, restaurants, roles } from "@/core/db/schema";
import { redirect } from "@/core/i18n/navigation";
import { getCurrentUser, type SessionUser } from "./session";
import { PERMISSIONS, type Permission } from "./permissions";
import { ForbiddenError } from "@/core/http/errors";

export { ForbiddenError };

/** For pages/layouts: redirects to /login when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const locale = await getLocale();
    redirect({ href: "/login", locale });
  }
  return user!;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) throw new ForbiddenError();
  return user;
}

export type Restaurant = typeof restaurants.$inferSelect;

export type RestaurantContext = {
  user: SessionUser;
  restaurant: Restaurant;
  permissions: Set<Permission>;
  roleName: string | null;
  /** Platform admin acting inside a restaurant without membership. */
  isAdminOverride: boolean;
  can: (p: Permission) => boolean;
};

/**
 * Loads the restaurant + the user's effective permissions.
 * Platform admins get every permission (support / impersonation).
 * Returns null when the user has no access.
 */
export const getRestaurantContext = cache(async (restaurantId: string): Promise<RestaurantContext | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!/^[0-9a-f-]{36}$/i.test(restaurantId)) return null;
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!restaurant) return null;

  const [m] = await db
    .select({ permissions: roles.permissions, roleName: roles.name })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(and(eq(memberships.restaurantId, restaurantId), eq(memberships.userId, user.id)))
    .limit(1);

  let perms: Set<Permission>;
  let isAdminOverride = false;
  if (m) perms = new Set(m.permissions as Permission[]);
  else if (user.isPlatformAdmin) {
    perms = new Set(PERMISSIONS);
    isAdminOverride = true;
  } else return null;

  return {
    user,
    restaurant,
    permissions: perms,
    roleName: m?.roleName ?? null,
    isAdminOverride,
    can: (p) => perms.has(p),
  };
});

/** For pages: 404-like redirect to dashboard home when no access, throws when permission missing. */
export async function requireRestaurant(restaurantId: string, permission?: Permission): Promise<RestaurantContext> {
  await requireUser();
  const ctx = await getRestaurantContext(restaurantId);
  if (!ctx) {
    const locale = await getLocale();
    redirect({ href: "/dashboard", locale });
  }
  if (permission && !ctx!.can(permission)) throw new ForbiddenError(`missing permission ${permission}`);
  return ctx!;
}

/** For server actions / route handlers: never redirects, throws ForbiddenError. */
export async function assertRestaurantPermission(restaurantId: string, permission: Permission) {
  const ctx = await getRestaurantContext(restaurantId);
  if (!ctx || !ctx.can(permission)) throw new ForbiddenError(`missing permission ${permission}`);
  return ctx;
}

export async function listUserRestaurants(userId: string) {
  return db
    .select({ id: restaurants.id, name: restaurants.name, slug: restaurants.slug, roleName: roles.name })
    .from(memberships)
    .innerJoin(restaurants, eq(restaurants.id, memberships.restaurantId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(eq(memberships.userId, userId))
    .orderBy(restaurants.name);
}
