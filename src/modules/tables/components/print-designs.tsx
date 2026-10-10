"use client";
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, ExternalLink, Info, Lock, Paintbrush, Printer, Trash2 } from "lucide-react";
import { Badge, Button, Card, Field, Select, buttonClass } from "@/components/ui";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/components/use-action";
import { Link, useRouter } from "@/core/i18n/navigation";
import { cn } from "@/core/utils";
import { printLayout, printPageCount, printTableNumber } from "@/modules/theme-engine/print";
import { resolveSettings } from "@/modules/theme-engine/settings";
import type { ThemeMediaRef } from "@/modules/theme-engine/liquid";
import type { PrintView, ThemePackage } from "@/modules/theme-engine/types";
import { Customizer } from "@/modules/theme-studio/components/studio/customizer";
import { PrintCardPreview } from "@/modules/theme-studio/components/print-frame";
import { NewPrintDesign } from "@/modules/theme-ai/components/new-print-design";
import { deletePrintDesignAction, duplicatePrintDesignAction, savePrintDefaultsAction, selectPrintDesignAction } from "../actions";
import { ConfirmDialog } from "./confirm-dialog";

export type PrintDesignDto = {
  id: string;
  name: string;
  description: string | null;
  own: boolean;
  pkg: ThemePackage;
  media: Record<string, ThemeMediaRef>;
};
export type PrintTableDto = { id: string; label: string; area: string | null; isActive: boolean; url: string };
export type PrintBaseDto = Pick<PrintView, "restaurant" | "languages" | "ordering"> & { genericUrl: string };

const GENERIC = "__generic";

function makeView(base: PrintBaseDto, table: PrintTableDto | null): PrintView {
  return {
    restaurant: base.restaurant,
    languages: base.languages,
    ordering: base.ordering,
    table: table
      ? { label: table.label, area: table.area, number: printTableNumber(table.label), is_generic: false, url: table.url, qr_svg: "" }
      : { label: null, area: null, number: null, is_generic: true, url: base.genericUrl, qr_svg: "" },
    card: { index: 1, total: 1, face: "front" },
    settings: {},
    mode: "preview",
  };
}

const isPoster = (pkg: ThemePackage) => /^a4/.test(pkg.manifest.print?.format ?? "");
/** Thumbnail page (one card per page, tent = both faces) wider than tall? */
const isWide = (pkg: ThemePackage) => {
  const l = printLayout({ ...(pkg.manifest.print ?? { format: "a6" }), sheet: "card" });
  return l.page.w > l.page.h;
};

/**
 * "Druckdesigns" on the tables page: gallery of library + own print designs (theme packages of kind "print"),
 * customizer for the selected one (→ settings.print), table picker and the browser print route.
 */
export function PrintDesigns({
  restaurantId,
  designs,
  selection,
  tables,
  base,
  canUseTables,
  canUseStudio,
  cardLocale,
}: {
  restaurantId: string;
  designs: PrintDesignDto[];
  selection: { themeId: string; config: Record<string, unknown> } | null;
  tables: PrintTableDto[];
  base: PrintBaseDto;
  canUseTables: boolean;
  canUseStudio: boolean;
  /** language of the card texts (restaurant default locale) */
  cardLocale: string;
}) {
  const t = useTranslations("printDesigns");
  const router = useRouter();
  const selected = designs.find((d) => d.id === selection?.themeId) ?? null;
  const own = designs.filter((d) => d.own);
  const library = designs.filter((d) => !d.own);
  const [removing, setRemoving] = React.useState<PrintDesignDto | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const select = useAction(selectPrintDesignAction, { success: t("selectedToast") });
  const del = useAction(deletePrintDesignAction, { success: t("deleted"), onSuccess: () => setRemoving(null) });

  const firstTable = tables.find((x) => x.isActive) ?? tables[0] ?? null;
  const thumbViews = React.useMemo(() => ({ generic: makeView(base, null), table: makeView(base, firstTable) }), [base, firstTable]);

  const choose = async (d: PrintDesignDto) => {
    if (d.id === selected?.id) return;
    setPendingId(d.id);
    await select.run({ restaurantId, themeId: d.id });
    setPendingId(null);
  };

  const gallery = (list: PrintDesignDto[]) => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {list.map((d) => {
        const active = d.id === selected?.id;
        const fmt = d.pkg.manifest.print?.format ?? "a6";
        return (
          <li key={d.id} className="relative">
            <button
              type="button"
              onClick={() => choose(d)}
              disabled={!!pendingId}
              aria-pressed={active}
              className={cn(
                "group flex w-full flex-col overflow-hidden rounded-xl border bg-white text-start transition focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none",
                active ? "border-brand-600 ring-1 ring-brand-600" : "border-stone-200 hover:border-stone-300 hover:shadow-sm",
                pendingId === d.id && "animate-pulse",
              )}
            >
              <div className="flex h-52 items-center justify-center bg-stone-100 p-3">
                <PrintCardPreview
                  pkg={d.pkg}
                  view={isPoster(d.pkg) || !firstTable ? thumbViews.generic : thumbViews.table}
                  settings={active ? selection?.config : undefined}
                  media={d.media}
                  locale={cardLocale}
                  title={d.name}
                  className={cn("rounded-sm shadow-sm", isWide(d.pkg) ? "w-full" : "h-full")}
                />
              </div>
              <div className="flex items-start justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-900">{d.name}</p>
                  <p className="truncate text-xs text-stone-500">{t(`format_${fmt.replace(/-/g, "_")}`)}</p>
                </div>
                {active && (
                  <Badge tone="green" className="shrink-0">
                    <Check size={12} aria-hidden /> {t("selected")}
                  </Badge>
                )}
              </div>
            </button>
            {d.own && !active && (
              <button
                type="button"
                onClick={() => setRemoving(d)}
                className="absolute end-2 top-2 rounded-md bg-white/90 p-1.5 text-stone-500 shadow-sm hover:text-red-600"
                aria-label={`${t("delete")}: ${d.name}`}
                title={t("delete")}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-stone-900">{t("title")}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-stone-500">{t("description")}</p>
        </div>
      </div>
      {/* Full-width row: the entry cards form a 5-column grid (inside the header they overflowed the page). */}
      <div className="min-w-0 border-b border-stone-100 px-5 py-4">
        <NewPrintDesign
          restaurantId={restaurantId}
          canUseAi={canUseStudio}
          onCreated={async (id) => {
            await select.run({ restaurantId, themeId: id });
            router.refresh();
          }}
        />
      </div>

      <div className="space-y-6 px-5 py-5">
        {!canUseStudio && (
          <p className="flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden /> {t("studioLocked")}
          </p>
        )}
        {own.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("own")}</h3>
            {gallery(own)}
          </section>
        )}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("library")}</h3>
          {library.length ? gallery(library) : <p className="text-sm text-stone-500">{t("empty")}</p>}
        </section>

        {selected ? (
          <SelectedDesign
            key={selected.id}
            restaurantId={restaurantId}
            design={selected}
            storedConfig={selection?.config ?? {}}
            tables={tables}
            base={base}
            canUseTables={canUseTables}
            canUseStudio={canUseStudio}
            cardLocale={cardLocale}
          />
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-500">
            <Info size={16} aria-hidden /> {t("chooseHint")}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (removing) await del.run({ restaurantId, themeId: removing.id });
        }}
        title={t("deleteTitle")}
        description={removing ? t("deleteDescription", { name: removing.name }) : undefined}
        confirmLabel={t("delete")}
        danger
        pending={del.pending}
      />
    </Card>
  );
}

function SelectedDesign({
  restaurantId,
  design,
  storedConfig,
  tables,
  base,
  canUseTables,
  canUseStudio,
  cardLocale,
}: {
  restaurantId: string;
  design: PrintDesignDto;
  storedConfig: Record<string, unknown>;
  tables: PrintTableDto[];
  base: PrintBaseDto;
  canUseTables: boolean;
  canUseStudio: boolean;
  cardLocale: string;
}) {
  const t = useTranslations("printDesigns");
  const uiLocale = useLocale();
  const router = useRouter();
  const manifest = design.pkg.manifest;
  const stored = React.useMemo(() => resolveSettings(manifest, storedConfig), [manifest, storedConfig]);
  const [values, setValues] = React.useState<Record<string, unknown>>(stored);
  const dirty = JSON.stringify(values) !== JSON.stringify(stored);
  const layout = React.useMemo(() => printLayout(manifest.print), [manifest]);
  const fmtLabel = t(`format_${layout.format.replace(/-/g, "_")}`);
  const studioHref = `/dashboard/${restaurantId}/design/studio/${design.id}`;

  const activeTables = tables.filter((x) => x.isActive);
  const tablesAvailable = canUseTables && tables.length > 0;
  const [previewId, setPreviewId] = React.useState<string>(isPoster(design.pkg) || !tablesAvailable ? GENERIC : (activeTables[0] ?? tables[0]).id);
  const previewView = React.useMemo(() => makeView(base, tables.find((x) => x.id === previewId) ?? null), [base, tables, previewId]);

  const save = useAction(selectPrintDesignAction, { success: t("saved") });
  const saveDefaults = useAction(savePrintDefaultsAction, { success: t("defaultsSaved") });
  const duplicate = useAction(duplicatePrintDesignAction, {
    success: t("duplicated"),
    onSuccess: async (d) => {
      await save.run({ restaurantId, themeId: d.themeId, config: values as Record<string, string | number | boolean | null> });
    },
  });
  const config = values as Record<string, string | number | boolean | null>;

  // ---- print scope
  const [scope, setScope] = React.useState<"all" | "selected" | "generic">(tablesAvailable ? "all" : "generic");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [withGeneric, setWithGeneric] = React.useState(false);
  const tableCount = scope === "all" ? activeTables.length : scope === "selected" ? picked.size : 0;
  const cards = tableCount + (scope === "generic" || withGeneric ? 1 : 0);
  const pages = printPageCount(manifest.print, cards);
  const params = new URLSearchParams({ theme: design.id, locale: uiLocale });
  if (scope === "all") params.set("tables", "all");
  if (scope === "selected" && picked.size) params.set("tables", [...picked].join(","));
  if (scope === "generic" || withGeneric) params.set("generic", "1");
  if (dirty) params.set("config", JSON.stringify(values));
  const printHref = `/api/restaurants/${restaurantId}/print?${params}`;

  const togglePick = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-6 rounded-xl border border-stone-200 bg-stone-50/60 p-4 sm:p-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        {/* preview */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold text-stone-900">{design.name}</h3>
              <p className="text-sm text-stone-500">
                {fmtLabel} · {layout.sheet === "a4" && layout.slots.length > 1 ? t("sheetA4", { count: layout.slots.length }) : t("sheetCard")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {design.own && canUseStudio && (
                <Link href={studioHref} className={buttonClass("secondary", "sm")}>
                  <Paintbrush size={14} aria-hidden /> {t("editInStudio")}
                </Link>
              )}
              {canUseStudio && (
                <Button variant="secondary" size="sm" loading={duplicate.pending} onClick={() => duplicate.run({ restaurantId, themeId: design.id })}>
                  <Copy size={14} aria-hidden /> {t("duplicate")}
                </Button>
              )}
            </div>
          </div>
          <Field label={t("previewWith")} htmlFor="print-preview-table" className="max-w-xs">
            <Select id="print-preview-table" value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
              <option value={GENERIC}>{t("genericCard")}</option>
              {tablesAvailable &&
                tables.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                    {x.area ? ` · ${x.area}` : ""}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="rounded-xl bg-stone-200/70 p-4 sm:p-6">
            <PrintCardPreview
              pkg={design.pkg}
              view={previewView}
              settings={values}
              media={design.media}
              locale={cardLocale}
              title={`${t("preview")}: ${design.name}`}
              className={cn("mx-auto rounded-sm shadow-lg", layout.card.w > layout.card.h ? "max-w-xl" : "max-w-sm")}
            />
          </div>
        </div>

        {/* customizer */}
        <div className="flex h-[640px] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-3 py-2.5">
            <p className="text-sm font-medium text-stone-900">{t("customize")}</p>
            <p className="text-xs text-stone-500">{t("customizeHint")}</p>
          </div>
          <div className="min-h-0 flex-1">
            <Customizer
              restaurantId={restaurantId}
              manifest={manifest}
              values={values}
              onChange={(id, v) => setValues((cur) => ({ ...cur, [id]: v }))}
              isActive
              dirty={dirty}
              saving={save.pending}
              blocked={saveDefaults.pending}
              onSaveForGuests={() => save.run({ restaurantId, themeId: design.id, config })}
              onReset={() => setValues(resolveSettings(manifest, {}))}
              onSaveAsDefaults={() => {
                if (!design.own) return toast.error(t("defaultsLibrary"));
                void saveDefaults.run({ restaurantId, themeId: design.id, config });
              }}
              onEditFields={() => {
                if (design.own && canUseStudio) router.push(studioHref);
                else toast.error(design.own ? t("studioLocked") : t("fieldsInStudio"));
              }}
            />
          </div>
        </div>
      </div>

      {/* print */}
      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="flex items-center gap-2 font-semibold text-stone-900">
          <Printer size={16} aria-hidden /> {t("printTitle")}
        </h3>
        {!canUseTables && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden /> {t("tablesLocked")}
          </p>
        )}
        {canUseTables && !tables.length && <p className="text-sm text-stone-500">{t("noTables")}</p>}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-stone-700">{t("scope")}</legend>
          {(
            [
              ["all", t("scopeAll", { count: activeTables.length }), !tablesAvailable],
              ["selected", t("scopeSelected"), !tablesAvailable],
              ["generic", t("scopeGeneric"), false],
            ] as const
          ).map(([value, label, disabled]) => (
            <label key={value} className={cn("flex items-center gap-2 text-sm", disabled && "opacity-50")}>
              <input type="radio" name={`print-scope-${design.id}`} className="accent-brand-700" disabled={disabled} checked={scope === value} onChange={() => setScope(value)} />
              {label}
            </label>
          ))}
        </fieldset>
        {scope === "selected" && tablesAvailable && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium text-stone-700">{t("pickTables")}</span>
              <button type="button" className="text-brand-700 hover:underline" onClick={() => setPicked(new Set(tables.map((x) => x.id)))}>
                {t("selectAll")}
              </button>
              <button type="button" className="text-brand-700 hover:underline" onClick={() => setPicked(new Set())}>
                {t("selectNone")}
              </button>
            </div>
            <ul className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
              {tables.map((x) => (
                <li key={x.id}>
                  <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm", picked.has(x.id) ? "border-brand-600 bg-brand-50" : "border-stone-200 hover:border-stone-300")}>
                    <input type="checkbox" className="accent-brand-700" checked={picked.has(x.id)} onChange={() => togglePick(x.id)} />
                    <span className="truncate">{x.label}</span>
                    {!x.isActive && <span className="text-xs text-stone-400">({t("inactive")})</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {scope !== "generic" && <Switch checked={withGeneric} onCheckedChange={setWithGeneric} label={t("includeGeneric")} />}
        <div className="flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium text-stone-800">{cards ? t("summary", { cards, pages, format: fmtLabel }) : t("nothingToPrint")}</p>
            <p className="text-xs text-stone-500">{t("printHint")}</p>
            {dirty && <p className="text-xs text-amber-700">{t("unsaved")}</p>}
          </div>
          <a
            href={cards ? printHref : undefined}
            target="_blank"
            rel="noopener"
            aria-disabled={!cards}
            className={cn(buttonClass("primary", "md"), "shrink-0", !cards && "pointer-events-none opacity-50")}
          >
            <Printer size={16} aria-hidden /> {t("print")} <ExternalLink size={14} aria-hidden />
          </a>
        </div>
        <p className="text-xs text-stone-500">{t("quickPdfHint")}</p>
      </div>
    </div>
  );
}
