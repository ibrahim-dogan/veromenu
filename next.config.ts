import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/core/i18n/request.ts");

const isDev = process.env.NODE_ENV !== "production";

/**
 * "CSP-lite": blocks third-party scripts/frames/objects while still allowing Next.js inline
 * bootstrap scripts, JSON-LD and Tailwind/next-font inline styles. Fonts are self-hosted via next/font.
 * Images allow https: (AI-generated / external menu images) plus data:/blob: for upload previews.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'self'",
  // Same-origin framing only: the dashboard previews the guest menu (/m/…) in an iframe.
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone is needed for the voice-controlled AI assistant (same origin only).
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Self-hosting: produces .next/standalone for a slim Docker image.
  output: "standalone",
  // Messages are read via fs at runtime (src/core/i18n/messages.ts) – make sure they are traced.
  // (The Dockerfile also copies src/messages explicitly.)
  outputFileTracingIncludes: { "/*": ["./src/messages/**/*.json"] },
  poweredByHeader: false,
  async headers() {
    return [
      // Everything except the studio theme frame. The frame route (src/app/m/[slug]/frame) sets its own
      // strict headers (CSP `sandbox allow-scripts`, no network, no-referrer) – Next does NOT let a route
      // override a header already set here, so the frame must be excluded from the app-wide CSP.
      { source: "/:path((?!m/[^/]+/frame$).*)", headers: securityHeaders },
      // Self-hosted theme fonts are loaded from the frame's opaque origin ("null") → CORS needed.
      {
        source: "/theme-fonts/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=2592000, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
  serverExternalPackages: ["@node-rs/argon2", "sharp", "postgres"],
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
