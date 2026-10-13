import "server-only";
import type { RestaurantContext } from "@/core/auth/guards";
import { planHas } from "@/modules/billing/plans";
import { canManageKind } from "@/modules/theme-studio/access";
import { KIT_FREE_STEPS, KIT_STEPS, type KitStepKey } from "./types";

/**
 * Plan- and permission-aware step list: Free = sources + import + logo; Starter/Pro (`theme_studio`) add page renders,
 * the design brief, the menu theme (theme.manage) and the print design (theme.manage or tables.manage).
 */
export function kitStepsFor(ctx: Pick<RestaurantContext, "can" | "restaurant">): KitStepKey[] {
  if (!planHas(ctx.restaurant.plan, "theme_studio")) return [...KIT_FREE_STEPS];
  const theme = canManageKind(ctx, "menu");
  const print = canManageKind(ctx, "print");
  return KIT_STEPS.filter((k) => {
    if (k === "theme") return theme;
    if (k === "print") return print;
    if (k === "pages" || k === "brief") return theme || print;
    return true;
  });
}

/** Can the user start the kit at all (menu.edit + ai.use + plan feature ai_import)? */
export const canStartKit = (ctx: Pick<RestaurantContext, "can" | "restaurant">) => ctx.can("menu.edit") && ctx.can("ai.use") && planHas(ctx.restaurant.plan, "ai_import");
