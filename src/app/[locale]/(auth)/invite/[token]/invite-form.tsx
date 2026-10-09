"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/core/i18n/navigation";
import { Button, Field, Input } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { acceptInvitation } from "@/modules/auth/actions";

export function InviteForm({ token, email, hasAccount, loggedIn }: { token: string; email: string; hasAccount: boolean; loggedIn: boolean }) {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const { run, pending } = useAction(acceptInvitation, {
    refresh: false,
    onSuccess: (d) => router.replace(`/dashboard/${d.restaurantId}`),
  });
  return (
    <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), run({ token, name, password }))}>
      <Field label={tc("email")}>
        <Input value={email} disabled />
      </Field>
      {!loggedIn && !hasAccount && (
        <Field label={t("yourName")} htmlFor="name">
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      )}
      {!loggedIn && (
        <Field label={tc("password")} htmlFor="pw" hint={hasAccount ? undefined : t("passwordHint")}>
          <Input id="pw" type="password" required minLength={hasAccount ? 1 : 8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      )}
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t("acceptInvite")}
      </Button>
    </form>
  );
}
