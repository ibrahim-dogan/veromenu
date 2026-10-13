import "server-only";
/**
 * CONTRACT (implemented by the documents engineer): the restaurant's menu source documents.
 * Upload once → reused by menu import, logo extraction, menu theme and print design generation.
 */

export type PageImage = { sourceMediaId: string; pageIndex: number; mediaId: string; width: number; height: number };

/** Media ids in restaurants.settings.sources (owned by the restaurant, in upload order). */
export async function getSourceDocuments(_restaurantId: string): Promise<string[]> {
  throw new Error("documents: getSourceDocuments not implemented yet");
}

/** Replaces/extends the stored source documents (validates ownership + mime). */
export async function setSourceDocuments(_restaurantId: string, _mediaIds: string[], _mode: "replace" | "append" = "replace"): Promise<string[]> {
  throw new Error("documents: setSourceDocuments not implemented yet");
}

/**
 * PNG page renders (≤ maxPages, width ~1600 px) for PDFs via pdfjs-dist + @napi-rs/canvas; images are
 * returned as-is (auto-rotated). Renders are cached as media rows linked by media.sourceMediaId.
 */
export async function getPageImages(_restaurantId: string, _mediaIds: string[], _opts?: { maxPages?: number }): Promise<PageImage[]> {
  throw new Error("documents: getPageImages not implemented yet");
}

/**
 * Finds the restaurant logo on the pages (vision model bounding box), crops + trims it, stores it as media
 * and – when `apply` and no logo is set yet – writes settings.logoMediaId. Returns null if no logo is found.
 */
export async function extractLogo(_opts: {
  restaurantId: string;
  userId: string;
  mediaIds: string[];
  apply?: boolean;
}): Promise<{ mediaId: string; applied: boolean; confidence: number } | null> {
  throw new Error("documents: extractLogo not implemented yet");
}
