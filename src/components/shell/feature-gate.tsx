import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import { planHas, type PlanFeature } from "@/modules/billing/plans";
import { EmptyState } from "@/components/ui";

/** Server component: renders children only if the restaurant plan includes the feature. */
export async function FeatureGate({ plan, feature, children }: { plan: string; feature: PlanFeature; children: React.ReactNode }) {
  if (planHas(plan, feature)) return <>{children}</>;
  const t = await getTranslations("common");
  return <EmptyState icon={<Lock size={28} />} title={t("upgradeRequired")} description={t("upgrade")} />;
}
