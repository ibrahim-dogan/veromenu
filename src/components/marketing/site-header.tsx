import { getTranslations } from "next-intl/server";
import { Menu as MenuIcon, ArrowRight } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { buttonClass } from "@/components/ui";

const NAV = [
  { key: "features", href: "/funktionen" },
  { key: "pricing", href: "/preise" },
  { key: "faq", href: "/#faq" },
  { key: "contact", href: "/kontakt" },
] as const;

/** Public site header (server component; the mobile menu is a native <details> – no client JS). */
export async function SiteHeader() {
  const t = await getTranslations("landing.nav");
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-[#fafaf7]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="focus-ring rounded-md text-stone-900" aria-label="VeroMenu">
          <Logo />
        </Link>
        <nav aria-label={t("label")} className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              className="focus-ring rounded-md px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900"
            >
              {t(n.key)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher className="hidden sm:inline-flex" />
          <Link href="/login" className="focus-ring hidden rounded-md px-2 py-2 text-sm font-medium text-stone-700 hover:text-stone-900 sm:inline">
            {t("login")}
          </Link>
          <Link href="/register" className={buttonClass("primary", "md", "rounded-full px-5")}>
            {t("cta")}
            <ArrowRight size={16} aria-hidden className="hidden sm:block" />
          </Link>
          <details className="group relative md:hidden">
            <summary
              aria-label={t("menu")}
              className="focus-ring flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-stone-700 hover:bg-stone-100 [&::-webkit-details-marker]:hidden"
            >
              <MenuIcon size={20} aria-hidden />
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
              {NAV.map((n) => (
                <Link key={n.key} href={n.href} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100">
                  {t(n.key)}
                </Link>
              ))}
              <hr className="my-2 border-stone-100" />
              <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-100">
                {t("login")}
              </Link>
              <div className="px-3 py-2">
                <LocaleSwitcher />
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
