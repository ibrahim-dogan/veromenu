import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { marketingMetadata } from "@/components/marketing/seo";
import { LegalPage, type LegalDoc } from "./legal-page";
import { getOperator, type Operator } from "./operator";
import type { LegalSection } from "./ui";

type Params = { params: Promise<{ locale: string }> };

/** Metadata for a legal page (does NOT read operator env – safe at build time). */
export async function legalMetadata({ params }: Params, doc: LegalDoc, path: string): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return marketingMetadata({ locale, path, title: t(`${doc}.title`), description: t(`${doc}.metaDescription`) });
}

/** Renders a legal page dynamically so operator data comes from the runtime environment. */
export async function renderLegalPage({ params }: Params, doc: LegalDoc, build: (op: Operator) => LegalSection[]) {
  await connection();
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage locale={locale} doc={doc} sections={build(getOperator())} />;
}
