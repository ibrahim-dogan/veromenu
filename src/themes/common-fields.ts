import type { FontPairingId } from "./font-pairings";
import type { ThemeField } from "./types";

/**
 * Config fields every bundled theme offers (colors, fonts, images, density, corners).
 * Optional for third-party themes – a theme may define all fields itself.
 */
export function commonFields(d: { primaryColor: string; accentColor: string; fontPairing: FontPairingId; radius: number; showImages?: boolean; fonts?: FontPairingId[] }): ThemeField[] {
  return [
    { key: "primaryColor", type: "color", default: d.primaryColor, label: { de: "Hauptfarbe", en: "Primary colour", tr: "Ana renk" } },
    { key: "accentColor", type: "color", default: d.accentColor, label: { de: "Akzentfarbe", en: "Accent colour", tr: "Vurgu rengi" } },
    {
      key: "fontPairing",
      type: "font",
      default: d.fontPairing,
      options: d.fonts,
      label: { de: "Schriftpaar", en: "Font pairing", tr: "Yazı tipi eşleşmesi" },
    },
    { key: "showImages", type: "boolean", default: d.showImages ?? true, label: { de: "Gerichtfotos anzeigen", en: "Show dish photos", tr: "Yemek fotoğraflarını göster" } },
    {
      key: "density",
      type: "select",
      default: "comfortable",
      label: { de: "Abstände", en: "Spacing", tr: "Aralıklar" },
      options: [
        { value: "comfortable", label: { de: "Großzügig", en: "Comfortable", tr: "Ferah" } },
        { value: "dense", label: { de: "Kompakt", en: "Compact", tr: "Sıkı" } },
      ],
    },
    { key: "radius", type: "range", default: d.radius, min: 0, max: 24, step: 1, unit: "px", label: { de: "Eckenrundung", en: "Corner radius", tr: "Köşe yuvarlaklığı" } },
  ];
}
