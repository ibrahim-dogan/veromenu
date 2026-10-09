"use client";
import { useCallback, useEffect, useState } from "react";

/** Client-side media helpers shared by MediaPicker, the media library and the PDF-menu section. */

export type MediaItem = {
  id: string;
  kind: "upload" | "ai_generated";
  mime: string;
  url: string;
  thumb: string;
  variants: Record<string, string>;
  alt: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  createdAt: string;
};

export type MediaAccept = "image" | "pdf" | "any";

export const ACCEPT_ATTR: Record<MediaAccept, string> = {
  image: "image/jpeg,image/png,image/webp,image/avif,image/heic",
  pdf: "application/pdf",
  any: "image/jpeg,image/png,image/webp,image/avif,image/heic,application/pdf",
};

export const MAX_UPLOAD_MB = 20;

export const isPdf = (m: Pick<MediaItem, "mime">) => m.mime === "application/pdf";

export function acceptsFile(accept: MediaAccept, file: File) {
  if (accept === "image") return file.type.startsWith("image/");
  if (accept === "pdf") return file.type === "application/pdf";
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

// ---------------------------------------------------------------- list cache (per restaurant + type)

const cache = new Map<string, Promise<MediaItem[]>>();
const subscribers = new Set<(rid: string) => void>();

function key(rid: string, accept: MediaAccept) {
  return `${rid}:${accept}`;
}

export function fetchMediaList(rid: string, accept: MediaAccept): Promise<MediaItem[]> {
  const k = key(rid, accept);
  let p = cache.get(k);
  if (!p) {
    p = fetch(`/api/restaurants/${rid}/media?type=${accept}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items: MediaItem[] }) => j.items)
      .catch(() => {
        cache.delete(k);
        return [];
      });
    cache.set(k, p);
  }
  return p;
}

/** Drops cached lists of a restaurant (after upload / delete) and notifies mounted hooks. */
export function invalidateMedia(rid: string) {
  for (const k of [...cache.keys()]) if (k.startsWith(`${rid}:`)) cache.delete(k);
  subscribers.forEach((s) => s(rid));
}

export function useMediaList(rid: string, accept: MediaAccept, enabled = true) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const sub = (r: string) => r === rid && setVersion((v) => v + 1);
    subscribers.add(sub);
    return () => void subscribers.delete(sub);
  }, [rid]);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchMediaList(rid, accept).then((list) => alive && setItems(list));
    return () => {
      alive = false;
    };
  }, [rid, accept, enabled, version]);
  const reload = useCallback(() => invalidateMedia(rid), [rid]);
  return { items, loading: enabled && items === null, reload };
}

// ---------------------------------------------------------------- upload

export type UploadError = "tooLarge" | "unsupportedType" | "invalid" | "rateLimited" | "forbidden" | "unexpected";

export async function uploadMedia(rid: string, file: File): Promise<{ ok: true; item: MediaItem } | { ok: false; error: UploadError }> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return { ok: false, error: "tooLarge" };
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch(`/api/restaurants/${rid}/media`, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = String(body.error ?? "");
      const known: UploadError[] = ["tooLarge", "unsupportedType", "invalid", "rateLimited", "forbidden"];
      return { ok: false, error: known.includes(e as UploadError) ? (e as UploadError) : "unexpected" };
    }
    return { ok: true, item: body as MediaItem };
  } catch {
    return { ok: false, error: "unexpected" };
  }
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
