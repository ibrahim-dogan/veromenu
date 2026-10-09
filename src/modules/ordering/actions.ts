"use server";
import { z } from "zod";
import { action } from "@/core/http/action";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import { updateOrderStatus } from "./service";

const status = z.enum(["pending", "accepted", "preparing", "ready", "served", "rejected", "cancelled"]);

export const updateOrderStatusAction = action(
  z.object({
    restaurantId: z.uuid(),
    orderId: z.uuid(),
    status,
    reason: z.string().trim().max(300).nullish(),
  }),
  async ({ restaurantId, orderId, status: to, reason }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "orders.manage");
    const o = await updateOrderStatus(restaurantId, orderId, to, ctx.user.id, reason);
    if (to === "rejected" || to === "cancelled") {
      await audit({ restaurantId, userId: ctx.user.id, action: `orders.${to}`, entityType: "order", entityId: orderId, data: { number: o.number, reason } });
    }
    return { status: o.status };
  },
);
