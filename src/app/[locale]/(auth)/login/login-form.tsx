"use client";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/core/i18n/navigation";
import { Button, Field, Input } from "@/components/ui";
import { FormError } from "@/components/auth/form-error";
import { loginFormAction, type AuthFormState } from "@/modules/auth/actions";

export function LoginForm({ notice, next }: { notice?: string; next?: string }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(loginFormAction, {} as AuthFormState);
  return (
    <form action={formAction} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t("loginTitle")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("loginSubtitle")}</p>
      </div>
      {notice && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{notice}</p>}
      <FormError state={state} />
      {next && <input type="hidden" name="next" value={next} />}
      <Field label={tc("email")} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} key={state.values?.email} />
      </Field>
      <Field label={tc("password")} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end text-sm">
        <Link href="/forgot-password" className="text-brand-700 hover:underline">
          {t("forgot")}
        </Link>
      </div>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t("login")}
      </Button>
      <p className="text-center text-sm text-stone-500">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-medium text-brand-700 hover:underline">
          {t("register")}
        </Link>
      </p>
    </form>
  );
}
