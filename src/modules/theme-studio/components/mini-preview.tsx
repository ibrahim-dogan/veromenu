"use client";
import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/core/utils";
import { PrintFrame } from "./print-frame";
import { SandboxFrame } from "./sandbox-frame";

/** Print designs return their page size (px) and are shown in a script-less frame. */
type Rendered = { html: string; kind?: "menu" | "print"; width?: number; height?: number };
type Loader = () => Promise<{ ok: true; data: Rendered } | { ok: false; error: string }>;

const cache = new Map<string, Promise<Rendered | null>>();
// Server actions are queued per client – keep at most a few renders in flight.
let inflight = 0;
const queue: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= 2) await new Promise<void>((r) => queue.push(r));
  inflight++;
  try {
    return await fn();
  } finally {
    inflight--;
    queue.shift()?.();
  }
}

/** Forget cached previews (e.g. after saving a new version). */
export function invalidateMiniPreview(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

/** Scaled, non-interactive sandboxed preview of a theme (phone width 390px), rendered lazily when visible. */
export function MiniPreview({ cacheKey, load, title, className, width = 390, height = 780 }: { cacheKey: string; load: Loader; title: string; className?: string; width?: number; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [doc, setDoc] = useState<Rendered | null | undefined>(undefined);
  const w = doc?.width ?? width;
  const h = doc?.height ?? height;
  const [scale, setScale] = useState(0.5);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "200px" });
    io.observe(el);
    const ro = new ResizeObserver(() => setScale(el.clientWidth / w));
    ro.observe(el);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, [w]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let p = cache.get(cacheKey);
    if (!p) {
      p = limited(() => loadRef.current())
        .then((r) => (r.ok ? r.data : null))
        .catch(() => null);
      cache.set(cacheKey, p);
    }
    p.then((d) => alive && setDoc(d));
    return () => {
      alive = false;
    };
  }, [visible, cacheKey]);

  return (
    <div ref={box} className={cn("relative overflow-hidden bg-stone-100", className)} style={{ aspectRatio: `${w} / ${h}` }}>
      {doc?.kind === "print" ? (
        <PrintFrame html={doc.html} title={title} style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", inset: 0, pointerEvents: "none" }} />
      ) : doc ? (
        <SandboxFrame html={doc.html} title={title} interactive={false} style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", inset: 0 }} />
      ) : doc === null ? (
        <div className="absolute inset-0 grid place-items-center text-stone-400">
          <ImageOff size={22} aria-hidden />
        </div>
      ) : (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-stone-100 to-stone-200" />
      )}
    </div>
  );
}
