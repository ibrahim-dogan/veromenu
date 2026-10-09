import { commonFields } from "../common-fields";
import type { ThemeManifest } from "../types";

const manifest: ThemeManifest = {
  id: "classic",
  name: "Classic",
  version: "1.0.0",
  author: "VeroMenu",
  description: {
    de: "Elegante Serifenschrift auf warmem Papier, klassische Liste mit gepunkteten Preislinien – wie eine gedruckte Speisekarte.",
    en: "Elegant serif type on warm paper, a classic list with dotted price leaders – like a printed menu.",
    tr: "Sıcak kâğıt üzerinde zarif serif yazı, noktalı fiyat çizgileriyle klasik liste – basılı bir menü gibi.",
  },
  preview: "/themes/classic.svg",
  fields: [
    ...commonFields({ primaryColor: "#7a2e2e", accentColor: "#b08d57", fontPairing: "elegant", radius: 6, fonts: ["elegant", "editorial", "friendly", "clean"] }),
    {
      key: "leaderStyle",
      type: "select",
      default: "dots",
      label: { de: "Preislinie", en: "Price leader", tr: "Fiyat çizgisi" },
      options: [
        { value: "dots", label: { de: "Gepunktet", en: "Dotted", tr: "Noktalı" } },
        { value: "line", label: { de: "Linie", en: "Line", tr: "Düz çizgi" } },
        { value: "none", label: { de: "Keine", en: "None", tr: "Yok" } },
      ],
    },
    { key: "paperTexture", type: "boolean", default: true, label: { de: "Papierstruktur", en: "Paper texture", tr: "Kâğıt dokusu" } },
  ],
};

export default manifest;
