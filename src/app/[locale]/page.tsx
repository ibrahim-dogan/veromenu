import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import {
  FAQ_KEYS,
  FaqSection,
  FeatureGrid,
  FinalCta,
  Hero,
  HowItWorks,
  PricingSection,
  QualitySection,
  TrustStrip,
} from "@/components/marketing/sections";
import { jsonLd, localizedUrl, marketingMetadata, siteUrl } from "@/components/marketing/seo";
import { PLANS } from "@/modules/billing/plans";
import { CONTENT_LOCALE_CODES } from "@/core/i18n/locales";

// Rendered on first request (runtime APP_URL), then served statically from the cache.
export const generateStaticParams = () => [];

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  return marketingMetadata({ locale, path: "/", title: t("metaTitle"), description: t("metaDescription"), absoluteTitle: true });
}

export default async function Landing({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");

  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "VeroMenu",
        url: localizedUrl(locale, "/"),
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "QR menu",
        operatingSystem: "Web",
        inLanguage: locale,
        availableLanguage: CONTENT_LOCALE_CODES,
        description: t("metaDescription"),
        offers: PLANS.map((p) => ({
          "@type": "Offer",
          name: t(`pricing.${p.id}Name`),
          price: (p.priceMonthlyCents / 100).toFixed(2),
          priceCurrency: "EUR",
          url: localizedUrl(locale, "/preise"),
        })),
        publisher: { "@type": "Organization", name: "VeroMenu", url: siteUrl() },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ_KEYS.map((n) => ({
          "@type": "Question",
          name: t(`faq.q${n}`),
          acceptedAnswer: { "@type": "Answer", text: t(`faq.a${n}`) },
        })),
      },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <TrustStrip />
        <FeatureGrid />
        <QualitySection />
        <HowItWorks />
        <div className="border-t border-stone-200/80 bg-[#f5f3ec]">
          <PricingSection />
        </div>
        <FaqSection />
        <div className="bg-white pt-4">
          <FinalCta />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
