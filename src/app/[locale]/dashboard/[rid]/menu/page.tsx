import { getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { getPlan, planHas } from "@/modules/billing/plans";
import { loadEditorData } from "@/modules/menu/editor-data";
import { MenuEditor } from "@/modules/menu/components/menu-editor";

export async function generateMetadata() {
  const t = await getTranslations("menu");
  return { title: t("title") };
}

export default async function MenuPage({ params, searchParams }: PageProps<"/[locale]/dashboard/[rid]/menu">) {
  const { rid } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(rid, "menu.view");
  const { tree, mediaMap, gaps, usage } = await loadEditorData(ctx.restaurant);
  const plan = getPlan(ctx.restaurant.plan);
  const initialMenuId = typeof sp.menu === "string" ? sp.menu : undefined;

  return (
    <MenuEditor
      restaurantId={rid}
      menus={tree}
      initialMenuId={initialMenuId}
      menuMode={ctx.restaurant.settings?.menuMode === "pdf" ? "pdf" : "digital"}
      usage={usage}
      limits={{ items: plan.limits.items, menus: plan.limits.menus }}
      ctx={{
        restaurantId: rid,
        currency: ctx.restaurant.currency,
        mediaMap,
        gaps,
        aiImages: planHas(ctx.restaurant.plan, "ai_images"),
        perms: {
          edit: ctx.can("menu.edit"),
          availability: ctx.can("menu.edit") || ctx.can("menu.availability"),
          allergens: ctx.can("allergens.review"),
          ai: ctx.can("ai.use"),
          translations: ctx.can("translations.manage"),
        },
      }}
    />
  );
}
