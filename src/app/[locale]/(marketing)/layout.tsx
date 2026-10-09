import { setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

/** Shared chrome for public marketing + legal pages (/funktionen, /preise, /kontakt, /impressum …). */
export default async function MarketingLayout({ children, params }: LayoutProps<"/[locale]">) {
  // Layouts render in parallel with pages – set the locale here too, otherwise next-intl falls back to
  // headers() and statically rendered pages fail with DYNAMIC_SERVER_USAGE in production.
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
