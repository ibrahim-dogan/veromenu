import "server-only";
/**
 * The restaurant's menu source documents (PDF / photos).
 * Upload once → reused by menu import, logo extraction, menu theme and print design generation.
 *
 * - sources.ts  settings.sources (get/set/list)
 * - pages.ts    PDF page renders (cached media rows, sourceMediaId = PDF, alt "Seite n") + upright photos
 * - pdf.ts      pdfjs-dist + @napi-rs/canvas rendering in Node
 * - logo.ts     logo detection (vision bounding box) → crop/trim → settings.logoMediaId
 */

export { getSourceDocuments, setSourceDocuments, listSourceDocuments, MAX_SOURCE_DOCUMENTS, type SourceDocumentDto } from "./sources";
export { getPageImages, readPageImage, DEFAULT_MAX_PAGES, type PageImage } from "./pages";
export { extractLogo } from "./logo";
