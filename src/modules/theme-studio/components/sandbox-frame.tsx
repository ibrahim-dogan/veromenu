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
}: {
  html: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
  onBridge?: (msg: BridgeMessage) => void;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const cb = useRef(onBridge);
  useEffect(() => {
    cb.current = onBridge;
  });

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data as BridgeMessage | null;
      if (!d || typeof d !== "object" || typeof d.type !== "string" || !d.type.startsWith("vm:")) return;
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
      loading="lazy"
      tabIndex={interactive ? undefined : -1}
      aria-hidden={interactive ? undefined : true}
      className={className}
      style={{ border: 0, pointerEvents: interactive ? undefined : "none", ...style }}
    />
  );
}
