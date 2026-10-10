"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Laptop, Smartphone, Store } from "lucide-react";
import { Link, usePathname, useRouter } from "@/core/i18n/navigation";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { toast } from "@/components/ui/toast";
import { UI_LOCALES, localeInfo } from "@/core/i18n/locales";
import { changePassword, signOutOtherSessions, updateProfile } from "@/modules/account/actions";

type Props = {
  user: { name: string; email: string; locale: string; verified: boolean; createdAt: string };
  sessions: { id: string; current: boolean; userAgent: string | null; createdAt: string }[];
  restaurants: { id: string; name: string; roleName: string }[];
};

function deviceLabel(ua: string | null) {
  if (!ua) return { mobile: false, text: "—" };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? "macOS" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  return { mobile, text: [browser, os].filter(Boolean).join(" · ") };
}

export function AccountForms({ user, sessions, restaurants }: Props) {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState({ name: user.name, locale: (UI_LOCALES as readonly string[]).includes(user.locale) ? user.locale : locale });
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });

  const saveProfile = useAction(updateProfile, {
    success: tc("saved"),
    onSuccess: () => {
      if (profile.locale !== locale) router.replace(pathname, { locale: profile.locale as (typeof UI_LOCALES)[number] });
    },
  });
  const savePw = useAction(changePassword, { success: t("passwordChanged"), onSuccess: () => setPw({ currentPassword: "", newPassword: "", confirm: "" }) });
  const others = useAction(signOutOtherSessions, { success: t("othersSignedOut") });
  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const mismatch = pw.confirm.length > 0 && pw.confirm !== pw.newPassword;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t("profile")} description={t("profileHint")} />
        <CardBody>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile.run({ name: profile.name, locale: profile.locale as "de" | "en" | "tr" });
            }}
          >
            <Field label={tc("name")} htmlFor="acc-name">
              <Input id="acc-name" required maxLength={100} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </Field>
            <Field label={tc("email")} hint={user.verified ? t("emailVerified") : t("emailNotVerified")}>
              <Input value={user.email} readOnly disabled />
            </Field>
            <Field label={t("uiLanguage")} htmlFor="acc-locale">
              <Select id="acc-locale" value={profile.locale} onChange={(e) => setProfile({ ...profile, locale: e.target.value })}>
                {UI_LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {localeInfo(l)?.flag} {localeInfo(l)?.native}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end justify-end">
              <Button type="submit" loading={saveProfile.pending}>
                {tc("save")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("password")} description={t("passwordHint")} />
        <CardBody>
          <form
            className="grid gap-4 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (mismatch) return toast.error(t("passwordMismatch"));
              savePw.run({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
            }}
          >
            <Field label={t("currentPassword")} htmlFor="pw-cur">
              <Input id="pw-cur" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </Field>
            <Field label={t("newPassword")} htmlFor="pw-new" hint={savePw.fieldErrors.newPassword ? te("weakPassword") : t("min8")}>
              <Input id="pw-new" type="password" autoComplete="new-password" minLength={8} required value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </Field>
            <Field label={t("confirmPassword")} htmlFor="pw-conf" error={mismatch ? t("passwordMismatch") : undefined}>
              <Input id="pw-conf" type="password" autoComplete="new-password" required value={pw.confirm} aria-invalid={mismatch} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </Field>
            <div className="sm:col-span-3 flex justify-end">
              <Button type="submit" loading={savePw.pending} disabled={mismatch}>
                {t("changePassword")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t("sessions")}
          description={t("sessionsHint")}
          actions={
            sessions.length > 1 && (
              <Button variant="secondary" size="sm" loading={others.pending} onClick={() => others.run({})}>
                {t("signOutOthers")}
              </Button>
            )
          }
        />
        <ul className="divide-y divide-stone-100">
          {sessions.map((s) => {
            const d = deviceLabel(s.userAgent);
            return (
              <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                {d.mobile ? <Smartphone size={18} className="text-stone-400" /> : <Laptop size={18} className="text-stone-400" />}
                <span className="flex-1">
                  {d.text}
                  <span className="block text-xs text-stone-500">{t("signedInAt", { date: fmt(s.createdAt) })}</span>
                </span>
                {s.current && <Badge tone="green">{t("thisDevice")}</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>

      {restaurants.length > 0 && (
        <Card>
          <CardHeader title={t("restaurants")} />
          <ul className="divide-y divide-stone-100">
            {restaurants.map((r) => (
              <li key={r.id}>
                <Link href={`/dashboard/${r.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-stone-50">
                  <Store size={18} className="text-brand-700" />
                  <span className="flex-1 font-medium">{r.name}</span>
                  <span className="text-xs text-stone-500">{r.roleName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-center text-xs text-stone-400">{t("memberSince", { date: fmt(user.createdAt) })}</p>
    </div>
  );
}
