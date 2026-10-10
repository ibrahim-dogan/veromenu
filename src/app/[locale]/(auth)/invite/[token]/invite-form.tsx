"use client";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { FormError } from "@/components/auth/form-error";
import { inviteFormAction, type AuthFormState } from "@/modules/auth/actions";

export function InviteForm({ token, email, hasAccount, loggedIn }: { token: string; email: string; hasAccount: boolean; loggedIn: boolean }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(inviteFormAction, {} as AuthFormState);
  return (
    <form action={formAction} className="space-y-4">
      <FormError state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label={tc("email")}>
        <Input value={email} disabled readOnly />
      </Field>
      {!loggedIn && !hasAccount && (
        <Field label={t("yourName")} htmlFor="name">
          <Input id="name" name="name" required defaultValue={state.values?.name} autoComplete="name" />
        </Field>
      )}
      {!loggedIn && (
        <Field label={tc("password")} htmlFor="pw" hint={hasAccount ? undefined : t("passwordHint")}>
          <Input id="pw" name="password" type="password" required minLength={hasAccount ? 1 : 8} autoComplete={hasAccount ? "current-password" : "new-password"} />
        </Field>
      )}
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t("acceptInvite")}
      </Button>
    </form>
  );
}
