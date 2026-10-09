"use client";
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Copy, Download, Info, Lock, Plus, Receipt, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { useAction } from "@/components/use-action";
import { cn } from "@/core/utils";
import { CONTENT_LOCALES } from "@/core/i18n/locales";
import type { RestaurantSettings } from "@/core/db/schema";
import { MediaPicker } from "@/modules/media/components/media-picker";
import { ConfirmDialog } from "@/modules/tables/components/confirm-dialog";
import {
  changeSlugAction,
  checkSlugAction,
  exportMenuAction,
  updateGeneralAction,
  updateLegalAction,
  updateLocalesAction,
  updateOpeningHoursAction,
  updateOrderingAction,
  updateTranslationSettingsAction,
} from "../actions";

function Section({ id, title, description, children, footer }: { id: string; title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-4">{children}</CardBody>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 bg-stone-50/60 px-5 py-3 rounded-b-xl">{footer}</div>}
    </Card>
  );
}

function SaveButton({ pending, form }: { pending: boolean; form?: string }) {
  const tc = useTranslations("common");
  return (
    <Button type="submit" form={form} loading={pending}>
      {tc("save")}
    </Button>
  );
}

// ------------------------------------------------------------------ general

export function GeneralSection({ restaurantId, name: initialName, settings }: { restaurantId: string; name: string; settings: RestaurantSettings }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [name, setName] = React.useState(initialName);
  const [cuisine, setCuisine] = React.useState(settings.cuisine ?? "");
  const [phone, setPhone] = React.useState(settings.phone ?? "");
  const [email, setEmail] = React.useState(settings.email ?? "");
  const [website, setWebsite] = React.useState(settings.website ?? "");
  const [address, setAddress] = React.useState({
    street: settings.address?.street ?? "",
    zip: settings.address?.zip ?? "",
    city: settings.address?.city ?? "",
    country: settings.address?.country ?? "Deutschland",
  });
  const [logo, setLogo] = React.useState<string | null>(settings.logoMediaId ?? null);
  const [cover, setCover] = React.useState<string | null>(settings.coverMediaId ?? null);
  const save = useAction(updateGeneralAction, { success: tc("saved") });
  const fe = save.fieldErrors;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ restaurantId, name, cuisine, phone, email, website, address, logoMediaId: logo, coverMediaId: cover });
      }}
    >
      <Section id="general" title={t("general.title")} description={t("general.description")} footer={<SaveButton pending={save.pending} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("general.name")} htmlFor="s-name" error={fe.name && t("general.nameError")}>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} />
          </Field>
          <Field label={t("general.cuisine")} htmlFor="s-cuisine" hint={t("general.cuisineHint")}>
            <Input id="s-cuisine" value={cuisine} onChange={(e) => setCuisine(e.target.value)} maxLength={80} placeholder={t("general.cuisinePlaceholder")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <MediaPicker restaurantId={restaurantId} value={logo} onChange={setLogo} label={t("general.logo")} />
          <MediaPicker restaurantId={restaurantId} value={cover} onChange={setCover} label={t("general.cover")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("general.phone")} htmlFor="s-phone">
            <Input id="s-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="tel" />
          </Field>
          <Field label={tc("email")} htmlFor="s-email" error={fe.email && t("general.emailError")}>
            <Input id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </Field>
          <Field label={t("general.website")} htmlFor="s-web" error={fe.website && t("general.websiteError")}>
            <Input id="s-web" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" maxLength={300} />
          </Field>
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-6">
          <legend className="mb-2 text-sm font-medium text-stone-700 sm:col-span-6">{t("general.address")}</legend>
          <Field label={t("general.street")} htmlFor="s-street" className="sm:col-span-6">
            <Input id="s-street" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} maxLength={120} autoComplete="street-address" />
          </Field>
          <Field label={t("general.zip")} htmlFor="s-zip" className="sm:col-span-2">
            <Input id="s-zip" value={address.zip} onChange={(e) => setAddress({ ...address, zip: e.target.value })} maxLength={12} inputMode="numeric" autoComplete="postal-code" />
          </Field>
          <Field label={t("general.city")} htmlFor="s-city" className="sm:col-span-2">
            <Input id="s-city" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} maxLength={80} />
          </Field>
          <Field label={t("general.country")} htmlFor="s-country" className="sm:col-span-2">
            <Input id="s-country" value={address.country} onChange={(e) => setAddress({ ...address, country: e.target.value })} maxLength={60} />
          </Field>
        </fieldset>
      </Section>
    </form>
  );
}

// ------------------------------------------------------------------ slug

export function SlugSection({ restaurantId, slug: initial, appUrl }: { restaurantId: string; slug: string; appUrl: string }) {
  const t = useTranslations("settings");
  const [slug, setSlug] = React.useState(initial);
  const [checked, setChecked] = React.useState<{ slug: string; status: "ok" | "taken" | "invalid" } | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const change = useAction(changeSlugAction, { success: t("slug.changed"), onSuccess: () => setConfirm(false) });
  const normalized = slug.trim().toLowerCase();
  const changed = normalized !== initial;
  const status = !changed ? "idle" : checked?.slug === normalized ? checked.status : "checking";

  React.useEffect(() => {
    if (!changed) return;
    const id = setTimeout(async () => {
      const res = await checkSlugAction({ restaurantId, slug: normalized });
      if (res.ok) setChecked({ slug: normalized, status: !res.data.valid ? "invalid" : res.data.available ? "ok" : "taken" });
    }, 400);
    return () => clearTimeout(id);
  }, [normalized, changed, restaurantId]);

  return (
    <Section id="slug" title={t("slug.title")} description={t("slug.description")}>
      <Field
        label={t("slug.label")}
        htmlFor="s-slug"
        error={status === "taken" ? t("slug.taken") : status === "invalid" ? t("slug.invalid") : undefined}
        hint={status === "ok" ? t("slug.available") : t("slug.hint")}
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex min-w-0 flex-1 items-center rounded-lg border border-stone-300 bg-stone-50 shadow-sm focus-within:ring-2 focus-within:ring-brand-500">
            <span className="hidden shrink-0 pl-3 text-sm text-stone-500 sm:inline">{appUrl.replace(/^https?:\/\//, "")}/m/</span>
            <input
              id="s-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              maxLength={48}
              className="h-10 min-w-0 flex-1 rounded-r-lg bg-white px-2 text-sm outline-none"
              aria-invalid={status === "taken" || status === "invalid"}
            />
          </div>
          <Button type="button" variant="secondary" disabled={!changed || status !== "ok"} onClick={() => setConfirm(true)}>
            {t("slug.change")}
          </Button>
        </div>
      </Field>
      <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        {t("slug.warning")}
      </p>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => change.run({ restaurantId, slug: normalized })}
        pending={change.pending}
        danger
        title={t("slug.confirmTitle")}
        description={t("slug.confirmDescription", { from: initial, to: normalized })}
        confirmLabel={t("slug.change")}
      />
    </Section>
  );
}

// ------------------------------------------------------------------ opening hours

type Slot = { open: string; close: string };
const DAYS = [1, 2, 3, 4, 5, 6, 7];

export function HoursSection({ restaurantId, hours }: { restaurantId: string; hours: { day: number; open: string; close: string }[] }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const dayName = (d: number) => new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(Date.UTC(2024, 0, d, 12)));
  const [byDay, setByDay] = React.useState<Record<number, Slot[]>>(() =>
    Object.fromEntries(DAYS.map((d) => [d, hours.filter((h) => h.day === d).map(({ open, close }) => ({ open, close }))])),
  );
  const save = useAction(updateOpeningHoursAction, { success: tc("saved") });
  const update = (d: number, slots: Slot[]) => setByDay((s) => ({ ...s, [d]: slots }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ restaurantId, hours: DAYS.flatMap((d) => byDay[d].filter((s) => s.open && s.close).map((s) => ({ day: d, ...s }))) });
      }}
    >
      <Section id="hours" title={t("hours.title")} description={t("hours.description")} footer={<SaveButton pending={save.pending} />}>
        <ul className="divide-y divide-stone-100">
          {DAYS.map((d) => {
            const slots = byDay[d];
            const open = slots.length > 0;
            return (
              <li key={d} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start">
                <div className="flex w-full items-center justify-between gap-3 sm:w-48 sm:pt-1.5">
                  <span className="text-sm font-medium text-stone-800">{dayName(d)}</span>
                  <Switch checked={open} onCheckedChange={(v) => update(d, v ? [{ open: "11:00", close: "22:00" }] : [])} label={<span className="w-20 text-xs text-stone-500">{open ? t("hours.open") : t("hours.closed")}</span>} />
                </div>
                {open && (
                  <div className="flex flex-1 flex-col gap-2">
                    {slots.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input type="time" value={s.open} onChange={(e) => update(d, slots.map((x, k) => (k === i ? { ...x, open: e.target.value } : x)))} className="w-32" aria-label={t("hours.from")} required />
                        <span className="text-stone-400">–</span>
                        <Input type="time" value={s.close} onChange={(e) => update(d, slots.map((x, k) => (k === i ? { ...x, close: e.target.value } : x)))} className="w-32" aria-label={t("hours.to")} required />
                        <Button type="button" variant="ghost" size="icon" onClick={() => update(d, slots.filter((_, k) => k !== i))} aria-label={t("hours.removeSlot")}>
                          <Trash2 size={15} aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      {slots.length < 4 && (
                        <Button type="button" variant="link" size="sm" onClick={() => update(d, [...slots, { open: "17:00", close: "22:00" }])}>
                          <Plus size={14} aria-hidden /> {t("hours.addSlot")}
                        </Button>
                      )}
                      {d === 1 && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          onClick={() => setByDay((s) => ({ ...s, 2: [...slots], 3: [...slots], 4: [...slots], 5: [...slots] }))}
                        >
                          <Copy size={14} aria-hidden /> {t("hours.copyWeekdays")}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-stone-500">{t("hours.overnightHint")}</p>
      </Section>
    </form>
  );
}

// ------------------------------------------------------------------ legal

export function LegalSection({ restaurantId, legal }: { restaurantId: string; legal: RestaurantSettings["legal"] }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [v, setV] = React.useState({
    companyName: legal?.companyName ?? "",
    representative: legal?.representative ?? "",
    registerCourt: legal?.registerCourt ?? "",
    registerNumber: legal?.registerNumber ?? "",
    vatId: legal?.vatId ?? "",
    extra: legal?.extra ?? "",
  });
  const save = useAction(updateLegalAction, { success: tc("saved") });
  const field = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }) });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ restaurantId, legal: v });
      }}
    >
      <Section id="legal" title={t("legal.title")} description={t("legal.description")} footer={<SaveButton pending={save.pending} />}>
        <p className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
          {t("legal.why")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("legal.companyName")} htmlFor="l-company" hint={t("legal.companyHint")}>
            <Input id="l-company" maxLength={200} {...field("companyName")} />
          </Field>
          <Field label={t("legal.representative")} htmlFor="l-rep" hint={t("legal.representativeHint")}>
            <Input id="l-rep" maxLength={200} {...field("representative")} />
          </Field>
          <Field label={t("legal.registerCourt")} htmlFor="l-court" hint={t("legal.registerHint")}>
            <Input id="l-court" maxLength={120} placeholder={t("legal.registerCourtPlaceholder")} {...field("registerCourt")} />
          </Field>
          <Field label={t("legal.registerNumber")} htmlFor="l-reg">
            <Input id="l-reg" maxLength={60} placeholder="HRB 12345" {...field("registerNumber")} />
          </Field>
          <Field label={t("legal.vatId")} htmlFor="l-vat" hint={t("legal.vatHint")}>
            <Input id="l-vat" maxLength={30} placeholder="DE123456789" {...field("vatId")} />
          </Field>
        </div>
        <Field label={t("legal.extra")} htmlFor="l-extra" hint={t("legal.extraHint")}>
          <Textarea id="l-extra" maxLength={2000} rows={3} {...field("extra")} />
        </Field>
        <p className="text-xs text-stone-500">{t("legal.addressNote")}</p>
      </Section>
    </form>
  );
}

// ------------------------------------------------------------------ languages

export function LanguagesSection({
  restaurantId,
  defaultLocale,
  enabled,
  limit,
}: {
  restaurantId: string;
  defaultLocale: string;
  enabled: string[];
  limit: number;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const uiLocale = useLocale();
  const names = React.useMemo(() => {
    try {
      return new Intl.DisplayNames([uiLocale], { type: "language" });
    } catch {
      return null;
    }
  }, [uiLocale]);
  const [sel, setSel] = React.useState<Set<string>>(new Set([defaultLocale, ...enabled]));
  const save = useAction(updateLocalesAction, { success: tc("saved") });
  const atLimit = sel.size >= limit;
  const source = CONTENT_LOCALES.find((l) => l.code === defaultLocale);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ restaurantId, locales: [...sel] });
      }}
    >
      <Section
        id="languages"
        title={t("languages.title")}
        description={t("languages.description")}
        footer={
          <>
            <span className={cn("mr-auto text-sm tabular-nums", atLimit ? "text-amber-700" : "text-stone-500")}>{t("languages.count", { count: sel.size, limit })}</span>
            <SaveButton pending={save.pending} />
          </>
        }
      >
        <p className="text-sm text-stone-600">
          {t("languages.source")}{" "}
          <strong className="font-medium text-stone-900">
            {source?.flag} {names?.of(defaultLocale) ?? source?.native}
          </strong>{" "}
          – {t("languages.sourceHint")}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CONTENT_LOCALES.map((l) => {
            const isSource = l.code === defaultLocale;
            const checked = sel.has(l.code);
            const disabled = isSource || (!checked && atLimit);
            return (
              <li key={l.code}>
                <label
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                    checked ? "border-brand-300 bg-brand-50" : "border-stone-200 bg-white",
                    disabled ? "cursor-not-allowed" : "cursor-pointer hover:border-stone-300",
                    !checked && atLimit && "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-700"
                    checked={checked}
                    disabled={disabled}
                    onChange={() =>
                      setSel((s) => {
                        const n = new Set(s);
                        if (n.has(l.code)) n.delete(l.code);
                        else n.add(l.code);
                        return n;
                      })
                    }
                  />
                  <span className="text-lg leading-none" aria-hidden>
                    {l.flag}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-stone-800">{names?.of(l.code) ?? l.name}</span>
                    <span className="block truncate text-xs text-stone-500" dir={l.rtl ? "rtl" : undefined}>
                      {l.native}
                    </span>
                  </span>
                  {isSource && <Badge tone="green">{t("languages.sourceBadge")}</Badge>}
                </label>
              </li>
            );
          })}
        </ul>
        {atLimit && <p className="text-sm text-amber-800">{t("languages.limitReached", { limit })}</p>}
        <p className="text-xs text-stone-500">{t("languages.disableHint")}</p>
      </Section>
    </form>
  );
}

// ------------------------------------------------------------------ ordering

export function OrderingSection({
  restaurantId,
  ordering,
  planOk,
  tablesOk,
}: {
  restaurantId: string;
  ordering: NonNullable<RestaurantSettings["ordering"]>;
  planOk: boolean;
  tablesOk: boolean;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [v, setV] = React.useState(ordering);
  const save = useAction(updateOrderingAction, { success: tc("saved") });
  const off = !planOk;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ restaurantId, ordering: v });
      }}
    >
      <Section id="ordering" title={t("ordering.title")} description={t("ordering.description")} footer={planOk ? <SaveButton pending={save.pending} /> : undefined}>
        {off && (
          <p className="flex items-start gap-2 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
            {t("ordering.locked")}
          </p>
        )}
        <Switch checked={v.enabled} disabled={off} onCheckedChange={(enabled) => setV({ ...v, enabled })} label={<span className="font-medium text-stone-800">{t("ordering.enabled")}</span>} />
        <fieldset disabled={off} className={cn("space-y-4", (!v.enabled || off) && "opacity-60")}>
          <div>
            <p className="mb-2 text-sm font-medium text-stone-700">{t("ordering.acceptMode")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["manual", "auto"] as const).map((m) => (
                <label
                  key={m}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm",
                    v.acceptMode === m ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-stone-200 hover:border-stone-300",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium text-stone-900">
                    <input type="radio" name="acceptMode" className="accent-brand-700" checked={v.acceptMode === m} onChange={() => setV({ ...v, acceptMode: m })} />
                    {t(`ordering.${m}`)}
                  </span>
                  <span className="text-xs text-stone-500">{t(`ordering.${m}Hint`)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Switch checked={v.requireTable} onCheckedChange={(requireTable) => setV({ ...v, requireTable })} label={t("ordering.requireTable")} />
            <p className="pl-[3.25rem] text-xs text-stone-500">{tablesOk ? t("ordering.requireTableHint") : t("ordering.requireTableNoTables")}</p>
          </div>
          <div className="space-y-1">
            <Switch checked={v.allowNotes} onCheckedChange={(allowNotes) => setV({ ...v, allowNotes })} label={t("ordering.allowNotes")} />
            <p className="pl-[3.25rem] text-xs text-stone-500">{t("ordering.allowNotesHint")}</p>
          </div>
        </fieldset>
        <p className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <Receipt size={15} className="mt-px shrink-0" aria-hidden />
          {t("ordering.kassenHint")}
        </p>
      </Section>
    </form>
  );
}

// ------------------------------------------------------------------ translations quality

export function TranslationQualitySection({ restaurantId, value }: { restaurantId: string; value: NonNullable<RestaurantSettings["translations"]> }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [onlyApproved, setOnlyApproved] = React.useState(value.guestsSeeOnlyApproved);
  const [autoOn, setAutoOn] = React.useState(value.autoApproveThreshold != null);
  const [threshold, setThreshold] = React.useState(value.autoApproveThreshold ?? 4.5);
  const save = useAction(updateTranslationSettingsAction, { success: tc("saved") });
  const fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ restaurantId, translations: { guestsSeeOnlyApproved: onlyApproved, autoApproveThreshold: autoOn ? threshold : null } });
      }}
    >
      <Section id="translations" title={t("translations.title")} description={t("translations.description")} footer={<SaveButton pending={save.pending} />}>
        <div className="space-y-1">
          <Switch checked={onlyApproved} onCheckedChange={setOnlyApproved} label={t("translations.onlyApproved")} />
          <p className="pl-[3.25rem] text-xs text-stone-500">{t("translations.onlyApprovedHint")}</p>
        </div>
        <div className="space-y-2">
          <Switch checked={autoOn} onCheckedChange={setAutoOn} label={t("translations.autoApprove")} />
          <div className={cn("pl-[3.25rem]", !autoOn && "opacity-50")}>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={3.5}
                max={5}
                step={0.1}
                value={threshold}
                disabled={!autoOn}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full max-w-xs accent-brand-700"
                aria-label={t("translations.threshold")}
              />
              <span className="w-16 text-sm font-semibold tabular-nums text-stone-800">
                {fmt.format(threshold)} / 5
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-500">{t("translations.autoApproveHint", { value: fmt.format(threshold) })}</p>
          </div>
        </div>
      </Section>
    </form>
  );
}

// ------------------------------------------------------------------ danger zone

export function DangerSection({ restaurantId, slug, supportEmail }: { restaurantId: string; slug: string; supportEmail: string }) {
  const t = useTranslations("settings");
  const exp = useAction(exportMenuAction, {
    refresh: false,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-menu-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  return (
    <Card id="danger" className="scroll-mt-20 border-red-200">
      <CardHeader title={t("danger.title")} description={t("danger.description")} />
      <CardBody className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-stone-800">{t("danger.exportTitle")}</p>
            <p className="text-sm text-stone-500">{t("danger.exportDescription")}</p>
          </div>
          <Button variant="secondary" loading={exp.pending} onClick={() => exp.run({ restaurantId })}>
            <Download size={15} aria-hidden /> {t("danger.export")}
          </Button>
        </div>
        <div className="flex flex-col gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-red-700">{t("danger.deleteTitle")}</p>
            <p className="text-sm text-stone-500">{t("danger.deleteDescription", { email: supportEmail })}</p>
          </div>
          <a
            href={`mailto:${supportEmail}?subject=${encodeURIComponent(t("danger.deleteMailSubject", { slug }))}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            {t("danger.deleteRequest")}
          </a>
        </div>
      </CardBody>
    </Card>
  );
}
