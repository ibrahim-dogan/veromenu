"use client";
import * as React from "react";
import { cn } from "@/core/utils";

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: React.ReactNode; badge?: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-stone-200", className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            "focus-ring -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            value === it.value ? "border-brand-600 text-brand-800" : "border-transparent text-stone-500 hover:text-stone-800",
          )}
        >
          {it.label}
          {it.badge}
        </button>
      ))}
    </div>
  );
}
