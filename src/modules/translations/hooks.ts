import "server-only";
import { and, eq, inArray, ne, sql as dsql } from "drizzle-orm";
import type { DbOrTx } from "@/core/db";
import { reviewTasks, translations, type TranslatableEntity } from "@/core/db/schema";
import { hashSource, loadEntityTexts } from "./source";

/**
 * Called by the menu service whenever a source text (name/description) changes or an entity is deleted.
 * Implemented by the translations module: marks existing translations "stale" (sourceHash mismatch)
 * and optionally queues re-translation. Keep this signature stable – it is the contract.
 *
 * - Translations whose sourceHash no longer matches the new source text become `stale`
 *   (guests then see the source text until someone re-translates or re-approves).
 * - If the source text was cleared, its translations are deleted.
 * - Open translation review tasks for the affected fields are dismissed (they refer to an old text).
 */
export async function onSourceTextChanged(
  tx: DbOrTx,
  restaurantId: string,
  entityType: TranslatableEntity,
  entityId: string,
  fields: string[],
): Promise<void> {
  if (!fields.length) return;
  const texts = await loadEntityTexts(tx, entityType, entityId);
  if (!texts) return;
  const now = new Date();
  for (const field of fields) {
    const text = (texts as Record<string, string | null | undefined>)[field]?.trim();
    const scope = and(
      eq(translations.restaurantId, restaurantId),
      eq(translations.entityType, entityType),
      eq(translations.entityId, entityId),
      eq(translations.field, field),
    );
    if (!text) {
      await tx.delete(translations).where(scope);
    } else {
      await tx
        .update(translations)
        .set({ status: "stale", updatedAt: now })
        .where(and(scope, ne(translations.sourceHash, hashSource(text)), ne(translations.status, "stale")));
    }
  }
  await tx
    .update(reviewTasks)
    .set({ status: "dismissed", resolvedAt: now })
    .where(
      and(
        eq(reviewTasks.restaurantId, restaurantId),
        eq(reviewTasks.kind, "translation"),
        eq(reviewTasks.entityId, entityId),
        eq(reviewTasks.status, "open"),
        inArray(dsql<string>`${reviewTasks.payload}->>'field'`, fields),
      ),
    );
}

/** Removes translations (and open review tasks) of deleted entities. Works inside the caller's transaction. */
export async function onEntityDeleted(tx: DbOrTx, entityType: TranslatableEntity, entityIds: string[]): Promise<void> {
  if (!entityIds.length) return;
  await tx.delete(translations).where(and(eq(translations.entityType, entityType), inArray(translations.entityId, entityIds)));
  await tx
    .update(reviewTasks)
    .set({ status: "dismissed", resolvedAt: new Date() })
    .where(and(eq(reviewTasks.entityType, entityType), inArray(reviewTasks.entityId, entityIds), eq(reviewTasks.status, "open")));
}
