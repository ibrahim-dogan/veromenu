/**
 * Font pairings a theme can offer through a `font` field. Pure data (client-safe).
 * The actual next/font instances live in ./fonts.ts. Labels: messages "themes.fonts.<id>".
 */
export const FONT_PAIRINGS = {
  elegant: { display: "Playfair Display", body: "Lora" },
  editorial: { display: "Cormorant Garamond", body: "Source Sans 3" },
  modern: { display: "Space Grotesk", body: "Inter" },
  clean: { display: "Inter", body: "Inter" },
  friendly: { display: "Nunito", body: "Nunito" },
  chalk: { display: "Caveat", body: "Barlow" },
  neon: { display: "Bebas Neue", body: "Barlow" },
} as const;

export type FontPairingId = keyof typeof FONT_PAIRINGS;
export const FONT_PAIRING_IDS = Object.keys(FONT_PAIRINGS) as FontPairingId[];
export const isFontPairing = (v: unknown): v is FontPairingId => typeof v === "string" && v in FONT_PAIRINGS;
