"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button, Card, CardBody, CardHeader, Field, Select } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/use-action";
import { updateTranslationSettings } from "../actions";

export function QualitySettingsCard({
  restaurantId,
  guestsSeeOnlyApproved,
  autoApproveThreshold,
}: {
  restaurantId: string;
  guestsSeeOnlyApproved: boolean;
  autoApproveThreshold: number | null;
}) {
  const t = useTranslations("translations");
  const tc = useTranslations("common");
  const [only, setOnly] = useState(guestsSeeOnlyApproved);
  const [threshold, setThreshold] = useState(autoApproveThreshold == null ? "never" : String(autoApproveThreshold));
  const save = useAction(updateTranslationSettings, { success: tc("saved") });
  const dirty = only !== guestsSeeOnlyApproved || threshold !== (autoApproveThreshold == null ? "never" : String(autoApproveThreshold));

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck size={18} className="text-stone-400" /> {t("qualityTitle")}
          </span>
        }
        description={t("qualityDescription")}
      />
      <CardBody className="space-y-5">
        <ol className="space-y-2 text-sm text-stone-600">
          {(["how1", "how2", "how3", "how4"] as const).map((k, i) => (
            <li key={k} className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800">{i + 1}</span>
              <span>{t(k)}</span>
            </li>
          ))}
        </ol>
        <div className="space-y-4 border-t border-stone-100 pt-4">
          <Switch checked={only} onCheckedChange={setOnly} label={<span className="text-stone-800">{t("guestsSeeOnlyApproved")}</span>} />
          <p className="-mt-2 pl-[3.25rem] text-xs text-stone-500">{only ? t("guestsSeeOnlyApprovedOn") : t("guestsSeeOnlyApprovedOff")}</p>
          <Field label={t("autoApprove")} hint={t("autoApproveHint")} htmlFor="q-threshold">
            <Select id="q-threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="sm:max-w-xs">
              <option value="never">{t("autoApproveNever")}</option>
              <option value="5">{t("autoApproveAt", { score: "5" })}</option>
              <option value="4.5">{t("autoApproveAt", { score: "4,5" })}</option>
              <option value="4">{t("autoApproveAt", { score: "4" })}</option>
            </Select>
          </Field>
          <Button
            size="sm"
            disabled={!dirty}
            loading={save.pending}
            onClick={() =>
              save.run({ restaurantId, guestsSeeOnlyApproved: only, autoApproveThreshold: threshold === "never" ? null : Number(threshold) })
            }
          >
            {tc("save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
