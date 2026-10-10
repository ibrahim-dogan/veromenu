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
