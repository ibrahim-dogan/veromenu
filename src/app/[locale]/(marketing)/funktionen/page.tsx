import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { FeatureGrid, FinalCta, HowItWorks, PageIntro, QualitySection } from "@/components/marketing/sections";
import { marketingMetadata } from "@/components/marketing/seo";

export const generateStaticParams = () => [];

export async function generateMetadata({ params }: PageProps<"/[locale]/funktionen">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.featuresPage" });
  return marketingMetadata({ locale, path: "/funktionen", title: t("metaTitle"), description: t("metaDescription") });
}

export default async function FeaturesPage({ params }: PageProps<"/[locale]/funktionen">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  return (
    <>
      <PageIntro eyebrow={t("features.eyebrow")} title={t("featuresPage.title")} subtitle={t("featuresPage.subtitle")} />
      <FeatureGrid withHeading={false} />
      <QualitySection />
      <HowItWorks />
      <FinalCta />
    </>
  );
}
