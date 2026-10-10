/**
 * CONTRACT (implemented by the print-engine engineer). ISOMORPHIC (studio renders previews client-side).
 * Print documents are static HTML: NO theme JavaScript at all (scripts are stripped and blocked by CSP).
 */
import type { ThemePackage, PrintView } from "./types";

export const PRINT_TEMPLATE = "templates/print.liquid";

/**
 * Full printable document: @page size per manifest.print, cards imposed on sheets (crop marks for "a4"),
 * tent-a6 front/back faces, font CSS, theme CSS, one rendered print.liquid per view.
 * `nonce` lets the host add its own print-button script (CSP allows only that nonce).
 */
export async function renderPrintDocument(_opts: {
  pkg: ThemePackage;
  views: PrintView[];
  assetBaseUrl: string;
  guestMessages: Record<string, unknown>;
  media?: Record<string, { url: string }>;
  nonce?: string;
  mode?: "print" | "preview";
}): Promise<{ html: string; errors: string[]; ok: boolean }> {
  throw new Error("theme-engine: renderPrintDocument not implemented yet");
}

/** Realistic sample cards (generic + 3 tables) for previews and AI validation. */
export function samplePrintViews(): PrintView[] {
  throw new Error("theme-engine: samplePrintViews not implemented yet");
}
