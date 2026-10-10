"use client";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/core/i18n/navigation";
import { Button, Field, Input } from "@/components/ui";
import { FormError } from "@/components/auth/form-error";
import { forgotFormAction, type AuthFormState } from "@/modules/auth/actions";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(forgotFormAction, {} as AuthFormState);
  return (
    <form action={formAction} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("forgotTitle")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("forgotSubtitle")}</p>
      </div>
      {state.done ? (
        <p className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">{t("linkSent")}</p>
      ) : (
        <>
          <FormError state={state} />
          <Field label={tc("email")} htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} />
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
