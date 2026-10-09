"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Bottom sheet on phones, centered dialog on larger screens. Native <dialog> → focus trap,
 * Esc to close and inert background for free (accessible, no extra JS libs).
 */
export function Sheet({
  open,
  onClose,
  label,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    }
    if (!open && d.open) d.close();
    if (!open) document.documentElement.style.overflow = "";
  }, [open]);
  useEffect(() => () => void (document.documentElement.style.overflow = ""), []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="vm-sheet text-g-text bg-g-surface m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[calc(var(--g-radius)+8px)] p-0 shadow-2xl sm:m-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-[calc(var(--g-radius)+8px)]"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col sm:max-h-[85dvh]">
          <div className="relative flex-1 overflow-y-auto overscroll-contain">
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="bg-g-surface/90 text-g-text absolute end-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full shadow-md backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <X size={20} aria-hidden />
            </button>
            {children}
          </div>
          {footer && <div className="border-g-border bg-g-surface border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
