"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, KeyRound, Pencil, Plug, Plus, Trash2, XCircle } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/use-action";
import type { ProviderView } from "@/core/ai/admin";
import { removeProvider, saveProvider, testProviderConnection } from "../actions";

type Adapter = { id: string; label: string; defaultBaseUrl: string };

function headersToText(h: Record<string, string>) {
  return Object.entries(h)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}
function textToHeaders(s: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const line of s.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const i = line.indexOf(":");
    if (i <= 0) return null;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function ProviderDialog({ open, onClose, adapters, provider }: { open: boolean; onClose: () => void; adapters: Adapter[]; provider: ProviderView | null }) {
  const t = useTranslations("adminAi");
  const tc = useTranslations("common");
  const [name, setName] = useState(provider?.name ?? "");
  const [adapter, setAdapter] = useState(provider?.adapter ?? adapters[0]?.id ?? "openai_compatible");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? adapters[0]?.defaultBaseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [headers, setHeaders] = useState(headersToText(provider?.extraHeaders ?? {}));
  const [enabled, setEnabled] = useState(provider?.isEnabled ?? true);
  const save = useAction(saveProvider, { success: tc("saved"), onSuccess: onClose });
  const parsedHeaders = textToHeaders(headers);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={provider ? t("editProvider") : t("addProvider")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            loading={save.pending}
            disabled={!name.trim() || !baseUrl.trim() || !parsedHeaders}
            onClick={() =>
              save.run({
                id: provider?.id,
                name,
                adapter,
                baseUrl,
                apiKey: removeKey ? null : apiKey.trim() || undefined,
                extraHeaders: parsedHeaders ?? {},
                isEnabled: enabled,
              })
            }
          >
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("providerName")} htmlFor="p-name">
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="NVIDIA NIM" />
        </Field>
        <Field label={t("adapter")} htmlFor="p-adapter">
          <Select
            id="p-adapter"
            value={adapter}
            onChange={(e) => {
              setAdapter(e.target.value);
              const a = adapters.find((x) => x.id === e.target.value);
              if (a && (!baseUrl || adapters.some((x) => x.defaultBaseUrl === baseUrl))) setBaseUrl(a.defaultBaseUrl);
            }}
          >
            {adapters.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("baseUrl")} hint={t("baseUrlHint")} htmlFor="p-url">
          <Input id="p-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://integrate.api.nvidia.com/v1" />
        </Field>
        <Field
          label={t("apiKey")}
          hint={provider?.keyMasked ? t("apiKeyKeep", { masked: provider.keyMasked }) : t("apiKeyHint")}
          htmlFor="p-key"
        >
          <Input
            id="p-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={removeKey}
            placeholder={provider?.keyMasked || "sk-…"}
          />
        </Field>
        {provider?.keyMasked && (
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={removeKey} onChange={(e) => setRemoveKey(e.target.checked)} />
            {t("apiKeyRemove")}
          </label>
        )}
        <Field label={t("extraHeaders")} hint={parsedHeaders ? t("extraHeadersHint") : t("extraHeadersInvalid")} htmlFor="p-headers">
          <Textarea
            id="p-headers"
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
            rows={3}
            className="font-mono text-xs"
            aria-invalid={!parsedHeaders}
            placeholder={"HTTP-Referer: https://veromenu.de\nX-Title: VeroMenu"}
          />
        </Field>
        <Switch checked={enabled} onCheckedChange={setEnabled} label={t("enabled")} />
      </div>
    </Dialog>
  );
}

function ProviderRow({ p, adapters, onEdit }: { p: ProviderView; adapters: Adapter[]; onEdit: () => void }) {
  const t = useTranslations("adminAi");
  const [result, setResult] = useState<null | { ok: boolean; text: string }>(null);
  const test = useAction(testProviderConnection, {
    refresh: false,
    onSuccess: (d) =>
      setResult(
        d.ok
          ? {
              ok: true,
              text: [
                t("testOk", { models: d.models, ms: d.ms }),
                d.balance?.remaining != null ? t("balance", { remaining: d.balance.remaining.toFixed(2), limit: d.balance.limit?.toFixed(2) ?? "∞" }) : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }
          : { ok: false, text: d.error },
      ),
  });
  const del = useAction(removeProvider, { success: t("providerDeleted") });
  return (
    <li className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-stone-900">{p.name}</span>
          <Badge tone={p.isEnabled ? "green" : "neutral"}>{p.isEnabled ? t("enabled") : t("disabled")}</Badge>
          <Badge>{adapters.find((a) => a.id === p.adapter)?.label.split(" (")[0] ?? p.adapter}</Badge>
          {p.taskCount > 0 && <Badge tone="blue">{t("usedByTasks", { n: p.taskCount })}</Badge>}
        </div>
        <p className="truncate font-mono text-xs text-stone-500">{p.baseUrl}</p>
        <p className="flex items-center gap-1 text-xs text-stone-500">
          <KeyRound size={12} />
          {p.keyBroken ? <span className="text-red-600">{t("keyBroken")}</span> : p.keyMasked ? <span className="font-mono">{p.keyMasked}</span> : t("noKey")}
        </p>
        {result && (
          <p className={`flex items-center gap-1 text-xs ${result.ok ? "text-emerald-700" : "text-red-700"}`} role="status">
            {result.ok ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {result.text}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        <Button size="sm" variant="secondary" loading={test.pending} onClick={() => (setResult(null), test.run({ id: p.id }))}>
          <Plug size={14} /> {t("testConnection")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil size={14} /> {t("edit")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={del.pending}
          aria-label={t("deleteProvider")}
          onClick={() => window.confirm(t("deleteConfirm", { name: p.name, n: p.taskCount })) && del.run({ id: p.id })}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </li>
  );
}

export function ProvidersCard({ providers, adapters }: { providers: ProviderView[]; adapters: Adapter[] }) {
  const t = useTranslations("adminAi");
  const [editing, setEditing] = useState<ProviderView | "new" | null>(null);
  return (
    <Card>
      <CardHeader
        title={t("providersTitle")}
        description={t("providersDescription")}
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus size={14} /> {t("addProvider")}
          </Button>
        }
      />
      {providers.length === 0 ? (
        <p className="px-5 py-6 text-sm text-stone-500">{t("noProviders")}</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {providers.map((p) => (
            <ProviderRow key={p.id} p={p} adapters={adapters} onEdit={() => setEditing(p)} />
          ))}
        </ul>
      )}
      {editing && (
        <ProviderDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onClose={() => setEditing(null)}
          adapters={adapters}
          provider={editing === "new" ? null : editing}
        />
      )}
    </Card>
  );
}
