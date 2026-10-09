"use client";
import { cn } from "@/core/utils";

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  name,
  className,
}: {
  checked: boolean;
  onCheckedChange?: (v: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  name?: string;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm", disabled && "opacity-50", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          "focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-600" : "bg-stone-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-5 rtl:-translate-x-5",
          )}
        />
      </button>
      {name && <input type="hidden" name={name} value={checked ? "on" : ""} />}
      {label}
    </label>
  );
}
