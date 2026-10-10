"use client";
import { useEffect, useRef } from "react";
import type { BridgeMessage } from "@/modules/theme-engine/types";

/**
 * The ONLY way theme code is shown in the dashboard: a srcdoc iframe with `sandbox="allow-scripts"`
 * (opaque origin – never add allow-same-origin, it would let theme JS reach the dashboard).
 * Messages are accepted only from this frame's window and only with the known bridge shape.
 */
export function SandboxFrame({
  html,
  title,
  className,
  style,
  onBridge,
  interactive = true,
  preserveScroll = false,
}: {
  html: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
  onBridge?: (msg: BridgeMessage) => void;
  interactive?: boolean;
  /** Re-open each new document at the previous scroll position (studio live preview re-renders on every edit). */
  preserveScroll?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const cb = useRef(onBridge);
  const acked = useRef(false);
  const scrollY = useRef(0);
  const preserve = useRef(preserveScroll);
  useEffect(() => {
    preserve.current = preserveScroll;
  });
  useEffect(() => {
    acked.current = false;
  }, [html]);
  useEffect(() => {
    cb.current = onBridge;
  });

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data as BridgeMessage | null;
      if (!d || typeof d !== "object" || typeof d.type !== "string" || !d.type.startsWith("vm:")) return;
      // Scroll position reports (preview mode only) – host-internal, not forwarded.
      const raw = d as { type: string; y?: unknown };
      if (raw.type === "vm:scroll") {
        scrollY.current = Math.max(0, Number(raw.y) || 0);
        return;
      }
      // Acknowledge once like the guest host does, so the bridge stops repeating vm:ready.
      if (d.type === "vm:ready" && !acked.current) {
        acked.current = true;
        ref.current.contentWindow?.postMessage({ type: "vm:cart", count: 0, totalFormatted: "" }, "*");
        if (preserve.current && scrollY.current > 0) ref.current.contentWindow?.postMessage({ type: "vm:scrollTo", y: scrollY.current }, "*");
      }
      cb.current?.(d);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={html}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      tabIndex={interactive ? undefined : -1}
      aria-hidden={interactive ? undefined : true}
      className={className}
      style={{ border: 0, pointerEvents: interactive ? undefined : "none", ...style }}
    />
  );
}
