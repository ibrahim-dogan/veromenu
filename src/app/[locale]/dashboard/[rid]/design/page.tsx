import { getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { PageHeader } from "@/components/ui";
import { getThemeManifest, listThemeManifests } from "@/themes";
import { sanitizeConfig } from "@/themes/config";
import { DesignEditor } from "@/modules/design/components/design-editor";

export async function generateMetadata() {
  const t = await getTranslations("design");
  return { title: t("title") };
}

/** Guest-menu design: theme gallery, auto-generated settings form, live phone preview. */
export default async function DesignPage({ params }: PageProps<"/[locale]/dashboard/[rid]/design">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid, "theme.manage");
  const t = await getTranslations("design");
  const current = getThemeManifest(ctx.restaurant.themeId);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <DesignEditor
        restaurantId={rid}
        slug={ctx.restaurant.slug}
        manifests={listThemeManifests()}
        savedThemeId={current.id}
        savedConfig={sanitizeConfig(current, ctx.restaurant.themeConfig)}
      />
    </>
  );
}
