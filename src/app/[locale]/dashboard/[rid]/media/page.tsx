import { getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { PageHeader } from "@/components/ui";
import { listMedia, mediaUsage, toMediaDto } from "@/modules/media/service";
import { MediaLibrary } from "@/modules/media/components/media-library";

export async function generateMetadata() {
  const t = await getTranslations("media");
  return { title: t("title") };
}

export default async function MediaPage({ params }: PageProps<"/[locale]/dashboard/[rid]/media">) {
  const { rid } = await params;
  await requireRestaurant(rid, "media.manage");
  const t = await getTranslations("media");
  const rows = await listMedia(rid, { limit: 1000 });
  const usage = await mediaUsage(rid, rows.map((r) => r.id));
  const items = rows.map((r) => ({ ...toMediaDto(r), usage: usage.get(r.id)! }));
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <MediaLibrary restaurantId={rid} items={items} />
    </>
  );
}
