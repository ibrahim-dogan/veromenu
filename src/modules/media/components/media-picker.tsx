"use client";
/**
 * CONTRACT (owned by the menu/media module): pick an existing media item of the restaurant or upload a new one.
 * Upload goes to POST /api/restaurants/[rid]/media (multipart "file") → { id, url, variants }.
 */
export function MediaPicker(_props: {
  restaurantId: string;
  value: string | null;
  onChange: (mediaId: string | null) => void;
  accept?: "image" | "pdf" | "any";
  label?: string;
}) {
  return null;
}
