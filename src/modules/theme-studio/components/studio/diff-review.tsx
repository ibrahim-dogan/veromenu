"use client";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Check, FileMinus2, FilePlus2, FileDiff, Sparkles, X } from "lucide-react";
import { cn } from "@/core/utils";
import { Badge, Button } from "@/components/ui";
import { MANIFEST_PATH } from "../../lib/package";
import type { ProposalEntry } from "../../lib/proposal";

const DiffView = dynamic(() => import("./diff-view"), { ssr: false, loading: () => <div className="h-40 animate-pulse bg-stone-50" /> });

/** Center pane while an AI proposal is pending: per-file diff with accept/reject. */
export function DiffReview({
  entries,
  summary,
  accepted,
  onToggle,
  onAcceptAll,
  onApply,
  onReject,
  applying,
}: {
  entries: ProposalEntry[];
  summary: string;
  accepted: Set<string>;
  onToggle: (path: string) => void;
  onAcceptAll: () => void;
  onApply: () => void;
  onReject: () => void;
  applying: boolean;
}) {
  const t = useTranslations("themeStudio.diff");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-violet-200 bg-violet-50 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-violet-900">
          <Sparkles size={15} aria-hidden /> {t("title")}
        </p>
        {summary && <p className="text-sm whitespace-pre-wrap text-violet-900/80">{summary}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onAcceptAll} loading={applying} disabled={!entries.length} className="bg-violet-600 hover:bg-violet-700">
            <Check size={14} aria-hidden /> {t("acceptAll")}
          </Button>
          <Button size="sm" variant="secondary" onClick={onApply} disabled={applying || accepted.size === 0}>
            {t("acceptSelected", { count: accepted.size })}
          </Button>
          <Button size="sm" variant="ghost" onClick={onReject} disabled={applying}>
            <X size={14} aria-hidden /> {t("reject")}
          </Button>
        </div>
        <p className="text-xs text-violet-900/70">{t("previewHint")}</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {entries.length === 0 && <p className="text-sm text-stone-500">{t("noChanges")}</p>}
        {entries.map((e) => {
          const on = accepted.has(e.path);
          const Icon = e.kind === "added" ? FilePlus2 : e.kind === "deleted" ? FileMinus2 : FileDiff;
          return (
            <section key={e.path} className={cn("overflow-hidden rounded-lg border", on ? "border-violet-300" : "border-stone-200 opacity-70")}>
              <header className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={on} onChange={() => onToggle(e.path)} className="h-4 w-4 accent-violet-600" />
                  <Icon size={14} className="shrink-0 text-stone-500" aria-hidden />
                  <span className="truncate font-mono text-xs">{e.path}</span>
                </label>
                <Badge tone={e.kind === "added" ? "green" : e.kind === "deleted" ? "red" : "blue"}>{t(e.kind)}</Badge>
              </header>
              {e.kind === "deleted" ? <p className="px-3 py-2 text-xs text-stone-500">{t("deletedHint")}</p> : <DiffView path={e.path === MANIFEST_PATH ? "manifest.json" : e.path} original={e.original} modified={e.modified} />}
            </section>
          );
        })}
      </div>
    </div>
  );
}
