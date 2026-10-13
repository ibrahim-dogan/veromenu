import "server-only";
import path from "node:path";
import { createRequire } from "node:module";
import type { Canvas } from "@napi-rs/canvas";

/**
 * PDF → PNG page renders in Node (pdfjs-dist legacy build + @napi-rs/canvas).
 *
 * Setup notes (pdfjs-dist 6.x in Node):
 * - Node has no Web Workers → pdfjs runs a "fake worker" on the main thread. We import the worker module
 *   ourselves and expose it as `globalThis.pdfjsWorker`, so pdfjs never resolves `workerSrc` at runtime and the
 *   import is statically visible to Next's output file tracing (standalone Docker image).
 * - DOMMatrix / Path2D / ImageData are polyfilled from @napi-rs/canvas and canvases are created by our own
 *   CanvasFactory, so rendering does not depend on pdfjs' internal `require("@napi-rs/canvas")`.
 * - Non-embedded standard fonts (Helvetica, Times … common in generated PDFs), CMaps (CJK) and wasm decoders
 *   (JBIG2/OpenJPEG) are read from the pdfjs-dist package directory via fs → traced via outputFileTracingIncludes.
 */

type Pdfjs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type Napi = typeof import("@napi-rs/canvas");

let loading: Promise<Pdfjs> | null = null;
/** Loaded lazily (native module) – importing the documents module must stay cheap for pages. */
let napi: Napi | null = null;
const createCanvas = (w: number, h: number) => napi!.createCanvas(w, h);

function loadPdfjs(): Promise<Pdfjs> {
  loading ??= (async () => {
    napi ??= await import("@napi-rs/canvas");
    const g = globalThis as Record<string, unknown>;
    g.DOMMatrix ??= napi.DOMMatrix;
    g.Path2D ??= napi.Path2D;
    g.ImageData ??= napi.ImageData;
    g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

let assetDir: string | null | undefined;
/** Directory of the installed pdfjs-dist package (with trailing separator handled by callers). */
function pdfjsAssetDir(): string | null {
  if (assetDir !== undefined) return assetDir;
  try {
    const req = createRequire(path.join(process.cwd(), "package.json"));
    assetDir = path.dirname(req.resolve("pdfjs-dist/package.json"));
  } catch {
    assetDir = null;
  }
  return assetDir;
}

/** Canvas factory for pdfjs backed by @napi-rs/canvas (duck-typed BaseCanvasFactory). */
class NapiCanvasFactory {
  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error("Invalid canvas size");
    const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(target: { canvas: Canvas | null }, width: number, height: number) {
    if (!target.canvas) throw new Error("Canvas is not specified");
    target.canvas.width = Math.ceil(width);
    target.canvas.height = Math.ceil(height);
  }
  destroy(target: { canvas: Canvas | null; context: unknown }) {
    if (target.canvas) {
      target.canvas.width = 0;
      target.canvas.height = 0;
    }
    target.canvas = null;
    target.context = null;
  }
}

export type RenderedPage = { pageIndex: number; png: Buffer; width: number; height: number };

export const RENDER_WIDTH = 1600;
/** Hard cap for very tall pages (receipt-style menus): max pixels per page. */
const MAX_PIXELS = RENDER_WIDTH * 4000;

/** Number of pages of a PDF (throws for broken/encrypted files). */
export async function pdfPageCount(data: Buffer): Promise<number> {
  const pdfjs = await loadPdfjs();
  const task = openDocument(pdfjs, data);
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}

/** Returns the loading task – `task.destroy()` releases the document (PDFDocumentProxy has no destroy in v6). */
function openDocument(pdfjs: Pdfjs, data: Buffer) {
  const dir = pdfjsAssetDir();
  const sep = path.sep;
  return pdfjs.getDocument({
    // pdfjs transfers/detaches the buffer → always hand it a copy.
    data: new Uint8Array(data),
    CanvasFactory: NapiCanvasFactory,
    ...(dir
      ? {
          standardFontDataUrl: `${path.join(dir, "standard_fonts")}${sep}`,
          cMapUrl: `${path.join(dir, "cmaps")}${sep}`,
          cMapPacked: true,
          wasmUrl: `${path.join(dir, "wasm")}${sep}`,
          iccUrl: `${path.join(dir, "iccs")}${sep}`,
        }
      : {}),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });
}

/**
 * Renders the given pages (0-based indexes) to PNG at ~1600 px width on a white background.
 * Returns the total page count too. Pages beyond the document are ignored.
 */
export async function renderPdfPages(data: Buffer, pageIndexes: number[]): Promise<{ numPages: number; pages: RenderedPage[] }> {
  const pdfjs = await loadPdfjs();
  const task = openDocument(pdfjs, data);
  const pages: RenderedPage[] = [];
  try {
    const doc = await task.promise;
    for (const idx of pageIndexes) {
      if (idx < 0 || idx >= doc.numPages) continue;
      const page = await doc.getPage(idx + 1);
      try {
        const base = page.getViewport({ scale: 1 });
        let scale = RENDER_WIDTH / base.width;
        if (base.width * base.height * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (base.width * base.height));
        const viewport = page.getViewport({ scale });
        const width = Math.max(1, Math.round(viewport.width));
        const height = Math.max(1, Math.round(viewport.height));
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        await page.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          viewport,
          background: "#ffffff",
        }).promise;
        pages.push({ pageIndex: idx, png: await canvas.encode("png"), width, height });
      } finally {
        page.cleanup();
      }
    }
    return { numPages: doc.numPages, pages };
  } finally {
    await task.destroy();
  }
}
