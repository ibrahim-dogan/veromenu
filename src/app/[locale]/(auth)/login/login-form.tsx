"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/core/i18n/navigation";
import { Button, Field, Input } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { login } from "@/modules/auth/actions";

export function LoginForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const { run, pending } = useAction(login, { refresh: false });
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(form);
        if (res.ok) router.replace(res.data.isPlatformAdmin ? "/admin" : "/dashboard");
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold">{t("loginTitle")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("loginSubtitle")}</p>
      </div>
      <Field label={tc("email")} htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label={tc("password")} htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
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
