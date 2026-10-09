"use client";
import { useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { ChevronDown, History, Loader2, MessageCircleQuestion, Mic, Sparkles, Square, Undo2, Wand2 } from "lucide-react";
import { cn } from "@/core/utils";
import { Badge, Button, Card, CardBody, Textarea } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { useBusyAction } from "@/modules/ai/components/use-busy-action";
import { applyChanges, discardChanges, planChanges, transcribeVoice, undoChanges } from "../actions";
import type { ChangesetDto, ChangesetStatus, PlanResult } from "../types";
import { ChangesetWarnings, OpCard } from "./changeset-view";
import { useVoiceRecorder, type RecorderError } from "./use-voice-recorder";

const EXAMPLES = ["example1", "example2", "example3", "example4"] as const;

export function AssistantClient({ restaurantId, canApply, history }: { restaurantId: string; canApply: boolean; history: ChangesetDto[] }) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const [input, setInput] = useState("");
  const [inputKind, setInputKind] = useState<"text" | "voice">("text");
  const [result, setResult] = useState<PlanResult | null>(null);
  const [answer, setAnswer] = useState("");

  const transcribe = useBusyAction(transcribeVoice, { refresh: false });
  const plan = useBusyAction(planChanges, { refresh: true });

  const recorder = useVoiceRecorder({
    maxSeconds: 60,
    onWav: async (wav) => {
      const res = await transcribe.run({ restaurantId, wavBase64: wav, uiLocale: locale });
      if (res.ok) {
        if (!res.data.text.trim()) return toast.error(t("voiceEmpty"));
        setInput((prev) => (prev.trim() ? `${prev.trim()}\n${res.data.text}` : res.data.text));
        setInputKind("voice");
      }
    },
    onError: (e: RecorderError) => toast.error(t(`voiceErrors.${e}`)),
  });

  async function submit(text: string) {
    if (text.trim().length < 2) return;
    setResult(null);
    const res = await plan.run({ restaurantId, input: text.trim(), inputKind });
    if (res.ok) setResult(res.data);
  }

  async function sendAnswer() {
    if (result?.kind !== "clarify" || !answer.trim()) return;
    const combined = `${input.trim()}\n\n${t("clarifyPrefix")}\n${result.clarifications.map((q) => `- ${q}`).join("\n")}\n${t("clarifyAnswerPrefix")} ${answer.trim()}`;
    setInput(combined);
    setAnswer("");
    await submit(combined);
  }

  const busy = plan.pending || transcribe.pending || recorder.state === "processing";
  const drafts = history.filter((h) => h.status === "draft" && (result?.kind !== "changeset" || h.id !== result.changeset.id));

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-3">
          <label htmlFor="assistant-input" className="block text-sm font-medium text-stone-700">
            {t("inputLabel")}
          </label>
          <div className="relative">
            <Textarea
              id="assistant-input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (!e.target.value) setInputKind("text");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(input);
              }}
              placeholder={t("placeholder")}
              rows={4}
              maxLength={4000}
              className="min-h-28 pr-3 text-base sm:text-sm"
              disabled={plan.pending}
            />
          </div>
          {inputKind === "voice" && input && (
            <p className="flex items-center gap-1.5 text-xs text-stone-500">
              <Mic size={13} /> {t("transcriptHint")}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <VoiceControl
              state={recorder.state}
              transcribing={transcribe.pending}
              elapsed={recorder.elapsed}
              max={recorder.maxSeconds}
              onStart={recorder.start}
              onStop={recorder.stop}
              disabled={plan.pending}
            />
            <Button size="lg" onClick={() => submit(input)} loading={plan.pending} disabled={busy || input.trim().length < 2} className="w-full sm:w-auto">
              {!plan.pending && <Wand2 size={18} />}
              {t("plan")}
            </Button>
          </div>

          {!input && (
            <div className="pt-1">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-400">{t("examplesTitle")}</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setInput(t(k))}
                    className="focus-ring rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-left text-xs text-stone-700 hover:border-brand-300 hover:bg-brand-50"
                  >
                    {t(k)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {plan.pending && (
        <Card>
          <CardBody className="flex items-center gap-3 py-6 text-sm text-stone-600">
            <Loader2 size={18} className="animate-spin text-brand-700" />
            {t("planning")}
          </CardBody>
        </Card>
      )}

      {result?.kind === "clarify" && (
        <Card className="border-amber-200">
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2 font-medium text-stone-900">
              <MessageCircleQuestion size={18} className="text-amber-600" />
              {t("clarifyTitle")}
            </div>
            {result.summary && <p className="text-sm text-stone-600">{result.summary}</p>}
            <ul className="list-disc space-y-1 pl-5 text-sm text-stone-800">
              {result.clarifications.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t("clarifyPlaceholder")} rows={2} className="text-base sm:text-sm" />
            <div className="flex justify-end">
              <Button onClick={sendAnswer} loading={plan.pending} disabled={!answer.trim()}>
                {t("clarifySend")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {result?.kind === "empty" && (
        <Card>
          <CardBody className="space-y-1">
            <p className="font-medium text-stone-900">{t("emptyTitle")}</p>
            <p className="text-sm text-stone-600">{result.summary || t("emptyHint")}</p>
          </CardBody>
        </Card>
      )}

      {result?.kind === "changeset" && (
        <DraftReview
          key={result.changeset.id}
          restaurantId={restaurantId}
          changeset={result.changeset}
          clarifications={result.clarifications}
          canApply={canApply}
          onDone={() => {
            setResult(null);
            setInput("");
            setInputKind("text");
          }}
        />
      )}

      {drafts.length > 0 && result?.kind !== "changeset" && !plan.pending && (
        <div className="space-y-2">
          {drafts.slice(0, 1).map((d) => (
            <Card key={d.id} className="border-brand-200 bg-brand-50/40">
              <CardBody className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900">{t("openDraftTitle")}</p>
                  <p className="truncate text-sm text-stone-600">{d.input}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setResult({ kind: "changeset", changeset: d, clarifications: [] })}>
                  {t("openDraft")}
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <HistoryList restaurantId={restaurantId} history={history} canApply={canApply} />
    </div>
  );
}

function VoiceControl({
  state,
  transcribing,
  elapsed,
  max,
  onStart,
  onStop,
  disabled,
}: {
  state: "idle" | "recording" | "processing";
  transcribing: boolean;
  elapsed: number;
  max: number;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations("assistant");
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  if (state === "recording")
    return (
      <div className="flex items-center gap-3">
        <Button variant="danger" size="lg" onClick={onStop} className="flex-1 sm:flex-none">
          <Square size={16} fill="currentColor" /> {t("stop")}
        </Button>
        <span className="flex items-center gap-2 text-sm tabular-nums text-red-700" aria-live="polite">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          </span>
          {fmt(elapsed)} / {fmt(max)}
        </span>
      </div>
    );
  if (state === "processing" || transcribing)
    return (
      <span className="flex items-center gap-2 py-2 text-sm text-stone-600">
        <Loader2 size={16} className="animate-spin" /> {t("transcribing")}
      </span>
    );
  return (
    <Button variant="secondary" size="lg" onClick={onStart} disabled={disabled} className="w-full sm:w-auto">
      <Mic size={18} /> {t("record")}
    </Button>
  );
}

function DraftReview({
  restaurantId,
  changeset,
  clarifications,
  canApply,
  onDone,
}: {
  restaurantId: string;
  changeset: ChangesetDto;
  clarifications: string[];
  canApply: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("assistant");
  const ops = changeset.preview.ops;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(ops.map((o) => o.key)));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflict, setConflict] = useState<string[] | null>(null);
  const apply = useBusyAction(applyChanges);
  const discard = useBusyAction(discardChanges, { success: t("discarded"), onSuccess: onDone });

  const effective = useMemo(() => {
    // a new item in a new category needs that category op
    const out = new Set(selected);
    for (const o of ops) if (o.dependsOn && !selected.has(o.dependsOn)) out.delete(o.key);
    return out;
  }, [selected, ops]);
  const hasDestructive = ops.some((o) => o.destructive && effective.has(o.key));

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function doApply() {
    setConflict(null);
    const res = await apply.run({ restaurantId, changesetId: changeset.id, keys: [...effective], confirmDestructive: confirmDelete });
    if (!res.ok) return;
    if (res.data.status === "conflict") setConflict(res.data.names);
    else {
      toast.success(t("applied", { count: effective.size }));
      onDone();
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-stone-100 bg-gradient-to-r from-brand-50 to-white px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-800">
          <Sparkles size={16} /> {t("previewTitle")}
        </div>
        {changeset.summary && <p className="mt-1 text-sm text-stone-700">{changeset.summary}</p>}
        <p className="mt-1 text-xs text-stone-500">{t("previewHint")}</p>
      </div>
      <CardBody className="space-y-3 px-3 sm:px-5">
        {clarifications.length > 0 && (
          <ul className="list-disc rounded-lg border border-amber-200 bg-amber-50 py-2 pr-3 pl-7 text-sm text-amber-900">
            {clarifications.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        )}
        <ChangesetWarnings preview={changeset.preview} />
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span>{t("selectedCount", { selected: effective.size, total: ops.length })}</span>
          <span className="flex gap-3">
            <button type="button" className="hover:text-stone-800" onClick={() => setSelected(new Set(ops.map((o) => o.key)))}>
              {t("selectAll")}
            </button>
            <button type="button" className="hover:text-stone-800" onClick={() => setSelected(new Set())}>
              {t("selectNone")}
            </button>
          </span>
        </div>
        <div className="space-y-2">
          {ops.map((op) => (
            <OpCard
              key={op.key}
              op={op}
              selectable
              checked={effective.has(op.key)}
              disabled={!!op.dependsOn && !selected.has(op.dependsOn)}
              onToggle={() => toggle(op.key)}
            />
          ))}
        </div>
        {conflict && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {t("conflictApply", { names: conflict.join(", ") })}
          </div>
        )}
      </CardBody>
      <div className="space-y-3 border-t border-stone-100 bg-stone-50 px-4 py-3 sm:px-5">
        {hasDestructive && (
          <label className="flex cursor-pointer items-start gap-2 text-sm text-red-800">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-red-600" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
            {t("confirmDestructive")}
          </label>
        )}
        {!canApply && <p className="text-sm text-stone-600">{t("noApplyPermission")}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => discard.run({ restaurantId, changesetId: changeset.id })} loading={discard.pending}>
            {t("discard")}
          </Button>
          <Button
            size="lg"
            onClick={doApply}
            loading={apply.pending}
            disabled={!canApply || !effective.size || (hasDestructive && !confirmDelete)}
            className="w-full sm:w-auto"
          >
            {t("apply", { count: effective.size })}
          </Button>
        </div>
      </div>
    </Card>
  );
}

const STATUS_TONE: Record<ChangesetStatus, "neutral" | "green" | "yellow" | "red" | "blue" | "purple"> = {
  draft: "blue",
  applied: "green",
  discarded: "neutral",
  failed: "red",
  reverted: "yellow",
};

function HistoryList({ restaurantId, history, canApply }: { restaurantId: string; history: ChangesetDto[]; canApply: boolean }) {
  const t = useTranslations("assistant");
  const format = useFormatter();
  const [open, setOpen] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ id: string; names: string[] } | null>(null);
  const undo = useBusyAction(undoChanges);
  const [undoing, setUndoing] = useState<string | null>(null);

  async function doUndo(id: string) {
    if (!window.confirm(t("undoConfirm"))) return;
    setConflict(null);
    setUndoing(id);
    const res = await undo.run({ restaurantId, changesetId: id });
    setUndoing(null);
    if (!res.ok) return;
    if (res.data.status === "conflict") setConflict({ id, names: res.data.names });
    else toast.success(t("undone"));
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-700">
        <History size={16} /> {t("historyTitle")}
      </h2>
      {history.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-sm text-stone-500">{t("historyEmpty")}</p>
      ) : (
        <Card className="divide-y divide-stone-100">
          {history.map((h) => {
            const applied = new Set(h.preview.appliedKeys ?? []);
            const ops = h.status === "applied" || h.status === "reverted" ? h.preview.ops.filter((o) => applied.has(o.key)) : h.preview.ops;
            const isOpen = open === h.id;
            return (
              <div key={h.id} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : h.id)}
                    className="focus-ring flex min-w-0 flex-1 items-start gap-2 rounded text-left"
                    aria-expanded={isOpen}
                  >
                    <ChevronDown size={16} className={cn("mt-0.5 shrink-0 text-stone-400 transition-transform", isOpen && "rotate-180")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={STATUS_TONE[h.status]}>{t(`status.${h.status}`)}</Badge>
                        {h.inputKind === "voice" && <Mic size={13} className="text-stone-400" aria-label={t("voiceInput")} />}
                        <span className="text-xs text-stone-500">
                          {format.dateTime(new Date(h.createdAt), { dateStyle: "medium", timeStyle: "short" })} · {t("opCount", { count: ops.length })}
                        </span>
                      </span>
                      <span className="mt-1 line-clamp-2 block text-sm text-stone-800">{h.input}</span>
                    </span>
                  </button>
                  {h.status === "applied" && canApply && (
                    <Button variant="secondary" size="sm" onClick={() => doUndo(h.id)} loading={undoing === h.id} disabled={!!undoing}>
                      <Undo2 size={14} /> {t("undo")}
                    </Button>
                  )}
                </div>
                {conflict?.id === h.id && (
                  <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {t("conflictUndo", { names: conflict.names.join(", ") })}
                  </p>
                )}
                {isOpen && (
                  <div className="mt-3 space-y-2 pl-0 sm:pl-6">
                    {h.summary && <p className="text-sm text-stone-600">{h.summary}</p>}
                    {ops.map((op) => (
                      <OpCard key={op.key} op={op} selectable={false} muted={h.status === "reverted" || h.status === "discarded"} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}
