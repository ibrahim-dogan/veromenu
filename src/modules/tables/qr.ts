import "server-only";
import QRCode from "qrcode";

const DARK = "#1c1917";
const OPTS = { errorCorrectionLevel: "M" as const, margin: 2 };

export const clampQrSize = (n: unknown, fallback = 512) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(2048, Math.max(128, Math.round(v))) : fallback;
};

export function qrPng(text: string, size = 512) {
  return QRCode.toBuffer(text, { ...OPTS, type: "png", width: size, color: { dark: DARK, light: "#ffffff" } });
}

export function qrSvg(text: string, size = 512) {
  return QRCode.toString(text, { ...OPTS, type: "svg", width: size, color: { dark: DARK, light: "#ffffff" } });
}

/** Raw module matrix – used to draw crisp vector QR codes into PDFs. */
export function qrMatrix(text: string) {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = q.modules.size;
  return { size, isDark: (row: number, col: number) => q.modules.get(row, col) === 1 };
}
