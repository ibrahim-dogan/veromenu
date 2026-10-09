import { getTranslations } from "next-intl/server";
import { ShieldOff } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { buttonClass, EmptyState } from "@/components/ui";

export default async function ForbiddenPage({ params }: PageProps<"/[locale]/dashboard/[rid]/forbidden">) {
  const { rid } = await params;
  const t = await getTranslations("dashboard");
  return (
    <EmptyState
      icon={<ShieldOff size={32} />}
      title={t("forbiddenTitle")}
      description={t("forbiddenText")}
      action={
        <Link href={`/dashboard/${rid}`} className={buttonClass("secondary")}>
          {t("forbiddenBack")}
        </Link>
      }
    />
  );
}
