"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/core/i18n/navigation";
import { Button, Field, Input } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { requestPasswordReset } from "@/modules/auth/actions";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { run, pending } = useAction(requestPasswordReset, { refresh: false, onSuccess: () => setSent(true) });
  return (
    <form className="space-y-5" onSubmit={(e) => (e.preventDefault(), run({ email }))}>
      <div>
        <h1 className="text-2xl font-semibold">{t("forgotTitle")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("forgotSubtitle")}</p>
      </div>
      {sent ? (
        <p className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">{t("linkSent")}</p>
      ) : (
        <>
          <Field label={tc("email")} htmlFor="email">
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={pending}>
            {t("sendLink")}
          </Button>
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="text-brand-700 hover:underline">
          {t("login")}
        </Link>
      </p>
    </form>
  );
}
