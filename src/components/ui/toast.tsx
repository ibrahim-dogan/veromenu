"use client";
import * as React from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/core/utils";

type Toast = { id: number; tone: "success" | "error" | "info"; message: React.ReactNode };
type Listener = (t: Toast[]) => void;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function emit() {
  listeners.forEach((l) => l(toasts));
}
/** Imperative toast API usable from any client component. */
export const toast = Object.assign(
  (message: React.ReactNode, tone: Toast["tone"] = "info") => {
    const id = ++seq;
    toasts = [...toasts, { id, tone, message }];
    emit();
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      emit();
    }, 4500);
  },
  {
    success: (m: React.ReactNode) => toast(m, "success"),
    error: (m: React.ReactNode) => toast(m, "error"),
  },
);

export function Toaster() {
  const [items, setItems] = React.useState<Toast[]>([]);
  React.useEffect(() => {
    listeners.add(setItems);
    return () => void listeners.delete(setItems);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            "pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ring-1",
            t.tone === "success" && "bg-white text-emerald-800 ring-emerald-200",
            t.tone === "error" && "bg-white text-red-700 ring-red-200",
            t.tone === "info" && "bg-stone-900 text-white ring-stone-800",
          )}
        >
          {t.tone === "success" ? <CheckCircle2 size={16} /> : t.tone === "error" ? <AlertTriangle size={16} /> : <Info size={16} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
