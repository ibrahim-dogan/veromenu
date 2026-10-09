import type { RestaurantSettings, TranslationStatus } from "@/core/db/schema";

/**
 * Guest visibility contract (read side is implemented by the guest module):
 *  - approved      → always shown
 *  - machine       → shown unless settings.translations.guestsSeeOnlyApproved
 *  - needs_review / stale → never shown (guest sees the source text)
 * Callers should additionally treat a row as stale when its sourceHash no longer matches the source
 * (see hashSource in ./source) – the hooks normally take care of that.
 */
export function isVisibleToGuests(status: TranslationStatus, settings: Pick<RestaurantSettings, "translations"> | null | undefined): boolean {
  if (status === "approved") return true;
  if (status === "machine") return !settings?.translations?.guestsSeeOnlyApproved;
  return false;
}
