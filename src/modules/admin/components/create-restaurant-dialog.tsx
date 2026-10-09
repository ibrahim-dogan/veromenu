"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/components/use-action";
import { useRouter } from "@/core/i18n/navigation";
import { UI_LOCALES, localeInfo } from "@/core/i18n/locales";
import { PLANS } from "@/modules/billing/plans";
import { adminCreateRestaurant } from "../actions";

export function CreateRestaurantDialog() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", ownerEmail: "", ownerName: "", plan: "free", locale: "de" as "de" | "en" | "tr" });
  const { run, pending, fieldErrors } = useAction(adminCreateRestaurant, {
    onSuccess: (d) => {
      toast.success(d.invited ? t("createRestaurant.createdInvited") : t("createRestaurant.created"));
      setOpen(false);
      router.push(`/admin/restaurants/${d.restaurantId}`);
    },
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden /> {t("restaurants.create")}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("createRestaurant.title")}
        description={t("createRestaurant.description")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button form="vm-create-restaurant" type="submit" loading={pending}>
              {t("createRestaurant.submit")}
            </Button>
          </>
        }
      >
        <form
          id="vm-create-restaurant"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ ...form, ownerName: form.ownerName || undefined });
          }}
        >
          <Field label={t("createRestaurant.name")} htmlFor="cr-name">
            <Input id="cr-name" required minLength={2} maxLength={100} value={form.name} onChange={set("name")} aria-invalid={!!fieldErrors.name} autoFocus />
          </Field>
          <Field label={t("createRestaurant.ownerEmail")} htmlFor="cr-email" hint={t("createRestaurant.ownerEmailHint")}>
            <Input id="cr-email" type="email" required value={form.ownerEmail} onChange={set("ownerEmail")} aria-invalid={!!fieldErrors.ownerEmail} />
          </Field>
          <Field label={t("createRestaurant.ownerName")} htmlFor="cr-owner" hint={t("createRestaurant.ownerNameHint")}>
            <Input id="cr-owner" maxLength={100} value={form.ownerName} onChange={set("ownerName")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("createRestaurant.plan")} htmlFor="cr-plan">
              <Select id="cr-plan" value={form.plan} onChange={set("plan")}>
                {PLANS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(`plans.${p.id}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("createRestaurant.locale")} htmlFor="cr-locale">
              <Select id="cr-locale" value={form.locale} onChange={set("locale")}>
                {UI_LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {localeInfo(l)?.native ?? l}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </form>
      </Dialog>
    </>
  );
}
