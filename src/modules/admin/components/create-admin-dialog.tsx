"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldPlus } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/components/use-action";
import { UI_LOCALES, localeInfo } from "@/core/i18n/locales";
import { adminCreateAdmin } from "../actions";

const EMPTY = { email: "", name: "", password: "", locale: "de" as "de" | "en" | "tr" };

export function CreateAdminDialog() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const { run, pending, fieldErrors } = useAction(adminCreateAdmin, {
    onSuccess: (d) => {
      toast.success(d.promoted ? t("createAdmin.promoted") : d.linkSent ? t("createAdmin.createdLink") : t("createAdmin.created"));
      setOpen(false);
      setForm(EMPTY);
    },
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <ShieldPlus size={16} aria-hidden /> {t("users.createAdmin")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("createAdmin.title")}
        description={t("createAdmin.description")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button form="vm-create-admin" type="submit" loading={pending}>
              {t("createAdmin.submit")}
            </Button>
          </>
        }
      >
        <form
          id="vm-create-admin"
          className="space-y-4"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void run(form);
          }}
        >
          <Field label={t("createAdmin.email")} htmlFor="ca-email" hint={t("createAdmin.emailHint")}>
            <Input id="ca-email" type="email" required value={form.email} onChange={set("email")} aria-invalid={!!fieldErrors.email} autoFocus />
          </Field>
          <Field label={t("createAdmin.name")} htmlFor="ca-name">
            <Input id="ca-name" required maxLength={100} value={form.name} onChange={set("name")} />
          </Field>
          <Field
            label={`${t("createAdmin.password")} (${tc("optional")})`}
            htmlFor="ca-pw"
            hint={t("createAdmin.passwordHint")}
            error={fieldErrors.password ? te("weakPassword") : undefined}
          >
            <Input id="ca-pw" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={set("password")} aria-invalid={!!fieldErrors.password} />
          </Field>
          <Field label={t("createAdmin.locale")} htmlFor="ca-locale">
            <Select id="ca-locale" value={form.locale} onChange={set("locale")}>
              {UI_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {localeInfo(l)?.native ?? l}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Dialog>
    </>
  );
}
