import { commonFields } from "../common-fields";
import type { ThemeManifest } from "../types";

const manifest: ThemeManifest = {
  id: "modern",
  name: "Modern",
  version: "1.0.0",
  author: "VeroMenu",
  description: {
    de: "Große Bildkarten, klebende Kategorie-Chips und kräftige Typografie – ideal für Cafés, Burger und Bowls.",
    en: "Big image cards, sticky category chips and bold type – ideal for cafés, burgers and bowls.",
    tr: "Büyük görsel kartlar, yapışkan kategori çipleri ve güçlü tipografi – kafeler, burgerler ve bowl'lar için ideal.",
  },
  preview: "/themes/modern.svg",
  fields: [
    ...commonFields({ primaryColor: "#ff5a36", accentColor: "#1f2937", fontPairing: "modern", radius: 16, fonts: ["modern", "clean", "friendly", "editorial"] }),
    {
      key: "layout",
      type: "select",
      default: "list",
      label: { de: "Kartenlayout", en: "Card layout", tr: "Kart düzeni" },
      options: [
        { value: "list", label: { de: "Liste (Bild rechts)", en: "List (image right)", tr: "Liste (görsel sağda)" } },
        { value: "grid", label: { de: "Raster (Bild oben)", en: "Grid (image on top)", tr: "Izgara (görsel üstte)" } },
      ],
    },
    {
      key: "heroStyle",
      type: "select",
      default: "cover",
      label: { de: "Kopfbereich", en: "Header", tr: "Başlık alanı" },
      options: [
        { value: "cover", label: { de: "Titelbild", en: "Cover image", tr: "Kapak görseli" } },
        { value: "compact", label: { de: "Kompakt", en: "Compact", tr: "Kompakt" } },
      ],
    },
  ],
};

export default manifest;
