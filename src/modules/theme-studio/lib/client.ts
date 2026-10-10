"use client";
/** Browser-only helpers for the Theme Studio. */

export function downloadText(fileName: string, text: string, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Same shape as the server actions' ActionResult, so callers handle both the same way. */
export type StudioResult<T> = { ok: true; data: T } | { ok: false; error: string; detail?: string };

/**
 * GET a studio read endpoint (/api/restaurants/[rid]/themes/…). Reads deliberately do NOT use server actions:
 * Next dispatches server actions one at a time per client, so a 30–90 s AI edit would block every preview /
 * versions request behind it. Never throws; an aborted request resolves to `{ ok: false, error: "aborted" }`.
 */
export async function studioGet<T>(path: string, signal?: AbortSignal): Promise<StudioResult<T>> {
  try {
    const res = await fetch(path, { signal, cache: "no-store", headers: { accept: "application/json" } });
    const body = (await res.json().catch(() => null)) as StudioResult<T> | null;
    if (body && typeof body === "object" && typeof body.ok === "boolean") return body;
    return { ok: false, error: "unexpected", detail: `HTTP ${res.status}` };
  } catch (e) {
    if (signal?.aborted) return { ok: false, error: "aborted" };
    return { ok: false, error: "unexpected", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Serializable theme summary passed from server pages to client components. */
export type ThemeCardData = {
  id: string;
  name: string;
  description: string | null;
  origin: string;
  currentVersionId: string | null;
  publishedVersionId: string | null;
  isActive: boolean;
  updatedAt: string;
};

export type ThemeStatus = "active" | "draft" | "unpublished" | "published";
export function themeStatus(t: Pick<ThemeCardData, "isActive" | "publishedVersionId" | "currentVersionId">): ThemeStatus[] {
  const out: ThemeStatus[] = [];
  if (t.isActive) out.push("active");
  if (!t.publishedVersionId) out.push("draft");
  else if (t.currentVersionId && t.currentVersionId !== t.publishedVersionId) out.push("unpublished");
  return out;
}
