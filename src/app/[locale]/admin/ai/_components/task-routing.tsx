"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, FlaskConical, Save, XCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input, Select } from "@/components/ui";
import { useAction } from "@/components/use-action";
import type { ProviderView, TaskSettingView } from "@/core/ai/admin";
import type { ModelInfo } from "@/core/ai/models";
import { fetchModels, runTaskTest, saveTaskRoute } from "../actions";
import { ModelPicker } from "./model-picker";

type ModelState = Record<string, { models: ModelInfo[] | null; error: string | null }>;

function useModelCatalog() {
  const [state, setState] = useState<ModelState>({});
  const requested = useRef(new Set<string>());
  const load = useAction(fetchModels, { refresh: false });
  function ensure(providerId: string | null) {
    if (!providerId || requested.current.has(providerId)) return;
    requested.current.add(providerId);
    setState((s) => ({ ...s, [providerId]: { models: null, error: null } }));
    void load.run({ providerId }).then((res) =>
      setState((s) => ({ ...s, [providerId]: res.ok ? { models: res.data.models, error: res.data.error } : { models: [], error: res.error } })),
    );
  }
  return { state, ensure };
}

function TaskRow({
  setting,
  providers,
  catalog,
}: {
  setting: TaskSettingView;
  providers: ProviderView[];
  catalog: ReturnType<typeof useModelCatalog>;
}) {
  const t = useTranslations("adminAi");
  const [providerId, setProviderId] = useState(setting.providerId ?? providers.find((p) => p.isEnabled)?.id ?? "");
  const [model, setModel] = useState(setting.model);
  const [fallback, setFallback] = useState(setting.fallbackModel ?? "");
  const [temperature, setTemperature] = useState(setting.temperature == null ? "" : String(setting.temperature));
  const [result, setResult] = useState<null | { ok: boolean; text: string }>(null);
  const save = useAction(saveTaskRoute, { success: t("taskSaved") });
  const test = useAction(runTaskTest, {
    refresh: false,
    onSuccess: (d) =>
      setResult(
        d.skipped
          ? { ok: true, text: t("testSkippedImage") }
          : d.ok
            ? { ok: true, text: t("taskTestOk", { model: d.model, ms: d.ms, text: d.text }) }
            : { ok: false, text: d.error },
      ),
  });
  const { ensure } = catalog;
  useEffect(() => ensure(providerId || null), [providerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const cat = providerId ? catalog.state[providerId] : undefined;
  const provider = providers.find((p) => p.id === providerId);
  const temp = temperature.trim() === "" ? null : Number(temperature.replace(",", "."));
  const dirty =
    providerId !== (setting.providerId ?? "") ||
    model !== setting.model ||
    fallback !== (setting.fallbackModel ?? "") ||
    temp !== setting.temperature;

  return (
    <tr className="align-top">
      <td className="border-b border-stone-100 px-4 py-3">
        <p className="font-medium text-stone-900">{t(`task.${setting.task}`)}</p>
        <p className="font-mono text-[11px] text-stone-400">{setting.task}</p>
        <Badge className="mt-1" tone="neutral">
          {t("needs", { cap: setting.capability })}
        </Badge>
        {setting.isDefault && (
          <Badge className="mt-1 ml-1" tone="yellow">
            {t("defaultRoute")}
          </Badge>
        )}
      </td>
      <td className="border-b border-stone-100 px-4 py-3">
        <Select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="h-9 min-w-36 text-sm" aria-label={t("provider")}>
          {!providerId && <option value="">–</option>}
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.isEnabled ? "" : ` (${t("disabled")})`}
            </option>
          ))}
        </Select>
        {provider && !provider.isEnabled && <p className="mt-1 text-[11px] text-amber-700">{t("providerDisabledHint")}</p>}
        {cat?.error && <p className="mt-1 text-[11px] text-red-700">{t("modelsError", { error: cat.error.slice(0, 120) })}</p>}
      </td>
      <td className="min-w-64 border-b border-stone-100 px-4 py-3">
        <ModelPicker value={model} onChange={setModel} models={cat?.models ?? null} capability={setting.capability} label={t("model")} />
      </td>
      <td className="min-w-64 border-b border-stone-100 px-4 py-3">
        <ModelPicker
          value={fallback}
          onChange={setFallback}
          models={cat?.models ?? null}
          capability={setting.capability}
          label={t("fallback")}
          placeholder={t("noFallback")}
          allowEmpty
        />
      </td>
      <td className="border-b border-stone-100 px-4 py-3">
        <Input
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          inputMode="decimal"
          className="h-9 w-20 text-sm"
          aria-label={t("temperature")}
          placeholder="–"
        />
      </td>
      <td className="border-b border-stone-100 px-4 py-3">
        <div className="flex flex-col items-stretch gap-1">
          <Button
            size="sm"
            disabled={!dirty || !providerId || !model.trim() || (temp !== null && (!Number.isFinite(temp) || temp < 0 || temp > 2))}
            loading={save.pending}
            onClick={() => save.run({ task: setting.task, providerId, model: model.trim(), fallbackModel: fallback.trim() || null, temperature: temp, maxTokens: setting.maxTokens })}
          >
            <Save size={14} /> {t("save")}
          </Button>
          <Button size="sm" variant="ghost" loading={test.pending} disabled={dirty} title={dirty ? t("saveFirst") : undefined} onClick={() => (setResult(null), test.run({ task: setting.task }))}>
            <FlaskConical size={14} /> {t("testTask")}
          </Button>
        </div>
        {result && (
          <p className={`mt-1 flex max-w-56 items-start gap-1 text-[11px] ${result.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
            {result.ok ? <CheckCircle2 size={12} className="mt-0.5 shrink-0" /> : <XCircle size={12} className="mt-0.5 shrink-0" />}
            <span className="break-words">{result.text}</span>
          </p>
        )}
      </td>
    </tr>
  );
}

export function TaskRouting({ settings, providers }: { settings: TaskSettingView[]; providers: ProviderView[] }) {
  const t = useTranslations("adminAi");
  const catalog = useModelCatalog();
  return (
    <Card>
      <CardHeader title={t("routingTitle")} description={t("routingDescription")} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {(["colTask", "provider", "model", "fallback", "temperature", "colActions"] as const).map((k) => (
                <th key={k} className="border-b border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-stone-500">
                  {t(k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <TaskRow key={s.task} setting={s} providers={providers} catalog={catalog} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
