import "server-only";
import { db, type DbOrTx } from "@/core/db";
import { auditLog } from "@/core/db/schema";

export async function audit(
  entry: {
    restaurantId?: string | null;
    userId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    data?: Record<string, unknown>;
  },
  tx: DbOrTx = db,
) {
  await tx.insert(auditLog).values({
    restaurantId: entry.restaurantId ?? null,
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    data: entry.data,
  });
}
