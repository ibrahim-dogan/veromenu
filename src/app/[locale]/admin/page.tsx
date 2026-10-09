import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";

// Platform overview – owned by the admin module.
export default async function AdminHome() {
  const t = await getTranslations("nav");
  return <PageHeader title={t("adminOverview")} />;
}
