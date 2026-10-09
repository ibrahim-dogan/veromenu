"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/core/db";
import { restaurants } from "@/core/db/schema";
import { action, AppError } from "@/core/http/action";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import { getThemeManifest, isThemeId } from "@/themes";
import { sanitizeConfig } from "@/themes/config";

/** Saves the guest-menu theme + config. Config is sanitized against the theme's fields (unknown keys dropped). */
export const saveThemeAction = action(
  z.object({
    restaurantId: z.string().uuid(),
    themeId: z.string().min(1).max(64),
    config: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])),
  }),
  async ({ restaurantId, themeId, config }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "theme.manage");
    if (!isThemeId(themeId)) throw new AppError("validation", "unknown theme");
    const clean = sanitizeConfig(getThemeManifest(themeId), config);
    await db.update(restaurants).set({ themeId, themeConfig: clean, updatedAt: new Date() }).where(eq(restaurants.id, restaurantId));
    await audit({
      restaurantId,
      userId: ctx.user.id,
      action: "design.theme.update",
      entityType: "restaurant",
      entityId: restaurantId,
      data: { from: ctx.restaurant.themeId, to: themeId, config: clean },
    });
    return { themeId, config: clean };
  },
);
