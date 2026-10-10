"use client";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/core/i18n/navigation";
import { Button, Field, Input } from "@/components/ui";
import { FormError, useFieldError } from "@/components/auth/form-error";
import { registerFormAction, type AuthFormState } from "@/modules/auth/actions";

export function RegisterForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(registerFormAction, {} as AuthFormState);
  const fe = useFieldError(state);
  const v = state.values ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("registerTitle")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("registerSubtitle")}</p>
      </div>
      <FormError state={state} />
      <Field label={t("restaurantName")} htmlFor="rname" error={fe("restaurantName")}>
        <Input id="rname" name="restaurantName" required minLength={2} defaultValue={v.restaurantName} placeholder="Trattoria Bella Vista" />
      </Field>
      <Field label={t("yourName")} htmlFor="name" error={fe("name")}>
        <Input id="name" name="name" required autoComplete="name" defaultValue={v.name} />
      </Field>
      <Field label={tc("email")} htmlFor="email" error={fe("email")}>
        <Input id="email" name="email" type="email" required autoComplete="email" defaultValue={v.email} />
      </Field>
      <Field label={tc("password")} htmlFor="password" hint={t("passwordHint")} error={fe("password")}>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </Field>
      <label className="flex items-start gap-2 text-sm text-stone-600">
        <input type="checkbox" name="acceptTerms" required className="mt-1 accent-brand-700" />
        <span>
          {t.rich("acceptTerms", {
            agb: (chunks) => (
              <Link href="/agb" target="_blank" className="text-brand-700 underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/datenschutz" target="_blank" className="text-brand-700 underline">
                {chunks}
              </Link>
            ),
          })}
        </span>
      </label>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t("register")}
      </Button>
      <p className="text-center text-sm text-stone-500">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          {t("login")}
        </Link>
      </p>
    </form>
  );
}
