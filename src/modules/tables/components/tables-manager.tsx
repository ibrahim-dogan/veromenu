"use client";
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Download,
  ListPlus,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  buttonClass,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/components/use-action";
import { cn } from "@/core/utils";
import {
  bulkCreateTablesAction,
  createTableAction,
  deleteTableAction,
  regenerateTableTokenAction,
  updateTableAction,
} from "../actions";
import { ConfirmDialog } from "./confirm-dialog";
import { CopyButton } from "./copy-button";

export type TableDto = {
  id: string;
  label: string;
  area: string | null;
  seats: number | null;
  isActive: boolean;
  url: string;
};

type Editing = { mode: "create" } | { mode: "edit"; table: TableDto } | null;

export function TablesManager({
  restaurantId,
  tables,
  limit,
  hasLogo,
}: {
  restaurantId: string;
  tables: TableDto[];
  limit: number;
  hasLogo: boolean;
}) {
  const t = useTranslations("tables");
  const [editing, setEditing] = React.useState<Editing>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [printOpen, setPrintOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<TableDto | null>(null);
  const [regen, setRegen] = React.useState<TableDto | null>(null);
  const [remove, setRemove] = React.useState<TableDto | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [areaFilter, setAreaFilter] = React.useState<string>("");

  const update = useAction(updateTableAction);
  const regenerate = useAction(regenerateTableTokenAction, {
    success: t("regenerated"),
    onSuccess: () => setRegen(null),
  });
  const del = useAction(deleteTableAction, {
    success: t("deleted"),
    onSuccess: () => setRemove(null),
  });

  const areas = React.useMemo(
    () =>
      Array.from(
        new Set(tables.map((x) => x.area).filter(Boolean) as string[]),
      ).sort(),
    [tables],
  );
  const visible = areaFilter
    ? tables.filter((x) => x.area === areaFilter)
    : tables;
  const atLimit = tables.length >= limit;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allVisibleSelected =
    visible.length > 0 && visible.every((x) => selected.has(x.id));

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-stone-900">{t("list.title")}</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            {t("list.usage", { used: tables.length, limit })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPrintOpen(true)}
            disabled={!tables.length}
          >
            <Printer size={14} aria-hidden /> {t("print.button")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setBulkOpen(true)}
            disabled={atLimit}
          >
            <ListPlus size={14} aria-hidden /> {t("bulk.button")}
          </Button>
          <Button
            size="sm"
            onClick={() => setEditing({ mode: "create" })}
            disabled={atLimit}
          >
            <Plus size={14} aria-hidden /> {t("add")}
          </Button>
        </div>
      </div>
      {atLimit && (
        <p className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-sm text-amber-800">
          {t("list.limitReached")}
        </p>
      )}

      {tables.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={<QrCode size={28} />}
            title={t("list.emptyTitle")}
            description={t("list.emptyDescription")}
            action={
              <Button onClick={() => setBulkOpen(true)}>
                <ListPlus size={16} aria-hidden /> {t("bulk.button")}
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {areas.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-stone-100 px-5 py-3">
              <FilterChip
                active={!areaFilter}
                onClick={() => setAreaFilter("")}
              >
                {t("list.allAreas")}
              </FilterChip>
              {areas.map((a) => (
                <FilterChip
                  key={a}
                  active={areaFilter === a}
                  onClick={() => setAreaFilter(a)}
                >
                  {a}
                </FilterChip>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-2 text-sm text-stone-500">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-700"
              checked={allVisibleSelected}
              onChange={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  visible.forEach((x) =>
                    allVisibleSelected ? n.delete(x.id) : n.add(x.id),
                  );
                  return n;
                })
              }
              aria-label={t("list.selectAll")}
            />
            <span>
              {selected.size
                ? t("list.selected", { count: selected.size })
                : t("list.selectAll")}
            </span>
          </div>
          <ul className="divide-y divide-stone-100">
            {visible.map((row) => (
              <li
                key={row.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-5 py-3",
                  !row.isActive && "bg-stone-50/60",
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-700"
                  checked={selected.has(row.id)}
                  onChange={() => toggle(row.id)}
                  aria-label={row.label}
                />
                <button
                  type="button"
                  onClick={() => setPreview(row)}
                  className="focus-ring shrink-0 rounded-md border border-stone-200 bg-white p-0.5 hover:border-stone-400"
                  aria-label={t("preview.open", { label: row.label })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/restaurants/${restaurantId}/qr?table=${row.id}&format=svg&size=128`}
                    alt=""
                    width={44}
                    height={44}
                    className="h-11 w-11"
                    loading="lazy"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate font-medium",
                      row.isActive
                        ? "text-stone-900"
                        : "text-stone-400 line-through",
                    )}
                  >
                    {row.label}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    {row.area && <Badge>{row.area}</Badge>}
                    {row.seats != null && (
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} aria-hidden />{" "}
                        {t("list.seats", { count: row.seats })}
                      </span>
                    )}
                  </div>
                </div>
                <Switch
                  checked={row.isActive}
                  disabled={update.pending}
                  onCheckedChange={(v) =>
                    update.run({ restaurantId, tableId: row.id, isActive: v })
                  }
                  label={
                    <span className="hidden text-stone-500 sm:inline">
                      {row.isActive ? t("list.active") : t("list.inactive")}
                    </span>
                  }
                />
                <div className="flex items-center gap-0.5">
                  <a
                    href={`/api/restaurants/${restaurantId}/qr?table=${row.id}&format=png&size=1024&download=1`}
                    className={buttonClass("ghost", "icon")}
                    title={t("downloadPng")}
                    aria-label={t("downloadPng")}
                  >
                    <Download size={16} aria-hidden />
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing({ mode: "edit", table: row })}
                    title={t("edit")}
                    aria-label={t("edit")}
                  >
                    <Pencil size={16} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRegen(row)}
                    title={t("regenerate.button")}
                    aria-label={t("regenerate.button")}
                  >
                    <RefreshCw size={16} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRemove(row)}
                    title={t("delete")}
                    aria-label={t("delete")}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 size={16} aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <TableFormDialog
        key={editing?.mode === "edit" ? editing.table.id : "new"}
        restaurantId={restaurantId}
        editing={editing}
        areas={areas}
        onClose={() => setEditing(null)}
      />
      <BulkDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        restaurantId={restaurantId}
        areas={areas}
        remaining={limit - tables.length}
      />
      {printOpen && (
        <PrintDialog
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          restaurantId={restaurantId}
          selected={[...selected]}
          hasLogo={hasLogo}
        />
      )}
      <QrPreviewDialog
        restaurantId={restaurantId}
        table={preview}
        onClose={() => setPreview(null)}
      />
      <ConfirmDialog
        open={!!regen}
        onClose={() => setRegen(null)}
        onConfirm={() =>
          void (regen && regenerate.run({ restaurantId, tableId: regen.id }))
        }
        pending={regenerate.pending}
        danger
        title={t("regenerate.title", { label: regen?.label ?? "" })}
        description={t("regenerate.description")}
        confirmLabel={t("regenerate.confirm")}
      />
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        onConfirm={() =>
          void (remove && del.run({ restaurantId, tableId: remove.id }))
        }
        pending={del.pending}
        danger
        title={t("deleteTitle", { label: remove?.label ?? "" })}
        description={t("deleteDescription")}
        confirmLabel={t("delete")}
      />
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "focus-ring rounded-full border px-3 py-1 text-xs font-medium",
        active
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50",
      )}
    >
      {children}
    </button>
  );
}

function numOrNull(v: string) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function TableFormDialog({
  restaurantId,
  editing,
  areas,
  onClose,
}: {
  restaurantId: string;
  editing: Editing;
  areas: string[];
  onClose: () => void;
}) {
  const t = useTranslations("tables");
  const tc = useTranslations("common");
  const initial = editing?.mode === "edit" ? editing.table : null;
  const [label, setLabel] = React.useState(initial?.label ?? "");
  const [area, setArea] = React.useState(initial?.area ?? "");
  const [seats, setSeats] = React.useState(initial?.seats?.toString() ?? "");
  const [isActive, setIsActive] = React.useState(initial?.isActive ?? true);
  const create = useAction(createTableAction, {
    success: t("created"),
    onSuccess: onClose,
  });
  const update = useAction(updateTableAction, {
    success: tc("saved"),
    onSuccess: onClose,
  });
  const pending = create.pending || update.pending;
  const listId = React.useId();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      restaurantId,
      label,
      area: area || null,
      seats: numOrNull(seats),
      isActive,
    };
    if (initial) update.run({ ...payload, tableId: initial.id });
    else create.run(payload);
  }

  return (
    <Dialog
      open={!!editing}
      onClose={onClose}
      title={initial ? t("form.editTitle") : t("form.createTitle")}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" form="table-form" loading={pending}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <form id="table-form" onSubmit={submit} className="space-y-4">
        <Field
          label={t("form.label")}
          htmlFor="tbl-label"
          error={
            (create.fieldErrors.label ?? update.fieldErrors.label) &&
            t("form.labelRequired")
          }
        >
          <Input
            id="tbl-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("form.labelPlaceholder")}
            maxLength={60}
            required
            autoFocus
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("form.area")}
            htmlFor="tbl-area"
            hint={t("form.areaHint")}
          >
            <Input
              id="tbl-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              list={listId}
              maxLength={60}
              placeholder={t("form.areaPlaceholder")}
            />
            <datalist id={listId}>
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <Field label={t("form.seats")} htmlFor="tbl-seats">
            <Input
              id="tbl-seats"
              type="number"
              min={1}
              max={500}
              inputMode="numeric"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </Field>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={setIsActive}
          label={t("form.active")}
        />
      </form>
    </Dialog>
  );
}

function BulkDialog({
  open,
  onClose,
  restaurantId,
  areas,
  remaining,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  areas: string[];
  remaining: number;
}) {
  const t = useTranslations("tables");
  const tc = useTranslations("common");
  const [prefix, setPrefix] = React.useState(t("bulk.defaultPrefix"));
  const [from, setFrom] = React.useState("1");
  const [to, setTo] = React.useState("12");
  const [area, setArea] = React.useState("");
  const [seats, setSeats] = React.useState("");
  const bulk = useAction(bulkCreateTablesAction, {
    onSuccess: (d) => {
      toast.success(t("bulk.done", { count: d.created }));
      onClose();
    },
  });
  const f = parseInt(from, 10);
  const tt = parseInt(to, 10);
  const valid =
    Number.isFinite(f) && Number.isFinite(tt) && tt >= f && tt - f < 200;
  const count = valid ? tt - f + 1 : 0;
  const listId = React.useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    await bulk.run({
      restaurantId,
      prefix,
      from: f,
      to: tt,
      area: area || null,
      seats: numOrNull(seats),
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("bulk.title")}
      description={t("bulk.description")}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            type="submit"
            form="bulk-form"
            loading={bulk.pending}
            disabled={!valid || count > remaining}
          >
            {t("bulk.submit", { count })}
          </Button>
        </>
      }
    >
      <form id="bulk-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
          <Field label={t("bulk.prefix")} htmlFor="bulk-prefix">
            <Input
              id="bulk-prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              maxLength={40}
            />
          </Field>
          <Field label={t("bulk.from")} htmlFor="bulk-from">
            <Input
              id="bulk-from"
              type="number"
              min={0}
              className="w-20"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label={t("bulk.to")} htmlFor="bulk-to">
            <Input
              id="bulk-to"
              type="number"
              min={0}
              className="w-20"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("form.area")} htmlFor="bulk-area">
            <Input
              id="bulk-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              list={listId}
              maxLength={60}
              placeholder={t("form.areaPlaceholder")}
            />
            <datalist id={listId}>
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <Field label={t("form.seats")} htmlFor="bulk-seats">
            <Input
              id="bulk-seats"
              type="number"
              min={1}
              max={500}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
          </Field>
        </div>
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            count > remaining
              ? "bg-amber-50 text-amber-800"
              : "bg-stone-50 text-stone-600",
          )}
        >
          {valid
            ? count > remaining
              ? t("bulk.overLimit", { remaining })
              : t("bulk.preview", {
                  first: `${prefix} ${f}`.trim(),
                  last: `${prefix} ${tt}`.trim(),
                  count,
                })
            : t("bulk.invalidRange")}
        </p>
        <p className="text-xs text-stone-500">{t("bulk.skipHint")}</p>
      </form>
    </Dialog>
  );
}

function PrintDialog({
  open,
  onClose,
  restaurantId,
  selected,
  hasLogo,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  selected: string[];
  hasLogo: boolean;
}) {
  const t = useTranslations("tables");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [layout, setLayout] = React.useState<"sheet" | "tent">("sheet");
  const [scope, setScope] = React.useState<"all" | "selected">(
    selected.length ? "selected" : "all",
  );
  const [generic, setGeneric] = React.useState(false);
  const [logo, setLogo] = React.useState(true);

  const params = new URLSearchParams({
    layout,
    tables:
      scope === "selected" && selected.length ? selected.join(",") : "all",
    logo: logo ? "1" : "0",
    locale,
  });
  if (generic) params.set("generic", "1");
  const href = `/api/restaurants/${restaurantId}/qr/pdf?${params}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("print.title")}
      description={t("print.description")}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <a
            href={href}
            className={buttonClass("primary", "md")}
            onClick={() => setTimeout(onClose, 300)}
          >
            <Download size={16} aria-hidden /> {t("print.download")}
          </a>
        </>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-stone-700">
            {t("print.layout")}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["sheet", "tent"] as const).map((l) => (
              <label
                key={l}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 text-sm",
                  layout === l
                    ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                    : "border-stone-200 hover:border-stone-300",
                )}
              >
                <span className="flex items-center gap-2 font-medium text-stone-900">
                  <input
                    type="radio"
                    name="layout"
                    className="accent-brand-700"
                    checked={layout === l}
                    onChange={() => setLayout(l)}
                  />
                  {t(`print.${l}`)}
                </span>
                <span className="text-xs text-stone-500">
                  {t(`print.${l}Hint`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-stone-700">
            {t("print.scope")}
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              className="accent-brand-700"
              checked={scope === "all"}
              onChange={() => setScope("all")}
            />
            {t("print.allActive")}
          </label>
          <label
            className={cn(
              "flex items-center gap-2 text-sm",
              !selected.length && "opacity-50",
            )}
          >
            <input
              type="radio"
              name="scope"
              className="accent-brand-700"
              disabled={!selected.length}
              checked={scope === "selected"}
              onChange={() => setScope("selected")}
            />
            {t("print.selectedOnly", { count: selected.length })}
          </label>
        </fieldset>
        <div className="space-y-3">
          <Switch
            checked={generic}
            onCheckedChange={setGeneric}
            label={t("print.includeGeneric")}
          />
          <Switch
            checked={logo && hasLogo}
            disabled={!hasLogo}
            onCheckedChange={setLogo}
            label={hasLogo ? t("print.includeLogo") : t("print.noLogo")}
          />
        </div>
      </div>
    </Dialog>
  );
}

function QrPreviewDialog({
  restaurantId,
  table,
  onClose,
}: {
  restaurantId: string;
  table: TableDto | null;
  onClose: () => void;
}) {
  const t = useTranslations("tables");
  const base = table
    ? `/api/restaurants/${restaurantId}/qr?table=${table.id}`
    : "";
  return (
    <Dialog
      open={!!table}
      onClose={onClose}
      title={table?.label}
      description={table?.area ?? undefined}
      size="sm"
    >
      {table && (
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${base}&format=svg&size=512`}
            alt={t("preview.alt", { label: table.label })}
            className="mx-auto aspect-square w-full max-w-64 rounded-lg border border-stone-200"
          />
          <code className="block truncate rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
            {table.url}
          </code>
          {!table.isActive && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t("preview.inactive")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <CopyButton value={table.url} label={t("generic.copyLink")} />
            <a
              href={`${base}&format=png&size=1024&download=1`}
              className={buttonClass("secondary", "sm")}
            >
              <Download size={14} aria-hidden /> PNG
            </a>
            <a
              href={`${base}&format=svg&size=1024&download=1`}
              className={buttonClass("secondary", "sm")}
            >
              <Download size={14} aria-hidden /> SVG
            </a>
          </div>
        </div>
      )}
    </Dialog>
  );
}
