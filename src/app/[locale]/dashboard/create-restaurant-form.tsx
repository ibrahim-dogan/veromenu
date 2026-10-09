"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/core/i18n/navigation";
import { Button, Input } from "@/components/ui";
import { useAction } from "@/components/use-action";
import { createRestaurantForMe } from "@/modules/auth/actions";

export function CreateRestaurantForm() {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState("");
  const { run, pending } = useAction(createRestaurantForMe, { refresh: false, onSuccess: (d) => router.push(`/dashboard/${d.restaurantId}`) });
  return (
    <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), run({ name }))}>
      <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("auth.restaurantName")} />
      <Button type="submit" loading={pending}>
        {t("dashboard.createCta")}
      </Button>
    </form>
  );
}
