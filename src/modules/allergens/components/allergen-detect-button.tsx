"use client";
/**
 * CONTRACT (owned by the AI-quality module): runs AI allergen/additive detection for one item and
 * shows the suggestion (per allergen: contains / may contain / unlikely + reason + confidence).
 * The user confirms or edits → confirmAllergens(). Ambiguous results create a review task.
 */
export function AllergenDetectButton(_props: { restaurantId: string; itemId: string; onDone?: () => void }) {
  return null;
}
