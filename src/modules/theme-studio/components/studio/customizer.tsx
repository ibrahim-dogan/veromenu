"use client";
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Info, Printer, RotateCcw, Save, Settings2, Stamp } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { MediaPicker } from "@/modules/media/components/media-picker";
import { FONT_LIBRARY, fontFaceCss, fontStack } from "@/modules/theme-engine/fonts";
import { settingFields } from "@/modules/theme-engine/settings";
import { printLayout } from "@/modules/theme-engine";
import type { PrintSpec, ThemeKind, ThemeManifest, ThemeSettingField } from "@/modules/theme-engine/types";
import { localizedText, PRINT_FORMAT_OPTIONS } from "../../lib/package";

const CATEGORY_ORDER = ["serif", "sans", "display", "script"] as const;

/** Auto-generated form from manifest.settings (like the WordPress Customizer). */
export function Customizer({
  restaurantId,
  manifest,
  values,
  onChange,
  isActive,
  dirty,
  saving,
  onSaveForGuests,
  onReset,
  onSaveAsDefaults,
  onEditFields,
  blocked,
  kind,
  onPrintSpec,
}: {
  restaurantId: string;
  manifest: ThemeManifest;
  values: Record<string, unknown>;
  onChange: (id: string, v: unknown) => void;
  isActive: boolean;
  dirty: boolean;
  saving: boolean;
  /** e.g. while an AI edit runs (server actions would queue behind it) */
  blocked?: boolean;
  onSaveForGuests: () => void;
  onReset: () => void;
  onSaveAsDefaults: () => void;
  onEditFields: () => void;
  /** "print": hints/labels for print designs + format controls (manifest.print); default: from manifest.kind */
  kind?: ThemeKind;
  onPrintSpec?: (spec: PrintSpec) => void;
}) {
  const t = useTranslations("themeStudio.customizer");
  // print designs are recognised from the manifest when the caller doesn't say (e.g. the tables page)
  const isPrint = (kind ?? (manifest.kind === "print" ? "print" : "menu")) === "print";
  const locale = useLocale();
  const fields = useMemo(() => settingFields(manifest), [manifest]);
  const fontIds = useMemo(() => fields.filter((f) => f.type === "font").map((f) => String(values[f.id] ?? f.default)), [fields, values]);

  return (
    <div className="flex h-full flex-col">
      {/* relative font URLs (same origin) – identical on server and client, no hydration mismatch */}
      {fontIds.length > 0 && <style>{fontFaceCss(fontIds, "")}</style>}
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("title")}</p>
        <Button variant="ghost" size="sm" onClick={onEditFields} title={t("editFields")}>
          <Settings2 size={14} aria-hidden /> {t("fields")}
        </Button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        <p className="flex gap-2 rounded-lg bg-stone-50 p-2.5 text-xs text-stone-600">
          <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
          {isPrint ? (isActive ? t("printHintActive") : t("printHintInactive")) : isActive ? t("hintActive") : t("hintInactive")}
        </p>
        {isPrint && manifest.print && onPrintSpec && <PrintSpecControls spec={manifest.print} onChange={onPrintSpec} />}
        {fields.length === 0 ? (
          <p className="text-sm text-stone-500">{t("empty")}</p>
        ) : (
          fields.map((f) => <SettingControl key={f.id} restaurantId={restaurantId} field={f} value={values[f.id]} onChange={(v) => onChange(f.id, v)} locale={locale} />)
        )}
      </div>
      <div className="space-y-2 border-t border-stone-200 bg-white p-3">
        {isActive && (
          <Button className="w-full" onClick={onSaveForGuests} loading={saving} disabled={!dirty || blocked}>
            <Save size={14} aria-hidden /> {isPrint ? t("saveForPrint") : t("saveForGuests")}
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onSaveAsDefaults} disabled={!fields.length} title={t("asDefaultsHint")}>
            <Stamp size={14} aria-hidden /> {t("asDefaults")}
          </Button>
          <Button variant="ghost" size="sm" onClick={onReset} disabled={!fields.length} title={t("reset")} aria-label={t("reset")}>
            <RotateCcw size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SettingControl({ restaurantId, field, value, onChange, locale }: { restaurantId: string; field: ThemeSettingField; value: unknown; onChange: (v: unknown) => void; locale: string }) {
  const t = useTranslations("themeStudio.customizer");
  const id = `setting-${field.id}`;
  const label = localizedText(field.label, locale) || field.id;
  switch (field.type) {
    case "color": {
      const v = typeof value === "string" ? value : typeof field.default === "string" ? field.default : "#000000";
      return (
        <Field label={label} htmlFor={id}>
          <div className="flex items-center gap-2">
            <input type="color" value={v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v.slice(0, 7)} onChange={(e) => onChange(e.target.value)} className="focus-ring h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-stone-300 bg-white p-1" aria-label={label} />
            <Input
              id={id}
              key={v}
              defaultValue={v}
              onBlur={(e) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(e.target.value) && onChange(e.target.value.toLowerCase())}
              className="font-mono uppercase"
              maxLength={9}
            />
          </div>
        </Field>
      );
    }
    case "font": {
      const v = typeof value === "string" ? value : String(field.default ?? "");
      return (
        <Field label={label} htmlFor={id}>
          <Select id={id} value={v} onChange={(e) => onChange(e.target.value)}>
            {CATEGORY_ORDER.map((c) => (
              <optgroup key={c} label={t(`fontCategory_${c}`)}>
                {FONT_LIBRARY.filter((f) => f.category === c).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.family}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <p className="truncate rounded-md border border-stone-200 bg-white px-3 py-2 text-lg text-stone-800" style={{ fontFamily: fontStack(v) }}>
            {t("fontSample")}
          </p>
        </Field>
      );
    }
    case "select":
      return (
        <Field label={label} htmlFor={id}>
          <Select id={id} value={String(value ?? field.default)} onChange={(e) => onChange(e.target.value)}>
            {(Array.isArray(field.options) ? field.options : []).map((o) => (
              <option key={o.value} value={o.value}>
                {localizedText(o.label, locale) || o.value}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "checkbox":
      return <Switch checked={typeof value === "boolean" ? value : field.default} onCheckedChange={onChange} label={label} />;
    case "range": {
      const v = typeof value === "number" ? value : field.default;
      return (
        <Field label={`${label}: ${v}${field.unit ?? ""}`} htmlFor={id}>
          <input id={id} type="range" min={field.min} max={field.max} step={field.step} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-brand-700" />
        </Field>
      );
    }
    case "text":
      return (
        <Field label={label} htmlFor={id}>
          <Input id={id} value={typeof value === "string" ? value : String(field.default ?? "")}maxLength={field.maxLength ?? 500} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
    case "image":
      return <MediaPicker restaurantId={restaurantId} label={label} value={typeof value === "string" ? value : null} onChange={(v) => onChange(v)} />;
  }
}

/** Format + imposition of a print design (writes manifest.print in the working copy). */
function PrintSpecControls({ spec, onChange }: { spec: PrintSpec; onChange: (spec: PrintSpec) => void }) {
  const t = useTranslations("themeStudio.customizer");
  const tf = useTranslations("themeStudio.formats");
  const canImpose = printLayout({ ...spec, sheet: "a4" }).slots.length > 1;
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-stone-700">
        <Printer size={14} aria-hidden /> {t("printFormat")}
      </p>
      <Field label={t("format")} htmlFor="print-format">
        <Select
          id="print-format"
          value={spec.format}
          onChange={(e) => {
            const format = e.target.value as PrintSpec["format"];
            const imposable = printLayout({ format, sheet: "a4" }).slots.length > 1;
            onChange({ ...spec, format, sheet: imposable ? spec.sheet : "card" });
          }}
        >
          {PRINT_FORMAT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {tf(f)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("sheet")} htmlFor="print-sheet" hint={canImpose ? undefined : t("sheetOnlyCard")}>
        <Select id="print-sheet" value={canImpose ? spec.sheet : "card"} disabled={!canImpose} onChange={(e) => onChange({ ...spec, sheet: e.target.value as PrintSpec["sheet"] })}>
          <option value="a4">{t("sheet_a4")}</option>
          <option value="card">{t("sheet_card")}</option>
        </Select>
      </Field>
      <p className="text-[11px] text-stone-500">{t("formatHint")}</p>
    </div>
  );
}
