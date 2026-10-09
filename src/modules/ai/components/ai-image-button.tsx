"use client";
/**
 * CONTRACT (owned by the AI-studio module): button that opens the AI image dialog for an item or category.
 * Generates an image (optionally from a reference photo), shows a preview, and on accept saves it as
 * media (kind "ai_generated") and assigns it to the target. Calls onApplied(mediaId) afterwards.
 */
export function AiImageButton(_props: {
  restaurantId: string;
  target: { type: "item" | "category"; id: string };
  onApplied?: (mediaId: string) => void;
}) {
  return null;
}
