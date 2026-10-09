"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/core/utils";

/** Native <dialog> based modal. Controlled via `open`. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <dialog
      ref={ref}
      // close/cancel events propagate through the React tree → ignore those from nested dialogs
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onCancel={(e) => e.stopPropagation()}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn("m-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 shadow-2xl", widths[size])}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          {(title || description) && (
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-4">
              <div>
                {title && <h2 className="text-lg font-semibold text-stone-900">{title}</h2>}
                {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
              </div>
              <button onClick={onClose} className="focus-ring rounded-md p-1 text-stone-400 hover:text-stone-700" aria-label="Close">
                <X size={18} />
              </button>
            </div>
          )}
          <div className="overflow-y-auto px-6 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-stone-100 bg-stone-50 px-6 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
