import { getTranslations } from "next-intl/server";
import { ShieldCheck, Server, Cookie } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { Logo } from "@/components/brand/logo";

export async function SiteFooter() {
  const t = await getTranslations("landing.footer");
  const cols = [
    {
      title: t("product"),
      links: [
        { href: "/funktionen", label: t("features") },
        { href: "/preise", label: t("pricing") },
        { href: "/register", label: t("register") },
        { href: "/login", label: t("login") },
      ],
    },
    {
      title: t("legal"),
      links: [
        { href: "/impressum", label: t("imprint") },
        { href: "/datenschutz", label: t("privacy") },
        { href: "/agb", label: t("terms") },
        { href: "/avv", label: t("dpa") },
      ],
    },
    {
      title: t("company"),
      links: [
        { href: "/kontakt", label: t("contact") },
        { href: "/#faq", label: t("faq") },
      ],
    },
  ];
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-stone-600">{t("tagline")}</p>
          <ul className="mt-5 space-y-2 text-xs text-stone-500">
            <li className="flex items-center gap-2">
              <Server size={14} className="text-brand-600" aria-hidden /> {t("trustHosting")}
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-brand-600" aria-hidden /> {t("trustGdpr")}
            </li>
            <li className="flex items-center gap-2">
              <Cookie size={14} className="text-brand-600" aria-hidden /> {t("trustCookies")}
            </li>
          </ul>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">{c.title}</p>
            <ul className="mt-4 space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="focus-ring rounded text-sm text-stone-600 transition-colors hover:text-brand-700">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-stone-100">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <p>{t("madeIn")}</p>
        </div>
      </div>
    </footer>
  );
}
