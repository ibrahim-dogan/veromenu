import { commonFields } from "../common-fields";
import type { ThemeManifest } from "../types";

const manifest: ThemeManifest = {
  id: "bistro",
  name: "Bistro",
  version: "1.0.0",
  author: "VeroMenu",
  description: {
    de: "Dunkle Kreidetafel mit Neon-Akzent und hohem Kontrast – für Bars, Bistros und Abendkarten.",
    en: "Dark chalkboard with a neon accent and high contrast – for bars, bistros and evening menus.",
    tr: "Neon vurgulu, yüksek kontrastlı koyu kara tahta – barlar, bistrolar ve akşam menüleri için.",
  },
  preview: "/themes/bistro.svg",
  fields: [
    ...commonFields({ primaryColor: "#ffd23f", accentColor: "#ff4fa3", fontPairing: "chalk", radius: 10, showImages: false, fonts: ["chalk", "neon", "modern", "clean"] }),
    {
      key: "board",
      type: "select",
      default: "chalkboard",
      label: { de: "Hintergrund", en: "Background", tr: "Arka plan" },
      options: [
        { value: "chalkboard", label: { de: "Kreidetafel", en: "Chalkboard", tr: "Kara tahta" } },
        { value: "black", label: { de: "Schwarz", en: "Black", tr: "Siyah" } },
        { value: "navy", label: { de: "Nachtblau", en: "Midnight blue", tr: "Gece mavisi" } },
      ],
    },
    { key: "neonGlow", type: "boolean", default: true, label: { de: "Neon-Leuchten", en: "Neon glow", tr: "Neon parıltısı" } },
  ],
};

export default manifest;
