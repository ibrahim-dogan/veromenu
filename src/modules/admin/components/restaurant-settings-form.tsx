"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Field, Input, Select } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/use-action";
import { cn } from "@/core/utils";
import { PLANS, planHas } from "@/modules/billing/plans";
import { ADMIN_MODULES, type AdminModule } from "../constants";
import { adminUpdateRestaurant } from "../actions";

export function RestaurantSettingsForm({
  id,
  initial,
}: {
  id: string;
  initial: { plan: string; planValidUntil: string; status: "active" | "suspended"; modules: string[] };
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [plan, setPlan] = useState(initial.plan);
  const [validUntil, setValidUntil] = useState(initial.planValidUntil);
  const [status, setStatus] = useState(initial.status);
  const [modules, setModules] = useState<AdminModule[]>(initial.modules.filter((m): m is AdminModule => (ADMIN_MODULES as readonly string[]).includes(m)));
  const { run, pending } = useAction(adminUpdateRestaurant, { success: t("detail.saved") });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run({ id, plan, planValidUntil: validUntil, status, modules });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("detail.plan")} htmlFor="rs-plan">
          <Select id="rs-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
            {PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {t(`plans.${p.id}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("detail.planValidUntil")} htmlFor="rs-valid" hint={t("detail.planValidUntilHint")}>
          <Input id="rs-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>
      </div>
      <Field label={t("detail.status")} htmlFor="rs-status" hint={t("detail.statusHint")}>
        <Select
          id="rs-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "active" | "suspended")}
          className={cn(status === "suspended" && "border-red-300 bg-red-50 text-red-800")}
        >
          <option value="active">{t("restaurants.statusActive")}</option>
          <option value="suspended">{t("restaurants.statusSuspended")}</option>
        </Select>
      </Field>
      <fieldset>
        <legend className="text-sm font-medium text-stone-700">{t("detail.modules")}</legend>
        <p className="mt-0.5 text-xs text-stone-500">{t("detail.modulesHint")}</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {ADMIN_MODULES.map((m) => {
            const inPlan = planHas(plan, m);
            return (
              <Switch
                key={m}
                checked={modules.includes(m)}
                onCheckedChange={(v) => setModules((cur) => (v ? [...cur, m] : cur.filter((x) => x !== m)))}
                label={
                  <span className="flex flex-wrap items-center gap-1.5">
                    {t(`modules.${m}`)}
                    {!inPlan && <span className="rounded bg-stone-100 px-1.5 py-px text-[11px] text-stone-500">{t("detail.notInPlan")}</span>}
                  </span>
                }
              />
            );
          })}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}
