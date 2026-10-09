import { getTranslations } from "next-intl/server";
import { CheckCircle2, XCircle } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { buttonClass } from "@/components/ui";
import { verifyEmailToken } from "@/modules/auth/actions";

export default async function VerifyEmailPage({ searchParams }: PageProps<"/[locale]/verify-email">) {
  const { token } = await searchParams;
  const ok = typeof token === "string" && (await verifyEmailToken(token));
  const t = await getTranslations();
  return (
    <div className="space-y-5 text-center">
      {ok ? <CheckCircle2 className="mx-auto text-emerald-600" size={40} /> : <XCircle className="mx-auto text-red-500" size={40} />}
      <p className="text-lg font-medium">{ok ? t("auth.verifyOk") : t("errors.tokenInvalid")}</p>
      <Link href="/dashboard" className={buttonClass("primary", "md")}>
        {t("nav.dashboard")}
      </Link>
    </div>
  );
}
