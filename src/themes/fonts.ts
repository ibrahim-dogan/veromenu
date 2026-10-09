import { Barlow, Bebas_Neue, Caveat, Cormorant_Garamond, Inter, Lora, Nunito, Playfair_Display, Source_Sans_3, Space_Grotesk } from "next/font/google";
import { FONT_PAIRINGS, isFontPairing, type FontPairingId } from "./font-pairings";

/**
 * Guest-menu fonts. `preload: false` → only the faces actually used by the active theme/pairing are
 * downloaded by the browser (the @font-face rules are cheap). `display: swap` + size-adjusted fallbacks
 * keep layout shift minimal. Variable fonts need no weight list; static ones only load the weights used.
 */
const playfair = Playfair_Display({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--gf-playfair", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--gf-lora", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--gf-cormorant", display: "swap", preload: false });
const sourceSans = Source_Sans_3({ subsets: ["latin", "latin-ext", "cyrillic", "greek"], variable: "--gf-source-sans", display: "swap", preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], variable: "--gf-space-grotesk", display: "swap", preload: false });
const inter = Inter({ subsets: ["latin", "latin-ext", "cyrillic", "greek"], variable: "--gf-inter", display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--gf-nunito", display: "swap", preload: false });
const caveat = Caveat({ subsets: ["latin", "latin-ext", "cyrillic"], variable: "--gf-caveat", display: "swap", preload: false });
const barlow = Barlow({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"], variable: "--gf-barlow", display: "swap", preload: false });
const bebas = Bebas_Neue({ subsets: ["latin", "latin-ext"], weight: "400", variable: "--gf-bebas", display: "swap", preload: false });

const FAMILY_VAR: Record<string, string> = {
  "Playfair Display": "--gf-playfair",
  Lora: "--gf-lora",
  "Cormorant Garamond": "--gf-cormorant",
  "Source Sans 3": "--gf-source-sans",
  "Space Grotesk": "--gf-space-grotesk",
  Inter: "--gf-inter",
  Nunito: "--gf-nunito",
  Caveat: "--gf-caveat",
  Barlow: "--gf-barlow",
  "Bebas Neue": "--gf-bebas",
};

/** Class names that define all --gf-* variables (put on the guest root element). */
export const guestFontVariables = [playfair, lora, cormorant, sourceSans, spaceGrotesk, inter, nunito, caveat, barlow, bebas]
  .map((f) => f.variable)
  .join(" ");

const SYSTEM_SANS = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif";
const SYSTEM_SERIF = "ui-serif, Georgia, 'Noto Serif', serif";

/** CSS variables --g-font-display / --g-font-body for a pairing (system fallbacks cover Arabic, CJK, Greek …). */
export function fontPairingVars(id: string, fallback: FontPairingId): Record<string, string> {
  const p = FONT_PAIRINGS[isFontPairing(id) ? id : fallback];
  const serifish = (f: string) => ["Playfair Display", "Lora", "Cormorant Garamond"].includes(f);
  const stack = (f: string) => `var(${FAMILY_VAR[f]}), ${serifish(f) ? SYSTEM_SERIF : SYSTEM_SANS}`;
  return { "--g-font-display": stack(p.display), "--g-font-body": stack(p.body) };
}
