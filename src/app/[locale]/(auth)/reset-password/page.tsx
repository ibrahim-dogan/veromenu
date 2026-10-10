"use client";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { FormError, useFieldError } from "@/components/auth/form-error";
import { resetFormAction, type AuthFormState } from "@/modules/auth/actions";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const token = useSearchParams().get("token") ?? "";
  const [state, formAction, pending] = useActionState(resetFormAction, {} as AuthFormState);
  const fe = useFieldError(state);
  return (
    <form action={formAction} className="space-y-5">
      <h1 className="text-2xl font-semibold">{t("resetTitle")}</h1>
      <FormError state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label={t("newPassword")} htmlFor="pw" hint={t("passwordHint")} error={fe("password")}>
        <Input id="pw" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t("setPassword")}
      </Button>
    </form>
  );
}
