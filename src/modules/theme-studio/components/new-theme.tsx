"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileUp, FilePlus2, LayoutTemplate, MessageSquareText, ScanLine, X } from "lucide-react";
import { cn } from "@/core/utils";
import { useRouter } from "@/core/i18n/navigation";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/components/use-action";
import { Dropzone } from "@/modules/media/components/dropzone";
import { Thumb } from "@/modules/media/components/media-picker";
import type { MediaItem } from "@/modules/media/components/media-client";
import { generateThemeFromFiles, generateThemeFromPrompt } from "@/modules/theme-ai/actions";
import { createBlankThemeAction, importThemeAction } from "../actions";
import { readFileText } from "../lib/client";
import { AiProgress } from "./ai-progress";
import { VoiceButton } from "./voice-button";

type Mode = "files" | "prompt" | "blank" | null;
const EXAMPLES = ["bistro", "sushi", "cafe", "steakhouse", "vegan", "biergarten"] as const;

export function NewTheme({ restaurantId, canUseAi, onTemplates }: { restaurantId: string; canUseAi: boolean; onTemplates: () => void }) {
  const t = useTranslations("themeStudio.new");
  const te = useTranslations("errors");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [generating, setGenerating] = useState<"files" | "prompt" | null>(null);
  const [importInput, setImportInput] = useState<HTMLInputElement | null>(null);
  const openStudio = (themeId: string) => router.push(`/dashboard/${restaurantId}/design/studio/${themeId}`);

  const imp = useAction(importThemeAction, { success: t("imported"), refresh: false, onSuccess: (d) => openStudio(d.themeId) });

  async function onImportFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 6_000_000) return toast.error(t("importTooLarge"));
    try {
      await imp.run({ restaurantId, json: await readFileText(file) });
    } catch {
      toast.error(te("unexpected"));
    }
  }

  const cards = [
    { key: "files", icon: ScanLine, ai: true, onClick: () => setMode("files") },
    { key: "prompt", icon: MessageSquareText, ai: true, onClick: () => setMode("prompt") },
    { key: "template", icon: LayoutTemplate, ai: false, onClick: onTemplates },
    { key: "blank", icon: FilePlus2, ai: false, onClick: () => setMode("blank") },
    { key: "import", icon: FileUp, ai: false, onClick: () => importInput?.click() },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const disabled = (c.ai && !canUseAi) || (c.key === "import" && imp.pending);
          return (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              disabled={disabled}
              className={cn(
                "focus-ring group flex flex-col items-start gap-3 rounded-2xl border p-5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
                c.ai ? "border-violet-200 bg-gradient-to-br from-violet-50 to-white hover:border-violet-400 hover:shadow-md" : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-md",
                c.key === "files" && "lg:col-span-1",
              )}
            >
              <span className={cn("grid h-11 w-11 place-items-center rounded-xl", c.ai ? "bg-violet-600 text-white" : "bg-brand-50 text-brand-700")}>
                <c.icon size={22} aria-hidden />
              </span>
              <span>
                <span className="flex items-center gap-2 font-semibold text-stone-900">
                  {t(`${c.key}Title`)}
                  {c.ai && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-violet-700 uppercase">{t("aiBadge")}</span>}
                </span>
                <span className="mt-1 block text-sm text-stone-500">{c.ai && !canUseAi ? t("aiNoPermission") : t(`${c.key}Hint`)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <input ref={setImportInput} type="file" accept=".json,.vmtheme.json,application/json" className="hidden" onChange={(e) => onImportFile(e.currentTarget)} />

      <FilesDialog
        open={mode === "files"}
        onClose={() => setMode(null)}
        restaurantId={restaurantId}
        onStart={() => setGenerating("files")}
        onDone={(id) => {
          setGenerating(null);
          if (id) openStudio(id);
        }}
      />
      <PromptDialog
        open={mode === "prompt"}
        onClose={() => setMode(null)}
        restaurantId={restaurantId}
        onStart={() => setGenerating("prompt")}
        onDone={(id) => {
          setGenerating(null);
          if (id) openStudio(id);
        }}
      />
      <BlankDialog open={mode === "blank"} onClose={() => setMode(null)} restaurantId={restaurantId} onCreated={openStudio} />
      <AiProgress open={!!generating} kind={generating ?? "prompt"} />
    </div>
  );
}

function UploadedList({ items, onRemove }: { items: MediaItem[]; onRemove: (id: string) => void }) {
  const t = useTranslations("themeStudio.new");
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((m) => (
        <li key={m.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-stone-200">
          <Thumb item={m} />
          <button type="button" onClick={() => onRemove(m.id)} className="focus-ring absolute top-1 right-1 rounded-full bg-white/90 p-0.5 text-stone-700 shadow" aria-label={t("removeFile")}>
            <X size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function FilesDialog({ open, onClose, restaurantId, onStart, onDone }: { open: boolean; onClose: () => void; restaurantId: string; onStart: () => void; onDone: (themeId: string | null) => void }) {
  const t = useTranslations("themeStudio.new");
  const te = useTranslations("errors");
  const [files, setFiles] = useState<MediaItem[]>([]);
  const [notes, setNotes] = useState("");
  const gen = useAction(generateThemeFromFiles, { success: t("generated"), refresh: false });

  async function start() {
    onClose();
    onStart();
    let res: Awaited<ReturnType<typeof gen.run>>;
    try {
      res = await gen.run({ restaurantId, mediaIds: files.map((f) => f.id), notes: notes.trim() || undefined });
    } catch {
      // network error / proxy timeout: the server action promise rejects – never leave the progress overlay up
      toast.error(te("unexpected"));
      return onDone(null);
    }
    onDone(res.ok ? res.data.themeId : null);
    if (res.ok) {
      setFiles([]);
      setNotes("");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={t("filesTitle")}
      description={t("filesDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={start} disabled={!files.length} className="bg-violet-600 hover:bg-violet-700">
            {t("generate")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Dropzone restaurantId={restaurantId} accept="any" multiple onUploaded={(m) => setFiles((l) => (l.length >= 6 ? l : [...l, m]))} />
        <UploadedList items={files} onRemove={(id) => setFiles((l) => l.filter((x) => x.id !== id))} />
        <p className="text-xs text-stone-500">{t("filesLimit", { count: 6 })}</p>
        <Field label={t("notesLabel")} hint={t("notesHint")} htmlFor="theme-ai-notes">
          <Textarea id="theme-ai-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} placeholder={t("notesPlaceholder")} />
        </Field>
      </div>
    </Dialog>
  );
}

function PromptDialog({ open, onClose, restaurantId, onStart, onDone }: { open: boolean; onClose: () => void; restaurantId: string; onStart: () => void; onDone: (themeId: string | null) => void }) {
  const t = useTranslations("themeStudio.new");
  const te = useTranslations("errors");
  const [prompt, setPrompt] = useState("");
  const [refs, setRefs] = useState<MediaItem[]>([]);
  const gen = useAction(generateThemeFromPrompt, { success: t("generated"), refresh: false });

  async function start() {
    onClose();
    onStart();
    let res: Awaited<ReturnType<typeof gen.run>>;
    try {
      res = await gen.run({ restaurantId, prompt: prompt.trim(), referenceMediaIds: refs.length ? refs.map((r) => r.id) : undefined });
    } catch {
      toast.error(te("unexpected"));
      return onDone(null);
    }
    onDone(res.ok ? res.data.themeId : null);
    if (res.ok) {
      setPrompt("");
      setRefs([]);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={t("promptTitle")}
      description={t("promptDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={start} disabled={prompt.trim().length < 3} className="bg-violet-600 hover:bg-violet-700">
            {t("generate")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("promptLabel")} htmlFor="theme-ai-prompt">
          <Textarea id="theme-ai-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} maxLength={4000} placeholder={t("promptPlaceholder")} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <VoiceButton restaurantId={restaurantId} onText={(text) => setPrompt((p) => (p ? `${p.trimEnd()} ${text}` : text))} />
          <span className="text-xs text-stone-500">{t("voiceHint")}</span>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-stone-600">{t("examples")}</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setPrompt(t(`example_${e}`))}
                className="focus-ring rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700 hover:border-violet-300 hover:bg-violet-50"
              >
                {t(`exampleLabel_${e}`)}
              </button>
            ))}
          </div>
        </div>
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

function BlankDialog({ open, onClose, restaurantId, onCreated }: { open: boolean; onClose: () => void; restaurantId: string; onCreated: (themeId: string) => void }) {
  const t = useTranslations("themeStudio.new");
  const [name, setName] = useState("");
  const create = useAction(createBlankThemeAction, { success: t("created"), refresh: false, onSuccess: (d) => onCreated(d.themeId) });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={t("blankTitle")}
      description={t("blankDescription")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button loading={create.pending} disabled={!name.trim()} onClick={() => create.run({ restaurantId, name: name.trim() })}>
            {t("create")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.run({ restaurantId, name: name.trim() });
        }}
      >
        <Field label={t("nameLabel")} htmlFor="theme-blank-name">
          <Input id="theme-blank-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("namePlaceholder")} autoFocus />
        </Field>
      </form>
    </Dialog>
  );
}
