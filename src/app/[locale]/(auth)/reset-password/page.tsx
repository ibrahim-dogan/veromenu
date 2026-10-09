"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/core/i18n/navigation";
import { Button, Field, Input } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/components/use-action";
import { resetPassword } from "@/modules/auth/actions";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const token = useSearchParams().get("token") ?? "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const { run, pending } = useAction(resetPassword, {
    refresh: false,
    onSuccess: () => {
      toast.success(t("passwordChanged"));
      router.replace("/login");
    },
  });
  return (
    <form className="space-y-5" onSubmit={(e) => (e.preventDefault(), run({ token, password }))}>
      <h1 className="text-2xl font-semibold">{t("resetTitle")}</h1>
      <Field label={t("newPassword")} htmlFor="pw" hint={t("passwordHint")}>
        <Input id="pw" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t("setPassword")}
      </Button>
    </form>
  );
}
