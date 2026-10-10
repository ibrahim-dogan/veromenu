/**
 * Content-Security-Policy of the theme frame (isomorphic). Used as <meta> in the document and – with the
 * `sandbox allow-scripts` directive and frame-ancestors – as response header of /m/[slug]/frame.
 * No network: images only from our /media/, fonts only from our /theme-fonts/, everything else inline or blocked.
 */
export function themeFrameCsp(assetBaseUrl: string, opts: { header?: boolean } = {}): string {
  const base = assetBaseUrl.replace(/\/+$/, "");
  const directives = [
    ...(opts.header ? ["sandbox allow-scripts"] : []),
    "default-src 'none'",
    `img-src ${base}/media/ data: blob:`,
    `font-src ${base}/theme-fonts/ data:`,
    "style-src 'unsafe-inline'",
    "script-src 'unsafe-inline'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "manifest-src 'none'",
    ...(opts.header ? ["frame-ancestors 'self'"] : []),
  ];
  return directives.join("; ");
}

/** Response headers of the theme frame route. */
export function themeFrameHeaders(assetBaseUrl: string, opts: { noStore?: boolean } = {}): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": themeFrameCsp(assetBaseUrl, { header: true }),
    "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=()",
    "Cache-Control": opts.noStore ? "no-store" : "private, no-cache",
    "X-Robots-Tag": "noindex",
  };
}
