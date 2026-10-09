import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { env } from "@/core/env";
import { isRtl } from "@/core/i18n/locales";
import { getGuestRestaurantRow } from "@/modules/guest/load";
import { resolveGuestLocale } from "@/modules/guest/locale";
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
 * `lang`/`dir` are resolved server-side from the URL forwarded by src/proxy.ts (x-vm-url).
 */
export default async function GuestLayout({ children }: LayoutProps<"/m">) {
  const h = await headers();
  const url = new URL(h.get("x-vm-url") ?? "/", "http://x");
  const slug = url.pathname.split("/")[2] ?? "";
  const r = slug ? await getGuestRestaurantRow(slug) : null;
  const lang = r
    ? resolveGuestLocale({
        enabled: r.enabledLocales,
        defaultLocale: r.defaultLocale,
        lang: url.searchParams.get("lang"),
        acceptLanguage: h.get("accept-language"),
      })
    : "de";
  return (
    <html lang={lang} dir={isRtl(lang) ? "rtl" : "ltr"} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
