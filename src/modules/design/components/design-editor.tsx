"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, ExternalLink, RotateCcw, Smartphone, Monitor } from "lucide-react";
import { cn } from "@/core/utils";
import { Button, Card, CardBody, CardHeader, Badge, Field, Input, Select } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/use-action";
import { defaultConfig, encodeConfigParam } from "@/themes/config";
import { FONT_PAIRINGS, FONT_PAIRING_IDS } from "@/themes/font-pairings";
import { localized, type ThemeConfig, type ThemeField, type ThemeManifest } from "@/themes/types";
import { saveThemeAction } from "../actions";

type Props = {
  restaurantId: string;
  slug: string;
  manifests: ThemeManifest[];
  savedThemeId: string;
  savedConfig: ThemeConfig;
};

const same = (a: ThemeConfig, b: ThemeConfig) => JSON.stringify(a) === JSON.stringify(b);

export function DesignEditor({ restaurantId, slug, manifests, savedThemeId, savedConfig }: Props) {
  const t = useTranslations("design");
  const tt = useTranslations("themes");
  const locale = useLocale();
  const [saved, setSaved] = useState({ themeId: savedThemeId, config: savedConfig });
  const [themeId, setThemeId] = useState(savedThemeId);
  // drafts per theme, so switching back and forth keeps edits
  const [drafts, setDrafts] = useState<Record<string, ThemeConfig>>({ [savedThemeId]: savedConfig });
  const [device, setDevice] = useState<"phone" | "desktop">("phone");
  const manifest = manifests.find((m) => m.id === themeId) ?? manifests[0];
  const config = drafts[manifest.id] ?? defaultConfig(manifest);
  const dirty = themeId !== saved.themeId || !same(config, saved.config);

  const { run, pending } = useAction(saveThemeAction, {
    success: t("saved"),
    onSuccess: (d) => setSaved({ themeId: d.themeId, config: d.config }),
  });

  const setValue = (key: string, value: ThemeConfig[string]) => setDrafts((d) => ({ ...d, [manifest.id]: { ...config, [key]: value } }));

  // debounced live preview URL
  const previewSrc = useMemo(() => `/m/${slug}?preview=1&theme=${encodeURIComponent(manifest.id)}&config=${encodeConfigParam(config)}`, [slug, manifest.id, config]);
  const [iframeSrc, setIframeSrc] = useState(previewSrc);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (previewSrc === iframeSrc) return;
    const h = setTimeout(() => {
      setLoading(true);
      setIframeSrc(previewSrc);
    }, 350);
    return () => clearTimeout(h);
  }, [previewSrc, iframeSrc]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title={t("gallery")} description={t("galleryHint")} />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={t("gallery")}>
              {manifests.map((m) => {
                const active = m.id === manifest.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setThemeId(m.id);
                      setDrafts((d) => (d[m.id] ? d : { ...d, [m.id]: m.id === saved.themeId ? saved.config : defaultConfig(m) }));
                    }}
                    className={cn(
                      "focus-ring group overflow-hidden rounded-xl border text-left transition-shadow",
                      active ? "border-brand-600 ring-brand-600 shadow-md ring-2" : "border-stone-200 hover:shadow-md",
                    )}
                  >
                    <div className="relative aspect-[4/5] bg-stone-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.preview} alt="" className="h-full w-full object-cover" loading="lazy" />
                      {active && (
                        <span className="bg-brand-700 absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full text-white shadow">
                          <Check size={16} />
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-stone-900">{m.name}</p>
                        {m.id === saved.themeId && <Badge tone="green">{t("active")}</Badge>}
                      </div>
                      <p className="line-clamp-3 text-xs text-stone-500">{localized(m.description, locale)}</p>
                      <p className="text-[11px] text-stone-400">
                        {tt("byAuthor", { author: m.author })} · {tt("version", { version: m.version })}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t("settings", { theme: manifest.name })}
            description={t("settingsHint")}
            actions={
              <Button variant="ghost" size="sm" onClick={() => setDrafts((d) => ({ ...d, [manifest.id]: defaultConfig(manifest) }))} disabled={same(config, defaultConfig(manifest))}>
                <RotateCcw size={14} /> {t("reset")}
              </Button>
            }
          />
          <CardBody>
            <div className="grid gap-5 sm:grid-cols-2">
              {manifest.fields.map((f) => (
                <ConfigField key={f.key} field={f} value={config[f.key]} onChange={(v) => setValue(f.key, v)} locale={locale} />
              ))}
            </div>
          </CardBody>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-stone-100 bg-stone-50 px-5 py-3">
            {dirty && <span className="mr-auto text-sm text-amber-700">{t("unsaved")}</span>}
            <Button
              variant="secondary"
              onClick={() => {
                setThemeId(saved.themeId);
                setDrafts((d) => ({ ...d, [saved.themeId]: saved.config }));
              }}
              disabled={!dirty || pending}
            >
              {t("discard")}
            </Button>
            <Button onClick={() => run({ restaurantId, themeId: manifest.id, config })} loading={pending} disabled={!dirty}>
              {t("save")}
            </Button>
          </div>
        </Card>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader
            title={t("preview")}
            description={t("previewHint")}
            actions={
              <div className="flex items-center gap-1">
                <Button variant={device === "phone" ? "secondary" : "ghost"} size="icon" onClick={() => setDevice("phone")} aria-label={t("devicePhone")} aria-pressed={device === "phone"}>
                  <Smartphone size={16} />
                </Button>
                <Button variant={device === "desktop" ? "secondary" : "ghost"} size="icon" onClick={() => setDevice("desktop")} aria-label={t("deviceDesktop")} aria-pressed={device === "desktop"}>
                  <Monitor size={16} />
                </Button>
                <a href={iframeSrc} target="_blank" rel="noopener" className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-stone-600 hover:bg-stone-100" aria-label={t("openPreview")} title={t("openPreview")}>
                  <ExternalLink size={16} />
                </a>
              </div>
            }
          />
          <CardBody className="flex justify-center bg-stone-100/60 py-6">
            {device === "phone" ? (
              <div className="relative h-[700px] w-[340px] rounded-[2.75rem] border-[10px] border-stone-900 bg-stone-900 shadow-2xl">
                <div className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-stone-900" aria-hidden />
                <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-white">
                  <iframe key="phone" src={iframeSrc} title={t("preview")} className="h-full w-full border-0" onLoad={() => setLoading(false)} />
                  {loading && <PreviewLoading />}
                </div>
              </div>
            ) : (
              <div className="relative h-[700px] w-full overflow-hidden rounded-xl border border-stone-300 bg-white shadow-lg">
                <div className="h-[1400px] w-[200%] origin-top-left scale-50">
                  <iframe key="desktop" src={iframeSrc} title={t("preview")} className="h-full w-full border-0" onLoad={() => setLoading(false)} />
                </div>
                {loading && <PreviewLoading />}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/40">
      <span className="border-brand-600 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  );
}

function ConfigField({ field, value, onChange, locale }: { field: ThemeField; value: ThemeConfig[string]; onChange: (v: ThemeConfig[string]) => void; locale: string }) {
  const tt = useTranslations("themes");
  const id = `theme-field-${field.key}`;
  const label = localized(field.label, locale);
  const hint = field.hint ? localized(field.hint, locale) : undefined;
  switch (field.type) {
    case "color":
      return (
        <Field label={label} hint={hint} htmlFor={id}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={String(value)}
              onChange={(e) => onChange(e.target.value)}
              className="focus-ring h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-stone-300 bg-white p-1"
              aria-label={label}
            />
            <Input
              id={id}
              defaultValue={String(value)}
              key={String(value)}
              onBlur={(e) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(e.target.value) && onChange(e.target.value.toLowerCase())}
              className="font-mono uppercase"
              maxLength={7}
            />
          </div>
        </Field>
      );
    case "select":
      return (
        <Field label={label} hint={hint} htmlFor={id}>
          <Select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {localized(o.label, locale)}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "font": {
      const options = field.options ?? FONT_PAIRING_IDS;
      return (
        <Field label={label} hint={hint ?? tt("fontHint")} htmlFor={id}>
          <Select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {options.map((o) => {
              const p = FONT_PAIRINGS[o as keyof typeof FONT_PAIRINGS];
              return (
                <option key={o} value={o}>
                  {tt(`fonts.${o}`)}
                  {p ? ` – ${p.display}${p.display !== p.body ? ` + ${p.body}` : ""}` : ""}
                </option>
              );
            })}
          </Select>
        </Field>
      );
    }
    case "boolean":
      return (
        <Field hint={hint}>
          <Switch checked={!!value} onCheckedChange={onChange} label={label} />
        </Field>
      );
    case "range":
      return (
        <Field label={`${label}: ${value}${field.unit ?? ""}`} hint={hint} htmlFor={id}>
          <input
            id={id}
            type="range"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={Number(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="accent-brand-700 w-full"
          />
        </Field>
      );
  }
}
