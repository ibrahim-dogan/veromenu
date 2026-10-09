"use client";
import * as React from "react";

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * React propagates the native <dialog> "close"/"cancel" events through the component tree. A dialog
 * rendered inside another dialog would therefore also close its parent. Wrap nested dialogs (or
 * components that open one) in this to keep the event local.
 */
export function DialogIsolate({ children, className }: { children: React.ReactNode; className?: string }) {
  const handlers = { onClose: stop, onCancel: stop } as React.HTMLAttributes<HTMLDivElement>;
  return (
    <div className={className ?? "contents"} {...handlers}>
      {children}
    </div>
  );
}
