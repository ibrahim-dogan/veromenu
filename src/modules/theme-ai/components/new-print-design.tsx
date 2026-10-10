"use client";
/**
 * Entry point to create a QR print design (table cards, table tents, posters) – embedded by the tables page:
 * from a library template, with AI from a PDF/photo and/or a description (text or voice), blank, or import.
 * Calls onCreated(themeId) after every successful creation (the tables page refreshes its list) and offers
 * "Im Studio öffnen". AI generation (30–90 s) shows a progress overlay that can be sent to the background.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, FilePlus2, FileUp, LayoutTemplate, Loader2, MessageSquareText, ScanLine, Sparkles } from "lucide-react";
import { cn } from "@/core/utils";
import { useRouter } from "@/core/i18n/navigation";
import type { ActionResult } from "@/core/http/action";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { Dropzone } from "@/modules/media/components/dropzone";
import type { MediaItem } from "@/modules/media/components/media-client";
import { PRINT_FORMAT_SIZES, samplePrintViews } from "@/modules/theme-engine";
import type { PrintFormat, ThemePackage } from "@/modules/theme-engine/types";
import { adoptLibraryThemeAction, createBlankThemeAction, importThemeAction } from "@/modules/theme-studio/actions";
import { AiProgress, useElapsed, type AiProgressKind } from "@/modules/theme-studio/components/ai-progress";
import { UploadedList } from "@/modules/theme-studio/components/new-theme";
import { PrintCardPreview } from "@/modules/theme-studio/components/print-frame";
import { VoiceButton } from "@/modules/theme-studio/components/voice-button";
import { readFileText, studioGet } from "@/modules/theme-studio/lib/client";
import { localizedText } from "@/modules/theme-studio/lib/package";
import { generatePrintFromFiles, generatePrintFromPrompt } from "../actions";

type Mode = "templates" | "files" | "prompt" | "blank" | null;
type Template = { id: string | null; starterKey: string | null; name: string; description: string | null; pkg: ThemePackage };
type Created = { themeId: string; summary?: string };

/** Order in the pickers: the classic table card first, posters last. */
const FORMATS: PrintFormat[] = ["a6", "a6-landscape", "tent-a6", "a5", "a5-landscape", "a4", "a4-landscape"];
const EXAMPLES = ["elegant", "cafePoster", "tent", "minimal", "kids"] as const;

export function NewPrintDesign({ restaurantId, canUseAi, onCreated }: { restaurantId: string; canUseAi: boolean; onCreated?: (themeId: string) => void }) {
  const t = useTranslations("themeAi.print");
  const te = useTranslations("errors");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [job, setJob] = useState<{ kind: AiProgressKind; startedAt: number } | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [result, setResult] = useState<Created | null>(null);
  const [importing, setImporting] = useState(false);
  const [importInput, setImportInput] = useState<HTMLInputElement | null>(null);

  const openStudio = (themeId: string) => router.push(`/dashboard/${restaurantId}/design/studio/${themeId}`);
  const errorText = (r: { error: string; detail?: string }) => {
    if (r.error === "validation" && r.detail === "menuThemeNotPrintDesign") return t("importWrongKind");
    const msg = te.has(r.error) ? te(r.error) : te("unexpected");
    return r.detail && r.error === "validation" ? `${msg} (${r.detail.slice(0, 160)})` : msg;
  };
  const created = (c: Created) => {
    setResult(c);
    if (onCreated) onCreated(c.themeId);
    else router.refresh();
  };

  /** Runs an AI generation; the overlay can be dismissed – the request keeps running. Never throws. */
  async function runAi(kind: AiProgressKind, fn: () => Promise<ActionResult<{ themeId: string; summary: string }>>): Promise<boolean> {
    if (job) {
      toast(t("busy"));
      return false;
    }
    setMode(null);
    setJob({ kind, startedAt: Date.now() });
    setOverlay(true);
    try {
      const res = await fn();
      if (!res.ok) {
        toast.error(errorText(res));
        return false;
      }
      toast.success(t("generated"));
      created({ themeId: res.data.themeId, summary: res.data.summary });
      return true;
    } catch {
      // network error / proxy timeout / server restart: the action promise rejects – never leave the overlay up
      toast.error(te("unexpected"));
      return false;
    } finally {
      setJob(null);
      setOverlay(false);
    }
  }

  async function onImportFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 6_000_000) return toast.error(t("importTooLarge"));
    setImporting(true);
    try {
      const res = await importThemeAction({ restaurantId, json: await readFileText(file), kind: "print" });
      if (!res.ok) return toast.error(errorText(res));
      toast.success(t("imported"));
      created({ themeId: res.data.themeId });
    } catch {
      toast.error(te("unexpected"));
    } finally {
      setImporting(false);
    }
  }

  const cards = [
    { key: "templates", icon: LayoutTemplate, ai: false, onClick: () => setMode("templates") },
    { key: "files", icon: ScanLine, ai: true, onClick: () => setMode("files") },
    { key: "prompt", icon: MessageSquareText, ai: true, onClick: () => setMode("prompt") },
    { key: "blank", icon: FilePlus2, ai: false, onClick: () => setMode("blank") },
    { key: "import", icon: FileUp, ai: false, onClick: () => importInput?.click() },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => {
          const disabled = (c.ai && (!canUseAi || !!job)) || (c.key === "import" && importing);
          return (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              disabled={disabled}
              className={cn(
                "focus-ring group flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
                c.ai ? "border-violet-200 bg-gradient-to-br from-violet-50 to-white hover:border-violet-400 hover:shadow-md" : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-md",
              )}
            >
              <span className={cn("grid h-10 w-10 place-items-center rounded-xl", c.ai ? "bg-violet-600 text-white" : "bg-brand-50 text-brand-700")}>
                {c.key === "import" && importing ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <c.icon size={20} aria-hidden />}
              </span>
              <span>
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-stone-900">
                  {t(`${c.key}Title`)}
                  {c.ai && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-violet-700 uppercase">{t("aiBadge")}</span>}
                </span>
                <span className="mt-1 block text-xs text-stone-500">{c.ai && !canUseAi ? t("aiNoPermission") : t(`${c.key}Hint`)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <input ref={setImportInput} type="file" accept=".json,.vmtheme.json,application/json" className="hidden" onChange={(e) => onImportFile(e.currentTarget)} />

      <TemplatesDialog open={mode === "templates"} onClose={() => setMode(null)} restaurantId={restaurantId} onCreated={(id) => created({ themeId: id })} errorText={errorText} />
      <FilesDialog
        open={mode === "files"}
        onClose={() => setMode(null)}
        restaurantId={restaurantId}
        onStart={(input) => runAi("printFiles", () => generatePrintFromFiles({ restaurantId, ...input }))}
      />
      <PromptDialog
        open={mode === "prompt"}
        onClose={() => setMode(null)}
        restaurantId={restaurantId}
        onStart={(input) => runAi("printPrompt", () => generatePrintFromPrompt({ restaurantId, ...input }))}
      />
      <BlankDialog open={mode === "blank"} onClose={() => setMode(null)} restaurantId={restaurantId} onCreated={(id) => created({ themeId: id })} errorText={errorText} />

      <AiProgress open={!!job && overlay} kind={job?.kind ?? "printPrompt"} startedAt={job?.startedAt} onDismiss={() => setOverlay(false)} />
      {job && !overlay && <BackgroundPill startedAt={job.startedAt} onOpen={() => setOverlay(true)} />}

      <Dialog
        open={!!result}
        onClose={() => setResult(null)}
        size="sm"
        title={t("doneTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResult(null)}>
              {t("close")}
            </Button>
            <Button onClick={() => result && openStudio(result.themeId)}>{t("openStudio")}</Button>
          </>
        }
      >
        <div className="flex gap-3">
          <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
          <div className="space-y-2 text-sm text-stone-700">
            {result?.summary && <p>{result.summary}</p>}
            <p className="text-stone-500">{t("doneHint")}</p>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function BackgroundPill({ startedAt, onOpen }: { startedAt: number; onOpen: () => void }) {
  const t = useTranslations("themeAi.print");
  const seconds = useElapsed(startedAt);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring fixed right-4 bottom-4 z-[80] flex items-center gap-2 rounded-full bg-violet-700 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-violet-800"
      aria-live="polite"
    >
      <Sparkles size={16} className="animate-pulse" aria-hidden /> {t("runningPill", { seconds })}
    </button>
  );
}

// ------------------------------------------------------------------ format picker

/** Proportional paper icons; the format decides the card size the AI designs for. */
export function PrintFormatPicker({ value, onChange, idPrefix }: { value: PrintFormat; onChange: (f: PrintFormat) => void; idPrefix: string }) {
  const tf = useTranslations("themeStudio.formats");
  const t = useTranslations("themeAi.print");
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-stone-700">{t("formatLabel")}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
        {FORMATS.map((f) => {
          const size = PRINT_FORMAT_SIZES[f];
          // all formats on one scale (A4 long edge = 36 px) so the size difference is visible
          const k = 36 / 297;
          const tent = f === "tent-a6";
          return (
            <button
              key={f}
              id={`${idPrefix}-${f}`}
              type="button"
              role="radio"
              aria-checked={value === f}
              onClick={() => onChange(f)}
              className={cn(
                "focus-ring flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors",
                value === f ? "border-violet-500 bg-violet-50 ring-1 ring-violet-500" : "border-stone-200 bg-white hover:border-stone-300",
              )}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center">
                <span className="relative block rounded-[2px] border border-stone-400 bg-white shadow-sm" style={{ width: size.w * k, height: (tent ? size.h * 2 : size.h) * k }}>
                  {tent && <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-stone-400" />}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-stone-900">{tf(f)}</span>
                <span className="block text-[11px] text-stone-500 tabular-nums">
                  {size.w}×{size.h} mm
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// ------------------------------------------------------------------ dialogs

function TemplatesDialog({
  open,
  onClose,
  restaurantId,
  onCreated,
  errorText,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  onCreated: (themeId: string) => void;
  errorText: (r: { error: string; detail?: string }) => string;
}) {
  const t = useTranslations("themeAi.print");
  const tf = useTranslations("themeStudio.formats");
  const locale = useLocale();
  const [list, setList] = useState<Template[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // a table card ("Tisch 12") of the engine's sample restaurant – same data for every template
  const sample = useMemo(() => samplePrintViews().filter((v) => !v.table.is_generic)[1] ?? samplePrintViews()[0], []);

  useEffect(() => {
    if (!open || list) return;
    const ac = new AbortController();
    studioGet<Template[]>(`/api/restaurants/${restaurantId}/themes/print-templates`, ac.signal).then((res) => {
      if (ac.signal.aborted) return;
      if (res.ok) setList(res.data);
      else setFailed(true);
    });
    return () => ac.abort();
  }, [open, list, restaurantId, reload]);

  async function use(tpl: Template) {
    if (busy) return;
    setBusy(tpl.id ?? tpl.starterKey ?? tpl.name);
    try {
      const res = await adoptLibraryThemeAction({ restaurantId, libraryThemeId: tpl.id ?? undefined, starterKey: tpl.starterKey ?? undefined });
      if (!res.ok) return toast.error(errorText(res));
      toast.success(t("templateUsed", { name: tpl.name }));
      onClose();
      onCreated(res.data.themeId);
    } catch {
      toast.error(errorText({ error: "unexpected" }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="lg" title={t("templatesTitle")} description={t("templatesDescription")}>
      {failed ? (
        <div className="space-y-3 py-6 text-center text-sm text-stone-500">
          <p>{t("templatesFailed")}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setFailed(false);
              setList(null);
              setReload((n) => n + 1);
            }}
          >
            {t("retry")}
          </Button>
        </div>
      ) : !list ? (
        <div className="grid place-items-center py-12 text-stone-400">
          <Loader2 size={22} className="animate-spin" aria-label={t("loading")} />
        </div>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-500">{t("templatesEmpty")}</p>
      ) : (
        <ul className="grid max-h-[65vh] gap-4 overflow-y-auto p-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((tpl) => {
            const key = tpl.id ?? tpl.starterKey ?? tpl.name;
            const fmt = tpl.pkg.manifest.print?.format ?? "a6";
            return (
              <li key={key} className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white">
                <div className="bg-stone-100 p-3">
                  <PrintCardPreview pkg={tpl.pkg} view={sample} title={tpl.name} className="w-full shadow" />
                </div>
                <div className="flex flex-1 flex-col gap-2 border-t border-stone-100 p-3">
                  <div className="flex items-start gap-2">
                    <h3 className="mr-auto text-sm font-semibold text-stone-900">{tpl.name}</h3>
                    <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">{tf(fmt)}</span>
                  </div>
                  <p className="line-clamp-2 text-xs text-stone-500">{localizedText(tpl.pkg.manifest.description, locale) || tpl.description}</p>
                  <Button size="sm" className="mt-auto" loading={busy === key} disabled={!!busy && busy !== key} onClick={() => use(tpl)}>
                    {t("useTemplate")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

function FilesDialog({
  open,
  onClose,
  restaurantId,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  onStart: (input: { mediaIds: string[]; format: PrintFormat; notes?: string }) => Promise<boolean>;
}) {
  const t = useTranslations("themeAi.print");
  const [files, setFiles] = useState<MediaItem[]>([]);
  const [notes, setNotes] = useState("");
  const [format, setFormat] = useState<PrintFormat>("a6");

  async function start() {
    const ok = await onStart({ mediaIds: files.map((f) => f.id), format, notes: notes.trim() || undefined });
    if (ok) {
      setFiles([]);
      setNotes("");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={t("filesDialogTitle")}
      description={t("filesDialogDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={start} disabled={!files.length} className="bg-violet-600 hover:bg-violet-700">
            <Sparkles size={15} aria-hidden /> {t("generate")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Dropzone restaurantId={restaurantId} accept="any" multiple onUploaded={(m) => setFiles((l) => (l.length >= 6 ? l : [...l, m]))} />
        <UploadedList items={files} onRemove={(id) => setFiles((l) => l.filter((x) => x.id !== id))} />
        <p className="text-xs text-stone-500">{t("filesLimit", { count: 6 })}</p>
        <PrintFormatPicker value={format} onChange={setFormat} idPrefix="print-files-format" />
        <Field label={t("notesLabel")} hint={t("notesHint")} htmlFor="print-ai-notes">
          <Textarea id="print-ai-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} placeholder={t("notesPlaceholder")} />
        </Field>
      </div>
    </Dialog>
  );
}

function PromptDialog({
  open,
  onClose,
  restaurantId,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  onStart: (input: { prompt: string; format: PrintFormat; referenceMediaIds?: string[] }) => Promise<boolean>;
}) {
  const t = useTranslations("themeAi.print");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<PrintFormat>("a6");
  const [refs, setRefs] = useState<MediaItem[]>([]);
  const EXAMPLE_FORMAT: Record<(typeof EXAMPLES)[number], PrintFormat> = { elegant: "a6", cafePoster: "a4", tent: "tent-a6", minimal: "a6-landscape", kids: "a5" };

  async function start() {
    const ok = await onStart({ prompt: prompt.trim(), format, referenceMediaIds: refs.length ? refs.map((r) => r.id) : undefined });
    if (ok) {
      setPrompt("");
      setRefs([]);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={t("promptDialogTitle")}
      description={t("promptDialogDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={start} disabled={prompt.trim().length < 3} className="bg-violet-600 hover:bg-violet-700">
            <Sparkles size={15} aria-hidden /> {t("generate")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("promptLabel")} htmlFor="print-ai-prompt">
          <Textarea id="print-ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} maxLength={4000} placeholder={t("promptPlaceholder")} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <VoiceButton restaurantId={restaurantId} kind="print" onText={(text) => setPrompt((p) => (p ? `${p.trimEnd()} ${text}` : text))} />
          <span className="text-xs text-stone-500">{t("voiceHint")}</span>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-stone-600">{t("examples")}</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setPrompt(t(`example_${e}`));
                  setFormat(EXAMPLE_FORMAT[e]);
                }}
                className="focus-ring rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-left text-xs text-stone-700 hover:border-violet-300 hover:bg-violet-50"
              >
                {t(`example_${e}`)}
              </button>
            ))}
          </div>
        </div>
        <PrintFormatPicker value={format} onChange={setFormat} idPrefix="print-prompt-format" />
        <details className="rounded-lg border border-stone-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-stone-700">{t("referencesLabel")}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-stone-500">{t("referencesHint")}</p>
            <Dropzone restaurantId={restaurantId} accept="image" multiple compact onUploaded={(m) => setRefs((l) => (l.length >= 4 ? l : [...l, m]))} />
            <UploadedList items={refs} onRemove={(id) => setRefs((l) => l.filter((x) => x.id !== id))} />
          </div>
        </details>
      </div>
    </Dialog>
  );
}

function BlankDialog({
  open,
  onClose,
  restaurantId,
  onCreated,
  errorText,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  onCreated: (themeId: string) => void;
  errorText: (r: { error: string; detail?: string }) => string;
}) {
  const t = useTranslations("themeAi.print");
  const [name, setName] = useState("");
  const [format, setFormat] = useState<PrintFormat>("a6");
  const [pending, setPending] = useState(false);

  async function create() {
    const n = name.trim();
    if (!n || pending) return;
    setPending(true);
    try {
      const res = await createBlankThemeAction({ restaurantId, name: n, kind: "print", format });
      if (!res.ok) return toast.error(errorText(res));
      toast.success(t("created"));
      setName("");
      onClose();
      onCreated(res.data.themeId);
    } catch {
      toast.error(errorText({ error: "unexpected" }));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={t("blankDialogTitle")}
      description={t("blankDialogDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button loading={pending} disabled={!name.trim()} onClick={create}>
            {t("create")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Field label={t("nameLabel")} htmlFor="print-blank-name">
          <Input id="print-blank-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("namePlaceholder")} autoFocus />
        </Field>
        <PrintFormatPicker value={format} onChange={setFormat} idPrefix="print-blank-format" />
      </form>
    </Dialog>
  );
}
