import { cn } from "@/core/utils";

export function Logo({ className, mono }: { className?: string; mono?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-xl font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="8" className={mono ? "fill-current" : "fill-brand-700"} />
        <path d="M8 9l8 15 8-15" fill="none" stroke={mono ? "white" : "#f0b65a"} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>
        Vero<span className={mono ? "" : "text-brand-700"}>Menu</span>
      </span>
    </span>
  );
}
