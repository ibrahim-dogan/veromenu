"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileUp,
  ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  ScanText,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { Link, useRouter } from "@/core/i18n/navigation";
import { cn, parsePriceToCents } from "@/core/utils";
import { Badge, Button, buttonClass, Card, CardBody, CardHeader, Input, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { ADDITIVES, ALLERGENS, catalogLabel } from "@/modules/allergens/catalog";
import { useBusyAction } from "@/modules/ai/components/use-busy-action";
import { applyMenuImport, discardMenuImport, runImport, startImport, uploadImportFile } from "../actions";
import type { ApplyImportResult, DraftItem, DraftMenu, ImportDto } from "../types";

const MAX_FILES = 10;
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";

type MenuOption = { id: string; name: string; itemCount: number };
type Props = {
  restaurantId: string;
  active: ImportDto | null;
  history: ImportDto[];
  menus: MenuOption[];
  limits: { items: number; itemsUsed: number; menus: number };
};

export function ImportClient(props: Props) {
  const { restaurantId, active } = props;
  const [applied, setApplied] = useState<ApplyImportResult | null>(null);
  return (
    <div className="space-y-6">
      {applied && <AppliedBanner restaurantId={restaurantId} result={applied} onClose={() => setApplied(null)} />}
      {active?.status === "ready" && active.draft ? (
        <DraftEditor key={active.id} {...props} active={active} onApplied={setApplied} />
      ) : active?.status === "processing" ? (
        <ProcessingCard since={active.createdAt} autoRefresh />
      ) : (
        <>
          {active?.status === "failed" && <FailedCard restaurantId={restaurantId} imp={active} />}
          <UploadCard restaurantId={restaurantId} />
          <PdfOnlyHint restaurantId={restaurantId} />
        </>
      )}
      <ImportHistory history={props.history.filter((h) => h.id !== active?.id)} />
    </div>
  );
}

// ------------------------------------------------------------------ upload

function UploadCard({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("import");
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<"idle" | "uploading" | "extracting">("idle");
  const [progress, setProgress] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useBusyAction(uploadImportFile, { refresh: false });
  const create = useBusyAction(startImport, { refresh: false });
  const run = useBusyAction(runImport);

  function addFiles(list: FileList | File[]) {
    const incoming = [...list].filter((f) => ACCEPT.split(",").includes(f.type) || /\.(jpe?g|png|webp|heic|pdf)$/i.test(f.name));
    if (incoming.length < [...list].length) toast.error(t("unsupportedFile"));
    setFiles((prev) => {
      const next = [...prev, ...incoming].slice(0, MAX_FILES);
      if (prev.length + incoming.length > MAX_FILES) toast.error(t("tooManyFiles", { max: MAX_FILES }));
      return next;
    });
  }

  async function start() {
    if (!files.length) return;
    setPhase("uploading");
    setProgress(0);
    const ids: string[] = [];
    for (const [i, file] of files.entries()) {
      const res = await upload.run({ restaurantId, file });
      if (!res.ok) return setPhase("idle");
      ids.push(res.data.mediaId);
      setProgress(i + 1);
    }
    const created = await create.run({ restaurantId, mediaIds: ids });
    if (!created.ok) return setPhase("idle");
    setPhase("extracting");
    setStartedAt(new Date().toISOString());
    const res = await run.run({ restaurantId, importId: created.data.importId });
    setPhase("idle");
    setFiles([]);
    if (res.ok && res.data.status === "failed") toast.error(t(`failReasons.${failReason(res.data.error)}`));
  }

  if (phase === "extracting" && startedAt) return <ProcessingCard since={startedAt} />;

  return (
    <Card>
      <CardHeader title={t("uploadTitle")} description={t("uploadHint", { max: MAX_FILES })} />
      <CardBody className="space-y-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          disabled={phase !== "idle"}
          className={cn(
            "focus-ring flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
            dragOver ? "border-brand-500 bg-brand-50" : "border-stone-300 bg-stone-50 hover:border-brand-400 hover:bg-brand-50/50",
          )}
        >
          <FileUp size={28} className="text-brand-700" />
          <span className="font-medium text-stone-800">{t("dropTitle")}</span>
          <span className="text-xs text-stone-500">{t("dropHint")}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {files.map((f, i) => (
              <FileThumb key={`${f.name}-${i}`} file={f} done={phase === "uploading" && i < progress} onRemove={phase === "idle" ? () => setFiles(files.filter((_, j) => j !== i)) : undefined} />
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-stone-500">{phase === "uploading" ? t("uploading", { done: progress, total: files.length }) : t("privacyHint")}</p>
          <Button size="lg" onClick={start} disabled={!files.length} loading={phase !== "idle"} className="w-full sm:w-auto">
            {phase === "idle" && <ScanText size={18} />}
            {t("start")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function FileThumb({ file, done, onRemove }: { file: File; done: boolean; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/") || file.type === "image/heic") return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <li className="relative overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="flex aspect-[4/3] items-center justify-center bg-stone-100">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : file.type === "application/pdf" ? (
          <FileText size={28} className="text-stone-400" />
        ) : (
          <ImageIcon size={28} className="text-stone-400" />
        )}
      </div>
      <p className="truncate px-2 py-1 text-xs text-stone-600">{file.name}</p>
      {done && <CheckCircle2 size={18} className="absolute top-1.5 left-1.5 rounded-full bg-white text-emerald-600" />}
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-stone-600 shadow hover:text-red-600" aria-label="remove">
          <X size={14} />
        </button>
      )}
    </li>
  );
}

function ProcessingCard({ since, autoRefresh }: { since: string; autoRefresh?: boolean }) {
  const t = useTranslations("import");
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const i = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(i);
  }, [autoRefresh, router]);
  const secs = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const step = secs < 15 ? "step1" : secs < 45 ? "step2" : "step3";
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="relative">
          <Loader2 size={40} className="animate-spin text-brand-700" />
        </div>
        <p className="font-medium text-stone-900">{t("processingTitle")}</p>
        <p className="max-w-sm text-sm text-stone-600">{t(`processing.${step}`)}</p>
        <p className="text-xs tabular-nums text-stone-400">{t("elapsed", { seconds: secs })}</p>
      </CardBody>
    </Card>
  );
}

function failReason(code: string | null) {
  return code && ["aiFailed", "aiCreditsExhausted", "aiNotConfigured", "empty", "interrupted", "validation"].includes(code) ? code : "unexpected";
}

function FailedCard({ restaurantId, imp }: { restaurantId: string; imp: ImportDto }) {
  const t = useTranslations("import");
  const retry = useBusyAction(runImport);
  const discard = useBusyAction(discardMenuImport);
  return (
    <Card className="border-red-200">
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="font-medium text-stone-900">{t("failedTitle")}</p>
            <p className="text-sm text-stone-600">{t(`failReasons.${failReason(imp.error)}`)}</p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => discard.run({ restaurantId, importId: imp.id })} loading={discard.pending}>
            {t("discard")}
          </Button>
          <Button variant="secondary" onClick={() => retry.run({ restaurantId, importId: imp.id })} loading={retry.pending}>
            <RotateCcw size={16} /> {t("retry")}
          </Button>
        </div>
        {retry.pending && <p className="text-center text-xs text-stone-500">{t("processing.step2")}</p>}
      </CardBody>
    </Card>
  );
}

function PdfOnlyHint({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("import");
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <FileText size={20} className="mt-0.5 shrink-0 text-stone-500" />
        <div>
          <p className="text-sm font-medium text-stone-800">{t("pdfOnlyTitle")}</p>
          <p className="text-sm text-stone-500">{t("pdfOnlyHint")}</p>
        </div>
      </div>
      <Link href={`/dashboard/${restaurantId}/menu`} className={buttonClass("secondary", "sm", "shrink-0")}>
        {t("pdfOnlyCta")}
      </Link>
    </div>
  );
}

function AppliedBanner({ restaurantId, result, onClose }: { restaurantId: string; result: ApplyImportResult; onClose: () => void }) {
  const t = useTranslations("import");
  return (
    <Card className="border-emerald-200 bg-emerald-50/60">
      <CardBody className="space-y-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-medium text-stone-900">{t("appliedTitle")}</p>
            <p className="text-sm text-stone-700">{t("appliedSummary", { items: result.items, categories: result.categories })}</p>
            {result.reviewTasks > 0 && <p className="mt-1 text-sm text-amber-800">{t("appliedReview", { count: result.reviewTasks })}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/${restaurantId}/menu`} className={buttonClass("primary", "sm")}>
            {t("openMenu")}
          </Link>
          {result.reviewTasks > 0 && (
            <Link href={`/dashboard/${restaurantId}/review`} className={buttonClass("secondary", "sm")}>
              {t("openReview")}
            </Link>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ draft editor

type EditVariant = { name: string; priceText: string };
type EditItem = Omit<DraftItem, "priceCents" | "variants"> & { priceText: string; variants: EditVariant[] };
type EditCategory = { key: string; name: string; description: string | null; items: EditItem[] };
type EditMenu = { key: string; name: string; targetMenuId: string | null; categories: EditCategory[] };

let keySeq = 0;
const newKey = () => `n${Date.now().toString(36)}${++keySeq}`;

function DraftEditor({
  restaurantId,
  active,
  menus,
  limits,
  onApplied,
}: Props & { active: ImportDto; onApplied: (r: ApplyImportResult) => void }) {
  const t = useTranslations("import");
  const locale = useLocale();
  const decimal = locale === "en" ? "." : ",";
  const toText = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", decimal));

  const [state, setState] = useState<EditMenu[]>(() => {
    const emptyMenus = menus.filter((m) => m.itemCount === 0);
    return active.draft!.menus.map((m, idx) => {
      const same = menus.find((x) => x.name.trim().toLowerCase() === m.name.trim().toLowerCase());
      const target = same?.id ?? emptyMenus[idx]?.id ?? (menus.length + idx >= limits.menus ? (menus[0]?.id ?? null) : null);
      return {
        key: m.key,
        name: m.name,
        targetMenuId: target,
        categories: m.categories.map((c) => ({
          ...c,
          items: c.items.map((i) => ({ ...i, priceText: toText(i.priceCents), variants: i.variants.map((v) => ({ name: v.name, priceText: toText(v.priceCents) })) })),
        })),
      };
    });
  });
  const apply = useBusyAction(applyMenuImport, { onSuccess: onApplied });
  const discard = useBusyAction(discardMenuImport);

  const total = state.reduce((n, m) => n + m.categories.reduce((k, c) => k + c.items.length, 0), 0);
  const remaining = Math.max(0, limits.items - limits.itemsUsed);
  const overLimit = total > remaining;
  const hintCount = state.reduce((n, m) => n + m.categories.reduce((k, c) => k + c.items.filter((i) => i.marks.length || i.allergenHints.length || i.additiveHints.length).length, 0), 0);

  const invalid = useMemo(() => {
    const bad = new Set<string>();
    for (const m of state)
      for (const c of m.categories)
        for (const i of c.items) {
          if (!i.name.trim()) bad.add(i.key);
          if (i.priceText.trim() && parsePriceToCents(i.priceText) == null) bad.add(i.key);
          if (i.variants.some((v) => !v.name.trim() || parsePriceToCents(v.priceText) == null)) bad.add(i.key);
        }
    return bad;
  }, [state]);

  const update = (fn: (draft: EditMenu[]) => void) =>
    setState((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  async function doApply() {
    const payload: DraftMenu[] = state.map((m) => ({
      key: m.key,
      name: m.name,
      targetMenuId: m.targetMenuId,
      categories: m.categories
        .filter((c) => c.items.length)
        .map((c) => ({
          key: c.key,
          name: c.name,
          description: c.description,
          items: c.items.map((i) => ({
            key: i.key,
            name: i.name,
            description: i.description,
            priceCents: parsePriceToCents(i.priceText),
            variants: i.variants.map((v) => ({ name: v.name, priceCents: parsePriceToCents(v.priceText) ?? 0 })),
            marks: i.marks,
            allergenHints: i.allergenHints,
            additiveHints: i.additiveHints,
            tags: i.tags,
          })),
        })),
    }));
    await apply.run({ restaurantId, importId: active.id, menus: payload });
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-stone-100 bg-gradient-to-r from-brand-50 to-white px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
          <div>
            <p className="font-semibold text-stone-900">{t("reviewTitle")}</p>
            <p className="text-sm text-stone-600">{t("reviewHint")}</p>
          </div>
          <div className="flex shrink-0 -space-x-2">
            {active.files.slice(0, 5).map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="h-10 w-10 overflow-hidden rounded-lg border-2 border-white bg-stone-100 shadow-sm" title={t("openSource")}>
                {f.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FileText size={18} className="m-2.5 text-stone-400" />
                )}
              </a>
            ))}
          </div>
        </div>
        <CardBody className="space-y-2 text-sm">
          <p className="text-stone-700">{t("found", { items: total, categories: state.reduce((n, m) => n + m.categories.length, 0) })}</p>
          {active.draft?.notes && <p className="rounded-lg bg-stone-50 px-3 py-2 text-stone-600">{active.draft.notes}</p>}
          {hintCount > 0 && (
            <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" /> {t("allergenNotice", { count: hintCount })}
            </p>
          )}
          {overLimit && (
            <p className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {t("overLimit", { remaining, limit: limits.items })}
            </p>
          )}
        </CardBody>
      </Card>

      {state.map((m, mi) => (
        <Card key={m.key}>
          <div className="grid gap-3 border-b border-stone-100 px-4 py-4 sm:grid-cols-2 sm:px-5">
            <label className="space-y-1">
              <span className="text-xs font-medium text-stone-500">{t("targetLabel")}</span>
              <Select
                value={m.targetMenuId ?? ""}
                onChange={(e) => update((d) => void (d[mi].targetMenuId = e.target.value || null))}
              >
                <option value="">{t("targetNew")}</option>
                {menus.map((x) => (
                  <option key={x.id} value={x.id}>
                    {t("targetExisting", { name: x.name })}
                  </option>
                ))}
              </Select>
            </label>
            {m.targetMenuId === null && (
              <label className="space-y-1">
                <span className="text-xs font-medium text-stone-500">{t("newMenuName")}</span>
                <Input value={m.name} onChange={(e) => update((d) => void (d[mi].name = e.target.value))} maxLength={200} />
              </label>
            )}
          </div>
          <div className="divide-y divide-stone-100">
            {m.categories.map((c, ci) => (
              <section key={c.key} className="px-3 py-4 sm:px-5">
                <div className="mb-3 flex items-center gap-2">
                  <Input
                    value={c.name}
                    onChange={(e) => update((d) => void (d[mi].categories[ci].name = e.target.value))}
                    className="h-9 font-semibold"
                    aria-label={t("categoryName")}
                    maxLength={200}
                  />
                  <Badge>{c.items.length}</Badge>
                  <button
                    type="button"
                    onClick={() => update((d) => void d[mi].categories.splice(ci, 1))}
                    className="focus-ring rounded-md p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={t("removeCategory")}
                    title={t("removeCategory")}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <ul className="space-y-2">
                  {c.items.map((it, ii) => (
                    <ItemRow
                      key={it.key}
                      item={it}
                      invalid={invalid.has(it.key)}
                      onChange={(fn) => update((d) => fn(d[mi].categories[ci].items[ii]))}
                      onRemove={() => update((d) => void d[mi].categories[ci].items.splice(ii, 1))}
                    />
                  ))}
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    update((d) =>
                      void d[mi].categories[ci].items.push({
                        key: newKey(),
                        name: "",
                        description: null,
                        priceText: "",
                        variants: [],
                        marks: [],
                        allergenHints: [],
                        additiveHints: [],
                        tags: [],
                      }),
                    )
                  }
                >
                  <Plus size={14} /> {t("addItem")}
                </Button>
              </section>
            ))}
          </div>
        </Card>
      ))}

      <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-2 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={() => window.confirm(t("discardConfirm")) && discard.run({ restaurantId, importId: active.id })} loading={discard.pending}>
          {t("discard")}
        </Button>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
          {invalid.size > 0 && <span className="text-xs text-red-700">{t("fixInvalid", { count: invalid.size })}</span>}
          <Button size="lg" onClick={doApply} loading={apply.pending} disabled={!total || invalid.size > 0 || overLimit} className="w-full sm:w-auto">
            {t("apply", { count: total })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  invalid,
  onChange,
  onRemove,
}: {
  item: EditItem;
  invalid: boolean;
  onChange: (fn: (i: EditItem) => void) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("import");
  const locale = useLocale();
  const [showDesc, setShowDesc] = useState(!!item.description);
  const hintLabels = [
    ...item.allergenHints.map((c) => ALLERGENS.find((a) => a.code === c)).filter((x) => !!x).map((a) => catalogLabel(a, locale)),
    ...item.additiveHints.map((c) => ADDITIVES.find((a) => a.code === c)).filter((x) => !!x).map((a) => catalogLabel(a, locale)),
  ];
  return (
    <li className={cn("rounded-lg border bg-white p-2.5", invalid ? "border-red-300" : "border-stone-200")}>
      <div className="flex items-start gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-[1fr_6.5rem] gap-2">
          <Input
            value={item.name}
            onChange={(e) => onChange((i) => void (i.name = e.target.value))}
            placeholder={t("itemName")}
            aria-label={t("itemName")}
            aria-invalid={!item.name.trim()}
            className="h-9"
            maxLength={200}
          />
          <div className="relative">
            <Input
              value={item.priceText}
              onChange={(e) => onChange((i) => void (i.priceText = e.target.value))}
              placeholder={t("noPrice")}
              aria-label={t("price")}
              aria-invalid={!!item.priceText.trim() && parsePriceToCents(item.priceText) == null}
              inputMode="decimal"
              className="h-9 pr-6 text-right tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-stone-400">€</span>
          </div>
        </div>
        <button type="button" onClick={onRemove} className="focus-ring mt-0.5 rounded-md p-2 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label={t("removeItem")}>
          <Trash2 size={15} />
        </button>
      </div>
      {showDesc ? (
        <Textarea
          value={item.description ?? ""}
          onChange={(e) => onChange((i) => void (i.description = e.target.value || null))}
          placeholder={t("description")}
          rows={2}
          className="mt-2 min-h-0 text-sm"
          maxLength={1000}
        />
      ) : (
        <button type="button" onClick={() => setShowDesc(true)} className="mt-1 text-xs text-brand-700 hover:underline">
          + {t("description")}
        </button>
      )}
      {item.variants.length > 0 && (
        <div className="mt-2 space-y-1.5 border-l-2 border-stone-100 pl-3">
          {item.variants.map((v, vi) => (
            <div key={vi} className="flex items-center gap-2">
              <Input
                value={v.name}
                onChange={(e) => onChange((i) => void (i.variants[vi].name = e.target.value))}
                className="h-8 text-sm"
                aria-label={t("variantName")}
                maxLength={80}
              />
              <Input
                value={v.priceText}
                onChange={(e) => onChange((i) => void (i.variants[vi].priceText = e.target.value))}
                className="h-8 w-24 shrink-0 text-right text-sm tabular-nums"
                inputMode="decimal"
                aria-label={t("price")}
                aria-invalid={parsePriceToCents(v.priceText) == null}
              />
              <button type="button" onClick={() => onChange((i) => void i.variants.splice(vi, 1))} className="p-1 text-stone-400 hover:text-red-600" aria-label={t("removeVariant")}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" onClick={() => onChange((i) => void i.variants.push({ name: "", priceText: "" }))} className="text-xs text-brand-700 hover:underline">
          + {t("addVariant")}
        </button>
        {item.tags.map((tag) => (
          <Badge key={tag} tone="green">
            {tag}
          </Badge>
        ))}
        {(item.marks.length > 0 || hintLabels.length > 0) && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-800" title={t("hintsTooltip")}>
            <ShieldAlert size={13} />
            {item.marks.length > 0 && <span className="font-mono">{item.marks.join(", ")}</span>}
            {hintLabels.length > 0 && <span>→ {hintLabels.join(", ")}</span>}
          </span>
        )}
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ history

const STATUS_TONE = { processing: "blue", ready: "purple", applied: "green", failed: "red", discarded: "neutral" } as const;

function ImportHistory({ history }: { history: ImportDto[] }) {
  const t = useTranslations("import");
  const format = useFormatter();
  if (!history.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-stone-700">{t("historyTitle")}</h2>
      <Card className="divide-y divide-stone-100">
        {history.map((h) => (
          <div key={h.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex -space-x-2">
              {h.files.slice(0, 3).map((f) =>
                f.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f.id} src={f.thumb} alt="" className="h-9 w-9 rounded-md border-2 border-white object-cover" />
                ) : (
                  <span key={f.id} className="flex h-9 w-9 items-center justify-center rounded-md border-2 border-white bg-stone-100">
                    <FileText size={15} className="text-stone-400" />
                  </span>
                ),
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[h.status]}>{t(`status.${h.status}`)}</Badge>
                <span className="text-xs text-stone-500">{format.dateTime(new Date(h.createdAt), { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <p className="mt-0.5 text-sm text-stone-700">
                {t("historyLine", { files: h.files.length, items: h.itemCount })}
              </p>
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}

