"use server";
import { z } from "zod";
import { action } from "@/core/http/action";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import { deleteMedia, mediaUsage, updateMediaAlt, usageTotal } from "./service";

const id = z.string().uuid();

export const updateMediaAltAction = action(
  z.object({ restaurantId: id, mediaId: id, alt: z.string().trim().max(300).nullable() }),
  async ({ restaurantId, mediaId, alt }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "media.manage");
    await updateMediaAlt(restaurantId, mediaId, alt || null);
    await audit({ restaurantId, userId: ctx.user.id, action: "media.alt", entityType: "media", entityId: mediaId });
    return { ok: true };
  },
);

/**
 * Deletes a media item. If it is still in use and `force` is not set, nothing is deleted and the usage
 * is returned so the UI can warn first.
 */
export const deleteMediaAction = action(
  z.object({ restaurantId: id, mediaId: id, force: z.boolean().default(false) }),
  async ({ restaurantId, mediaId, force }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "media.manage");
    const usage = (await mediaUsage(restaurantId, [mediaId])).get(mediaId)!;
    if (usageTotal(usage) > 0 && !force) return { deleted: false as const, usage };
    await deleteMedia(restaurantId, mediaId);
    await audit({ restaurantId, userId: ctx.user.id, action: "media.delete", entityType: "media", entityId: mediaId, data: { usage } });
    return { deleted: true as const, usage };
  },
);
