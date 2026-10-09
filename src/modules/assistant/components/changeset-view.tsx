"use client";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight, FolderMinus, FolderPen, FolderPlus, Info, Pencil, Plus, Trash2 } from "lucide-react";
import { cn, formatPrice, toBcp47 } from "@/core/utils";
import type { ChangesetPreview, FieldKey, OpKind, PreviewField, PreviewNote, PreviewOp, PreviewValue, VariantInput } from "../types";

const KIND_ICON: Record<OpKind, typeof Pencil> = {
  update_item: Pencil,
  create_item: Plus,
  delete_item: Trash2,
  create_category: FolderPlus,
  update_category: FolderPen,
  delete_category: FolderMinus,
};

const KIND_TONE: Record<OpKind, string> = {
  update_item: "border-stone-200 bg-white",
  update_category: "border-stone-200 bg-white",
  create_item: "border-emerald-200 bg-emerald-50/40",
  create_category: "border-emerald-200 bg-emerald-50/40",
  delete_item: "border-red-200 bg-red-50/40",
  delete_category: "border-red-200 bg-red-50/40",
};

const ICON_TONE: Record<OpKind, string> = {
  update_item: "bg-brand-50 text-brand-700",
  update_category: "bg-brand-50 text-brand-700",
  create_item: "bg-emerald-100 text-emerald-700",
  create_category: "bg-emerald-100 text-emerald-700",
  delete_item: "bg-red-100 text-red-700",
  delete_category: "bg-red-100 text-red-700",
};

export function useNoteText() {
  const t = useTranslations("assistant");
  return (group: "notes" | "warnings" | "dropped", n: PreviewNote) => {
    const key = `${group}.${n.code}`;
    return t.has(key) ? t(key, n.params ?? {}) : n.code;
  };
}

export function ChangesetWarnings({ preview }: { preview: ChangesetPreview }) {
  const note = useNoteText();
  if (!preview.warnings.length && !preview.dropped.length) return null;
  return (
    <div className="space-y-2">
      {preview.warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          {preview.warnings.map((w, i) => (
            <li key={i} className="flex gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{note("warnings", w)}</span>
            </li>
          ))}
        </ul>
      )}
      {preview.dropped.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-600">
          {preview.dropped.map((w, i) => (
            <li key={i} className="flex gap-2">
              <Info size={15} className="mt-0.5 shrink-0" />
              <span>{note("dropped", w)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OpCard({
  op,
  selectable,
  checked,
  disabled,
  onToggle,
  muted,
}: {
  op: PreviewOp;
  selectable: boolean;
  checked?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  muted?: boolean;
}) {
  const t = useTranslations("assistant");
  const note = useNoteText();
  const Icon = KIND_ICON[op.kind];
  const isDelete = op.kind === "delete_item" || op.kind === "delete_category";
  return (
    <div className={cn("rounded-xl border p-3 sm:p-4 transition-opacity", KIND_TONE[op.kind], (muted || (selectable && !checked)) && "opacity-55")}>
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            className="mt-1.5 h-5 w-5 shrink-0 cursor-pointer rounded border-stone-300 accent-brand-700"
            checked={!!checked}
            disabled={disabled}
            onChange={onToggle}
            aria-label={t("toggleOp")}
          />
        )}
        <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", ICON_TONE[op.kind])}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className={cn("font-medium text-stone-900", isDelete && "line-through decoration-red-400")}>{op.title}</p>
            <span className="text-xs font-medium uppercase tracking-wide text-stone-400">{t(`kinds.${op.kind}`)}</span>
          </div>
          {op.context && <p className="truncate text-xs text-stone-500">{op.context}</p>}
          {op.fields.length > 0 && (
            <dl className="mt-2 space-y-1.5">
              {op.fields.map((f, i) => (
                <FieldRow key={i} f={f} kind={op.kind} />
              ))}
            </dl>
          )}
          {op.notes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {op.notes.map((n, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-amber-800">
                  <AlertTriangle size={13} className="mt-px shrink-0" />
                  {note("notes", n)}
                </li>
              ))}
            </ul>
          )}
          {op.dependsOn && selectable && <p className="mt-1.5 text-xs text-stone-500">{t("dependsOnHint")}</p>}
        </div>
      </div>
    </div>
  );
}

function FieldRow({ f, kind }: { f: PreviewField; kind: OpKind }) {
  const t = useTranslations("assistant");
  const label = t(`fields.${f.field}`);
  const isCreate = kind === "create_item" || kind === "create_category";
  const isDelete = kind === "delete_item" || kind === "delete_category";
  return (
    <div className="grid grid-cols-1 gap-0.5 text-sm sm:grid-cols-[7.5rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-stone-500 sm:pt-0.5 sm:text-sm">{label}</dt>
      <dd className="min-w-0">
        {f.field === "variants" ? (
          <VariantDiff before={(f.before as VariantInput[] | undefined) ?? (isCreate ? undefined : [])} after={f.after as VariantInput[] | undefined} />
        ) : isCreate ? (
          <Value field={f.field} value={f.after} className="text-emerald-800" />
        ) : isDelete ? (
          <Value field={f.field} value={f.before} className="text-red-700 line-through" />
        ) : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Value field={f.field} value={f.before} className="text-stone-500 line-through decoration-stone-400" />
            <ArrowRight size={14} className="shrink-0 text-stone-400" />
            <Value field={f.field} value={f.after} className="rounded bg-emerald-50 px-1 font-medium text-emerald-800" />
          </span>
        )}
      </dd>
    </div>
  );
}

function Value({ field, value, className }: { field: FieldKey; value: PreviewValue | undefined; className?: string }) {
  const t = useTranslations("assistant");
  const locale = toBcp47(useLocale());
  let text: string;
  if (value === undefined || value === null || value === "") text = field === "price" ? t("values.noPrice") : t("values.empty");
  else if (field === "price" && typeof value === "number") text = formatPrice(value, locale);
  else if (field === "available") text = value ? t("values.available") : t("values.soldOut");
  else if (field === "visible") text = value ? t("values.visible") : t("values.hidden");
  else if (Array.isArray(value)) text = value.length ? (value as string[]).join(", ") : t("values.empty");
  else text = String(value);
  return <span className={cn("break-words", className)}>{text}</span>;
}

function VariantDiff({ before, after }: { before?: VariantInput[]; after?: VariantInput[] }) {
  const t = useTranslations("assistant");
  const locale = toBcp47(useLocale());
  const names = [...new Set([...(before ?? []).map((v) => v.name), ...(after ?? []).map((v) => v.name)])];
  if (!names.length) return <span className="text-stone-500">{t("values.empty")}</span>;
  return (
    <ul className="space-y-0.5">
      {names.map((n) => {
        const b = before?.find((v) => v.name === n);
        const a = after?.find((v) => v.name === n);
        return (
          <li key={n} className="flex flex-wrap items-center gap-x-2">
            <span className="text-stone-700">{n}:</span>
            {b && a && b.priceCents !== a.priceCents ? (
              <>
                <span className="text-stone-500 line-through">{formatPrice(b.priceCents, locale)}</span>
                <ArrowRight size={13} className="text-stone-400" />
                <span className="rounded bg-emerald-50 px-1 font-medium text-emerald-800">{formatPrice(a.priceCents, locale)}</span>
              </>
            ) : b && a ? (
              <span className="text-stone-600">{formatPrice(a.priceCents, locale)}</span>
            ) : a ? (
              <span className="rounded bg-emerald-50 px-1 font-medium text-emerald-800">+ {formatPrice(a.priceCents, locale)}</span>
            ) : (
              <span className="text-red-700 line-through">{formatPrice(b!.priceCents, locale)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
