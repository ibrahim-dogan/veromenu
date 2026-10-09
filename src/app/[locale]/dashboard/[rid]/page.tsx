import { getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { PageHeader } from "@/components/ui";

// Overview – owned by the stats module (KPIs, onboarding checklist, recent orders).
export default async function OverviewPage({ params }: PageProps<"/[locale]/dashboard/[rid]">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid);
  const t = await getTranslations("nav");
  return <PageHeader title={`${t("overview")} · ${ctx.restaurant.name}`} />;
}
