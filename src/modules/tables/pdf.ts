import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { qrMatrix } from "./qr";

/**
 * Printable QR material (pdf-lib, vector QR codes):
 *  - "sheet": A4 with 6 cut-out cards (2 × 3)
 *  - "tent":  one A6 table tent per table
 * Standard PDF fonts only support WinAnsi → texts are transliterated (ş→s …) where needed.
 */
export type QrCard = { label: string; sublabel?: string | null; url: string };
export type QrPdfLayout = "sheet" | "tent";

/** Short guest-facing call to action per content language (only WinAnsi-safe languages). */
const SCAN_PHRASES: Record<string, string> = {
  de: "Speisekarte scannen",
  en: "Scan for menu",
  tr: "Menü için okutun",
  fr: "Scannez pour le menu",
  it: "Scansiona per il menù",
  es: "Escanea para ver la carta",
  nl: "Scan voor het menu",
  pt: "Digitalize para ver o menu",
  pl: "Zeskanuj, aby zobaczyć menu",
  da: "Scan for menuen",
};

export function scanPhrases(locales: string[], max = 4) {
  const order = Array.from(new Set(["de", ...locales, "en"]));
  return order.filter((l) => SCAN_PHRASES[l]).slice(0, max).map((l) => SCAN_PHRASES[l]);
}

const INK = rgb(0.11, 0.098, 0.09); // stone-900
const MUTED = rgb(0.47, 0.44, 0.42); // stone-500
const LINE = rgb(0.84, 0.83, 0.82); // stone-300
const BRAND = rgb(0.153, 0.318, 0.235); // brand-700
const WHITE = rgb(1, 1, 1);

const TRANSLIT: Record<string, string> = {
  ş: "s", Ş: "S", ğ: "g", Ğ: "G", ı: "i", İ: "I", ł: "l", Ł: "L", ő: "ö", Ő: "Ö", ű: "ü", Ű: "Ü",
  ą: "a", ę: "e", ś: "s", ć: "c", ź: "z", ż: "z", ń: "n", Ą: "A", Ę: "E", Ś: "S", Ć: "C", Ź: "Z", Ż: "Z", Ń: "N",
};

function sanitize(font: PDFFont, input: string) {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  for (const raw of input) {
    const ch = TRANSLIT[raw] ?? raw;
    for (const c of ch) {
      if (supported.has(c.codePointAt(0)!)) out += c;
      else {
        const base = c.normalize("NFKD").replace(/[̀-ͯ]/g, "");
        if (base && [...base].every((b) => supported.has(b.codePointAt(0)!))) out += base;
      }
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Largest font size (≤ size, ≥ min) that fits; truncates with an ellipsis as last resort. */
function fit(font: PDFFont, text: string, size: number, maxWidth: number, min = 7) {
  let s = size;
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t, s) > maxWidth) t = t.slice(0, -2) + "…";
  return { text: t, size: s, width: font.widthOfTextAtSize(t, s) };
}

function centered(page: PDFPage, font: PDFFont, raw: string, cx: number, y: number, size: number, maxWidth: number, color = INK) {
  const text = sanitize(font, raw);
  if (!text) return;
  const f = fit(font, text, size, maxWidth);
  page.drawText(f.text, { x: cx - f.width / 2, y, size: f.size, font, color });
}

/** Wraps words into at most `maxLines` centered lines. */
function centeredWrapped(
  page: PDFPage,
  font: PDFFont,
  raw: string,
  cx: number,
  topY: number,
  size: number,
  maxWidth: number,
  maxLines: number,
  color = MUTED,
) {
  const words = sanitize(font, raw).split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  lines.slice(0, maxLines).forEach((line, i) => {
    const f = fit(font, line, size, maxWidth, size);
    page.drawText(f.text, { x: cx - f.width / 2, y: topY - (i + 1) * size * 1.3, size, font, color });
  });
}

function drawQr(page: PDFPage, url: string, x: number, y: number, size: number) {
  const m = qrMatrix(url);
  const quiet = 2;
  const cell = size / (m.size + quiet * 2);
  page.drawRectangle({ x, y, width: size, height: size, color: WHITE });
  for (let r = 0; r < m.size; r++) {
    let c = 0;
    while (c < m.size) {
      if (!m.isDark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < m.size && m.isDark(r, c)) c++;
      page.drawRectangle({
        x: x + (quiet + start) * cell,
        y: y + size - (quiet + r + 1) * cell,
        width: (c - start) * cell + 0.05,
        height: cell + 0.05,
        color: INK,
      });
    }
  }
}

async function embedLogo(doc: PDFDocument, logo: Buffer | null | undefined): Promise<PDFImage | null> {
  if (!logo) return null;
  try {
    const png = await sharp(logo, { failOn: "none" }).rotate().resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return await doc.embedPng(png);
  } catch {
    return null;
  }
}

function drawLogo(page: PDFPage, img: PDFImage, cx: number, topY: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, { x: cx - w / 2, y: topY - h, width: w, height: h });
  return h;
}

export async function buildQrPdf(opts: {
  layout: QrPdfLayout;
  restaurantName: string;
  cards: QrCard[];
  phrases: string[];
  logo?: Buffer | null;
  title?: string;
}) {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title ?? `${opts.restaurantName} – QR`);
  doc.setCreator("VeroMenu");
  doc.setProducer("VeroMenu");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedLogo(doc, opts.logo);
  const phraseLine = opts.phrases.join(" · ");

  if (opts.layout === "tent") {
    // A6 portrait, one card per page
    const W = 297.64;
    const H = 419.53;
    const phrases = opts.phrases.slice(0, 4);
    for (const card of opts.cards) {
      const page = doc.addPage([W, H]);
      const cx = W / 2;
      page.drawRectangle({ x: 0, y: 0, width: W, height: 10, color: BRAND });
      // Measure the stack, then centre it vertically above the brand bar.
      const logoH = logo ? Math.min(44, (150 / logo.width) * logo.height) : 0;
      const qr = logo ? 185 : 205;
      const total = (logo ? logoH + 8 : 0) + 26 + qr + 16 + 34 + (card.sublabel ? 15 : 0) + phrases.length * 13;
      let y = Math.min(H - 22, 10 + (H - 10 + total) / 2);
      if (logo) y -= drawLogo(page, logo, cx, y, 150, 44) + 8;
      centered(page, bold, opts.restaurantName, cx, y - 15, 16, W - 40);
      y -= 26;
      drawQr(page, card.url, cx - qr / 2, y - qr - 4, qr);
      y -= qr + 16;
      centered(page, bold, card.label, cx, y - 26, 26, W - 40);
      y -= 34;
      if (card.sublabel) {
        centered(page, regular, card.sublabel, cx, y - 11, 10, W - 40, MUTED);
        y -= 15;
      }
      phrases.forEach((p, i) => centered(page, regular, p, cx, y - 12 - i * 13, 10, W - 40, MUTED));
    }
  } else {
    // A4, 2 × 3 cards with dashed cut lines
    const W = 595.28;
    const H = 841.89;
    const M = 28;
    const cols = 2;
    const rows = 3;
    const cw = (W - 2 * M) / cols;
    const ch = (H - 2 * M) / rows;
    const pad = 16;
    for (let i = 0; i < opts.cards.length; i++) {
      const slot = i % (cols * rows);
      const page = slot === 0 ? doc.addPage([W, H]) : doc.getPages()[doc.getPageCount() - 1];
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const x0 = M + col * cw;
      const y0 = H - M - (row + 1) * ch;
      const cx = x0 + cw / 2;
      const card = opts.cards[i];
      page.drawRectangle({ x: x0, y: y0, width: cw, height: ch, borderColor: LINE, borderWidth: 0.6, borderDashArray: [4, 3] });
      page.drawRectangle({ x: x0 + 0.6, y: y0 + ch - 5, width: cw - 1.2, height: 4.4, color: BRAND });

      // header (top)
      let top = y0 + ch - pad - 2;
      if (logo) top -= drawLogo(page, logo, cx, top, 110, 26) + 4;
      centered(page, bold, opts.restaurantName, cx, top - 11, 12, cw - 2 * pad);
      top -= 18;

      // footer (bottom-up): phrases (2 lines) + sublabel + label
      const phrasesTop = y0 + pad + 2 * 8 * 1.3;
      centeredWrapped(page, regular, phraseLine, cx, phrasesTop, 8, cw - 2 * pad, 2);
      let labelBase = phrasesTop + 6;
      if (card.sublabel) {
        centered(page, regular, card.sublabel, cx, labelBase, 8.5, cw - 2 * pad, MUTED);
        labelBase += 12;
      }
      centered(page, bold, card.label, cx, labelBase, 17, cw - 2 * pad);
      const bottom = labelBase + 22;

      const qr = Math.min(160, top - bottom - 8, cw - 2 * pad);
      drawQr(page, card.url, cx - qr / 2, bottom + (top - bottom - qr) / 2, qr);
    }
  }
  return Buffer.from(await doc.save());
}
