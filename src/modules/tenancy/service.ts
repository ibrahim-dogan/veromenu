import "server-only";
import { and, eq, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { memberships, menus, restaurants, roles } from "@/core/db/schema";
import type { RestaurantSettings } from "@/core/db/schema";
import { DEFAULT_ROLES } from "@/core/auth/permissions";
import { slugify } from "@/core/utils";
import { audit } from "@/core/audit";

export const DEFAULT_SETTINGS: RestaurantSettings = {
  menuMode: "digital",
  ordering: { enabled: false, acceptMode: "manual", requireTable: true, allowNotes: true },
  translations: { guestsSeeOnlyApproved: false, autoApproveThreshold: 4.5 },
};

export async function uniqueSlug(name: string) {
  const base = slugify(name) || "restaurant";
  let slug = base;
  for (let i = 2; ; i++) {
    const [hit] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
}

/**
 * Creates a restaurant with default roles, an empty main menu and the owner membership.
 * Used by self-signup onboarding and by platform admins.
 */
export async function createRestaurant(opts: {
  name: string;
  ownerUserId: string;
  createdBy: string;
  plan?: string;
  uiLocale?: string;
}) {
  const slug = await uniqueSlug(opts.name);
  const lang = opts.uiLocale ?? "de";
  return db.transaction(async (tx) => {
    const [r] = await tx
      .insert(restaurants)
      .values({
        name: opts.name,
        slug,
        plan: opts.plan ?? "free",
        settings: DEFAULT_SETTINGS,
        createdBy: opts.createdBy,
      })
      .returning();
    const roleRows = await tx
      .insert(roles)
      .values(
        DEFAULT_ROLES.map((d) => ({
          restaurantId: r.id,
          key: d.key,
          name: d.name[lang] ?? d.name.de,
          permissions: d.permissions,
        })),
      )
      .returning();
    const owner = roleRows.find((x) => x.key === "owner")!;
    await tx.insert(memberships).values({ restaurantId: r.id, userId: opts.ownerUserId, roleId: owner.id });
    await tx.insert(menus).values({ restaurantId: r.id, name: lang === "de" ? "Speisekarte" : lang === "tr" ? "Menü" : "Menu" });
    await audit({ restaurantId: r.id, userId: opts.createdBy, action: "restaurant.create", data: { name: r.name } }, tx);
    return r;
  });
}

export async function getOwnerRoleId(restaurantId: string) {
  const [r] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.restaurantId, restaurantId), eq(roles.key, "owner")))
    .limit(1);
  return r?.id;
}

export async function countRestaurants() {
  const [r] = await db.select({ n: dsql<number>`count(*)::int` }).from(restaurants);
  return r.n;
}
