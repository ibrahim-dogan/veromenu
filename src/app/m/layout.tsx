import type { Metadata, Viewport } from "next";
import { env } from "@/core/env";
import "./guest.css";

// env() is read lazily (per request), never at module load → builds work without runtime secrets.
export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(env().APP_URL),
    title: { default: "Menu", template: "%s" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Root layout of the public guest menu (own world: no app chrome, no next-intl client runtime).
 * `lang`/`dir` depend on the `?lang=` search param which layouts cannot read: the theme root element
 * carries the server-correct lang/dir, and the page sets them on <html> with a tiny inline script
 * before first paint.
 */
export default function GuestLayout({ children }: LayoutProps<"/m">) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
