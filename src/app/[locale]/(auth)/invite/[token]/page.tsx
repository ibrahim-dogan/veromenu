import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/core/auth/session";
import { getInvitationInfo } from "@/modules/auth/actions";
import { InviteForm } from "./invite-form";

export default async function InvitePage({ params }: PageProps<"/[locale]/invite/[token]">) {
  const { token } = await params;
  const info = await getInvitationInfo(token);
  const t = await getTranslations();
  if (!info) return <p className="text-center text-red-600">{t("errors.tokenInvalid")}</p>;
  const user = await getCurrentUser();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("auth.inviteTitle", { restaurant: info.restaurant })}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("auth.inviteSubtitle")}</p>
      </div>
      <InviteForm token={token} email={info.email} hasAccount={info.hasAccount} loggedIn={!!user} />
    </div>
  );
}
