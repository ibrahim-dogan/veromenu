import { getTranslations } from "next-intl/server";
import { FileUp } from "lucide-react";
import { requireRestaurant } from "@/core/auth/guards";
import { PageHeader } from "@/components/ui";
import { FeatureGate } from "@/components/shell/feature-gate";
import { getPlan, planHas } from "@/modules/billing/plans";
import { getMenuTree } from "@/modules/menu/service";
import { listImports } from "@/modules/import/service";
import { ImportClient } from "@/modules/import/components/import-client";

export async function generateMetadata() {
  const t = await getTranslations("import");
  return { title: t("title") };
}

export default async function ImportPage({ params }: PageProps<"/[locale]/dashboard/[rid]/import">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid, "ai.use");
  const t = await getTranslations("import");
  const enabled = planHas(ctx.restaurant.plan, "ai_import");
  const canEdit = ctx.can("menu.edit");

  let body: React.ReactNode = null;
  if (enabled && !canEdit) {
    body = <p className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-600">{t("noEditPermission")}</p>;
  } else if (enabled) {
    const [imports, tree] = await Promise.all([listImports(rid, 10), getMenuTree(rid)]);
    const active = imports.find((i) => i.status === "processing" || i.status === "ready" || i.status === "failed") ?? null;
    const plan = getPlan(ctx.restaurant.plan);
    const itemsUsed = tree.reduce((n, m) => n + m.categories.reduce((k, c) => k + c.items.length, 0), 0);
    body = (
      <ImportClient
        restaurantId={rid}
        active={active}
        history={imports}
        menus={tree.map((m) => ({ id: m.id, name: m.name, itemCount: m.categories.reduce((k, c) => k + c.items.length, 0) }))}
        limits={{ items: plan.limits.items, itemsUsed, menus: plan.limits.menus }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <FileUp size={22} className="text-brand-700" /> {t("title")}
          </span>
        }
        description={t("description")}
      />
      <FeatureGate plan={ctx.restaurant.plan} feature="ai_import">
        {body}
      </FeatureGate>
    </div>
  );
}
