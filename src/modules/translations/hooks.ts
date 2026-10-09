import "server-only";
import type { DbOrTx } from "@/core/db";
import type { TranslatableEntity } from "@/core/db/schema";

/**
 * Called by the menu service whenever a source text (name/description) changes or an entity is deleted.
 * Implemented by the translations module: marks existing translations "stale" (sourceHash mismatch)
 * and optionally queues re-translation. Keep this signature stable – it is the contract.
 */
export async function onSourceTextChanged(
  _tx: DbOrTx,
  _restaurantId: string,
  _entityType: TranslatableEntity,
  _entityId: string,
  _fields: string[],
): Promise<void> {}

export async function onEntityDeleted(_tx: DbOrTx, _entityType: TranslatableEntity, _entityIds: string[]): Promise<void> {}
