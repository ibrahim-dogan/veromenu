"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link, useRouter } from "@/core/i18n/navigation";
import { Button, Field, Input } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { register } from "@/modules/auth/actions";

export function RegisterForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", restaurantName: "", acceptTerms: false });
  const { run, pending, fieldErrors } = useAction(register, { refresh: false });
  const fe = (k: string) => (fieldErrors[k]?.[0] ? (te.has(fieldErrors[k][0]) ? te(fieldErrors[k][0]) : fieldErrors[k][0]) : undefined);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await run(form as typeof form & { acceptTerms: true });
        if (res.ok) router.replace(`/dashboard/${res.data.restaurantId}`);
      }}
    >
      <div>
        <h1 className="text-2xl font-semibold">{t("registerTitle")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("registerSubtitle")}</p>
      </div>
      <Field label={t("restaurantName")} htmlFor="rname" error={fe("restaurantName")}>
        <Input id="rname" required value={form.restaurantName} onChange={(e) => setForm({ ...form, restaurantName: e.target.value })} placeholder="Trattoria Bella Vista" />
      </Field>
      <Field label={t("yourName")} htmlFor="name" error={fe("name")}>
        <Input id="name" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label={tc("email")} htmlFor="email" error={fe("email")}>
        <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </Field>
      <Field label={tc("password")} htmlFor="password" hint={t("passwordHint")} error={fe("password")}>
        <Input id="password" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      <label className="flex items-start gap-2 text-sm text-stone-600">
        <input type="checkbox" required className="mt-1 accent-brand-700" checked={form.acceptTerms} onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })} />
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
