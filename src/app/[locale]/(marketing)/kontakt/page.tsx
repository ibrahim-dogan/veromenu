import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Mail, Phone, Clock, CalendarCheck, ArrowRight } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { buttonClass } from "@/components/ui";
import { PageIntro } from "@/components/marketing/sections";
import { marketingMetadata } from "@/components/marketing/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/kontakt">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.contactPage" });
  return marketingMetadata({ locale, path: "/kontakt", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function ContactPage({ params }: PageProps<"/[locale]/kontakt">) {
  // Contact data comes from runtime env (LEGAL_EMAIL / LEGAL_PHONE) → render per request.
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const email = process.env.LEGAL_EMAIL?.trim();
  const phone = process.env.LEGAL_PHONE?.trim();
  const missing = <span className="rounded border border-dashed border-amber-400 bg-amber-50 px-1.5 py-0.5 text-sm text-amber-800">{t("contactPage.notConfigured")}</span>;

  const cards = [
    {
      icon: Mail,
      title: t("contactPage.emailTitle"),
      value: email ? (
        <a href={`mailto:${email}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
          {email}
        </a>
      ) : (
        missing
      ),
    },
    {
      icon: Phone,
      title: t("contactPage.phoneTitle"),
      value: phone ? (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="font-medium text-brand-700 underline-offset-4 hover:underline">
          {phone}
        </a>
      ) : (
        missing
      ),
    },
    { icon: Clock, title: t("contactPage.hoursTitle"), value: <span className="text-stone-700">{t("contactPage.hours")}</span> },
  ];

  return (
    <>
      <PageIntro eyebrow={t("nav.contact")} title={t("contactPage.title")} subtitle={t("contactPage.subtitle")} />
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr]">
        <ul className="space-y-4">
          {cards.map(({ icon: Icon, title, value }) => (
            <li key={title} className="flex items-start gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <Icon size={20} aria-hidden />
              </span>
              <div>
                <p className="text-sm text-stone-500">{title}</p>
                <div className="mt-0.5 break-all">{value}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-col justify-between gap-8 rounded-3xl bg-brand-800 p-8 text-white">
          <div>
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-accent-400">
              <CalendarCheck size={20} aria-hidden />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold">{t("contactPage.demoTitle")}</h2>
            <p className="mt-2 leading-relaxed text-brand-100/85">{t("contactPage.demoBody")}</p>
            {email && (
              <a
                href={`mailto:${email}?subject=${encodeURIComponent(t("contactPage.demoSubject"))}`}
                className={buttonClass("accent", "lg", "mt-6 rounded-full")}
              >
                {t("contactPage.demoCta")} <ArrowRight size={18} aria-hidden />
              </a>
            )}
          </div>
          <div className="rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/10">
            <p className="font-semibold">{t("contactPage.selfServeTitle")}</p>
            <p className="mt-1 text-sm text-brand-100/80">{t("contactPage.selfServeBody")}</p>
            <Link href="/register" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-400 hover:underline">
              {t("cta.button")} <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
