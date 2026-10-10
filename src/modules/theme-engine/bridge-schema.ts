/**
 * zod schema of BridgeMessage (frame → host). The host must also check `event.source === iframe.contentWindow`,
 * `event.origin === "null"` (opaque sandbox origin) and that ids exist in the loaded menu.
 */
import { z } from "zod";
import type { BridgeMessage } from "./types";

const id = z.string().min(1).max(64);

export const bridgeMessageSchema: z.ZodType<BridgeMessage> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("vm:ready"), height: z.number().min(0).max(1_000_000).optional() }),
  z.object({ type: z.literal("vm:openItem"), itemId: id }),
  z.object({ type: z.literal("vm:addToCart"), itemId: id, variantId: id.nullable().optional(), quantity: z.number().int().min(1).max(99).optional() }),
  z.object({ type: z.literal("vm:setLanguage"), code: z.string().regex(/^[a-z]{2}$/) }),
  z.object({ type: z.literal("vm:openCart") }),
  z.object({ type: z.literal("vm:openInfo") }),
  z.object({ type: z.literal("vm:track"), event: z.enum(["item_view", "category_view"]), id }),
]);
