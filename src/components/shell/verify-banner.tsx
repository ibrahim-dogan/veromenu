"use client";
import { useTranslations } from "next-intl";
import { resendVerification } from "@/modules/auth/actions";
import { useAction } from "@/components/use-action";

export function VerifyBanner() {
  const t = useTranslations();
  const { run, pending } = useAction(resendVerification, { refresh: false, success: t("auth.linkSent") });
  return (
    <div className="flex items-center justify-center gap-3 bg-sky-50 px-4 py-1.5 text-xs text-sky-800">
      {t("auth.verifyBanner")}
      <button disabled={pending} onClick={() => run({})} className="font-semibold underline">
        {t("auth.resend")}
      </button>
    </div>
  );
}
