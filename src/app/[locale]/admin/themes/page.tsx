import { getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/core/auth/guards";
import { PageHeader } from "@/components/ui";
import { listLibraryThemes, listPromotableThemes } from "@/modules/theme-studio/service";
import { AdminThemeLibrary } from "@/modules/theme-studio/components/admin-library";

export async function generateMetadata() {
  const t = await getTranslations("themeStudio.admin");
  return { title: t("title") };
}

/** Platform theme library: starters + promoted restaurant themes, usable by every restaurant ("Verwenden"). */
export default async function AdminThemesPage() {
  await requirePlatformAdmin();
  const t = await getTranslations("themeStudio.admin");
  const [library, promotable] = await Promise.all([listLibraryThemes(), listPromotableThemes()]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <AdminThemeLibrary
        library={library.map((l) => ({ ...l, updatedAt: l.updatedAt.toISOString() }))}
        promotable={promotable.map((p) => ({ ...p, restaurantId: p.restaurantId!, updatedAt: p.updatedAt.toISOString() }))}
      />
    </>
  );
}
