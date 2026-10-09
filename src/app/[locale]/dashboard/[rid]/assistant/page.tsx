import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { requireRestaurant } from "@/core/auth/guards";
import { getAiCredits } from "@/core/ai";
import { PageHeader } from "@/components/ui";
import { FeatureGate } from "@/components/shell/feature-gate";
import { planHas } from "@/modules/billing/plans";
import { listChangesets } from "@/modules/assistant/service";
import { AssistantClient } from "@/modules/assistant/components/assistant-client";

export async function generateMetadata() {
  const t = await getTranslations("assistant");
  return { title: t("title") };
}

export default async function AssistantPage({ params }: PageProps<"/[locale]/dashboard/[rid]/assistant">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid, "ai.use");
  const t = await getTranslations("assistant");
  const enabled = planHas(ctx.restaurant.plan, "ai_agent");
  const [history, credits] = enabled ? await Promise.all([listChangesets(rid, 15), getAiCredits(rid)]) : [[], null];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={22} className="text-brand-700" /> {t("title")}
          </span>
        }
        description={t("description")}
        actions={credits ? <span className="text-xs text-stone-500">{t("credits", { remaining: credits.remaining, limit: credits.limit })}</span> : undefined}
      />
      <FeatureGate plan={ctx.restaurant.plan} feature="ai_agent">
        <AssistantClient restaurantId={rid} canApply={ctx.can("menu.edit")} history={history} />
      </FeatureGate>
    </div>
  );
}
