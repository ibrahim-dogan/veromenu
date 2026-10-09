import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FaqSection, FinalCta, PageIntro, PricingSection } from "@/components/marketing/sections";
import { marketingMetadata } from "@/components/marketing/seo";

export const generateStaticParams = () => [];

export async function generateMetadata({ params }: PageProps<"/[locale]/preise">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.pricingPage" });
  return marketingMetadata({ locale, path: "/preise", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function PricingPage({ params }: PageProps<"/[locale]/preise">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  return (
    <>
      <PageIntro eyebrow={t("pricing.eyebrow")} title={t("pricingPage.title")} subtitle={t("pricingPage.subtitle")} />
      <div className="bg-[#f5f3ec]">
        <PricingSection withHeading={false} />
      </div>
      <FaqSection />
      <div className="bg-white pt-4">
        <FinalCta />
      </div>
    </>
  );
}
