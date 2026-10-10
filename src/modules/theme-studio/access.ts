import "server-only";
/**
 * Who may work on which kind of design:
 *   menu themes  → `theme.manage`
 *   print designs (QR table cards, kind "print") → `tables.manage` OR `theme.manage`
 * Plan gating (feature `theme_studio`) applies to both.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/core/db";
import { themes } from "@/core/db/schema";
import { assertRestaurantPermission, getRestaurantContext, type RestaurantContext } from "@/core/auth/guards";
import { AppError, ForbiddenError } from "@/core/http/errors";
import { planHas } from "@/modules/billing/plans";
import type { ThemeKind } from "@/modules/theme-engine/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const canManageKind = (ctx: Pick<RestaurantContext, "can">, kind: ThemeKind) => ctx.can("theme.manage") || (kind === "print" && ctx.can("tables.manage"));

/** Kind of an own or library theme (404 when not visible to the restaurant). */
export async function themeKindOf(restaurantId: string, themeId: string): Promise<ThemeKind> {
  if (!UUID.test(themeId) || !UUID.test(restaurantId)) throw new AppError("notFound");
  const [t] = await db
    .select({ kind: themes.kind })
    .from(themes)
    .where(and(eq(themes.id, themeId), or(eq(themes.restaurantId, restaurantId), isNull(themes.restaurantId))))
    .limit(1);
  if (!t) throw new AppError("notFound");
  return t.kind === "print" ? "print" : "menu";
}

/**
 * Restaurant context for a design action. `target` is the kind (create actions) or a theme id (the kind is
 * looked up only when the user lacks `theme.manage`). Throws ForbiddenError / AppError("featureNotInPlan").
 */
export async function designContext(restaurantId: string, target: ThemeKind | { themeId: string } = "menu"): Promise<RestaurantContext & { kind: ThemeKind | null }> {
  const ctx = await getRestaurantContext(restaurantId);
  if (!ctx) throw new ForbiddenError("no access");
  let kind: ThemeKind | null = typeof target === "string" ? target : null;
  if (!ctx.can("theme.manage")) {
    if (kind === null) kind = await themeKindOf(restaurantId, (target as { themeId: string }).themeId);
    if (!canManageKind(ctx, kind)) throw new ForbiddenError("missing permission theme.manage");
  }
  if (!planHas(ctx.restaurant.plan, "theme_studio")) throw new AppError("featureNotInPlan");
  return { ...ctx, kind };
}

/** AI variant: additionally `ai.use`. */
export async function designAiContext(restaurantId: string, target: ThemeKind | { themeId: string }) {
  await assertRestaurantPermission(restaurantId, "ai.use");
  return designContext(restaurantId, target);
}
