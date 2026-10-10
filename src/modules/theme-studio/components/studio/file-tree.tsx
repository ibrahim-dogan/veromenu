"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Braces, FileCode2, FileJson, FilePlus2, Languages, Paintbrush, Pencil, Settings2, Trash2 } from "lucide-react";
import { cn } from "@/core/utils";
import { Button, Field, Input, Select } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { MANIFEST_PATH, MENU_TEMPLATE, NEW_FILE_KINDS, pathFor, sortPaths, type NewFileKind } from "../../lib/package";

const ALL_KINDS = Object.keys(NEW_FILE_KINDS) as NewFileKind[];

const icon = (p: string) =>
  p === MANIFEST_PATH ? Settings2 : p.endsWith(".liquid") ? FileCode2 : p.endsWith(".css") ? Paintbrush : p.endsWith(".js") ? Braces : p.startsWith("locales/") ? Languages : FileJson;

const GROUPS = [
  { key: "templates", test: (p: string) => p.startsWith("templates/") },
  { key: "assets", test: (p: string) => p.startsWith("assets/") },
  { key: "locales", test: (p: string) => p.startsWith("locales/") },
] as const;

export function FileTree({
  paths,
  active,
  dirtyPaths,
  errorCounts,
  onOpen,
  onAdd,
  onRename,
  onDelete,
  mainTemplate = MENU_TEMPLATE,
  fileKinds = ALL_KINDS,
}: {
  paths: string[];
  active: string;
  dirtyPaths: Set<string>;
  errorCounts: Record<string, number>;
  onOpen: (p: string) => void;
  onAdd: (p: string) => void;
  onRename: (from: string, to: string) => void;
  onDelete: (p: string) => void;
  /** required template of the package kind (templates/menu.liquid or templates/print.liquid) – not removable */
  mainTemplate?: string;
  /** file kinds offered when adding (print designs: no JavaScript) */
  fileKinds?: NewFileKind[];
}) {
  const t = useTranslations("themeStudio.files");
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "rename"; path: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const sorted = sortPaths(paths);

  const row = (p: string) => {
    const Icon = icon(p);
    const removable = p !== mainTemplate && p !== MANIFEST_PATH;
    const errs = errorCounts[p] ?? 0;
    return (
      <li key={p} className="group relative">
        <button
          type="button"
          onClick={() => onOpen(p)}
          className={cn(
            "focus-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]",
            active === p ? "bg-brand-50 font-medium text-brand-800" : "text-stone-700 hover:bg-stone-100",
          )}
          aria-current={active === p ? "true" : undefined}
        >
          <Icon size={14} className="shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{p === MANIFEST_PATH ? p : p.split("/").pop()}</span>
          {dirtyPaths.has(p) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title={t("unsaved")} aria-label={t("unsaved")} />}
          {errs > 0 && <span className="ml-auto rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">{errs}</span>}
        </button>
        {removable && (
          <span className="absolute top-1 right-1 hidden gap-0.5 bg-inherit group-focus-within:flex group-hover:flex">
            <button type="button" className="focus-ring rounded p-1 text-stone-500 hover:bg-white hover:text-stone-800" onClick={() => setDialog({ mode: "rename", path: p })} aria-label={t("rename")} title={t("rename")}>
              <Pencil size={12} />
            </button>
            <button type="button" className="focus-ring rounded p-1 text-stone-500 hover:bg-white hover:text-red-600" onClick={() => setConfirmDelete(p)} aria-label={t("delete")} title={t("delete")}>
              <Trash2 size={12} />
            </button>
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{t("title")}</p>
        <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: "add" })} aria-label={t("add")} title={t("add")}>
          <FilePlus2 size={14} aria-hidden /> {t("addShort")}
        </Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-2 pb-3">
        <ul>{row(MANIFEST_PATH)}</ul>
        {GROUPS.map((g) => {
          const list = sorted.filter(g.test);
          if (!list.length) return null;
          return (
            <div key={g.key}>
              <p className="px-2 pb-1 text-[11px] font-medium text-stone-400">{g.key}/</p>
              <ul>{list.map(row)}</ul>
            </div>
          );
        })}
      </div>

      <FileDialog
        state={dialog}
        existing={paths}
        kinds={fileKinds}
        onClose={() => setDialog(null)}
        onSubmit={(p) => {
          if (dialog?.mode === "rename") onRename(dialog.path, p);
          else onAdd(p);
          setDialog(null);
        }}
      />
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        size="sm"
        title={t("deleteTitle")}
        description={confirmDelete ?? ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirmDelete) onDelete(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              {t("delete")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-stone-600">{t("deleteHint")}</p>
      </Dialog>
    </div>
  );
}

function kindOf(path: string): NewFileKind {
  if (path.startsWith("templates/partials/")) return "partial";
  if (path.startsWith("locales/")) return "locale";
  if (path.endsWith(".js")) return "js";
  return "css";
}

function FileDialog({
  state,
  existing,
  kinds,
  onClose,
  onSubmit,
}: {
  state: { mode: "add" } | { mode: "rename"; path: string } | null;
  existing: string[];
  kinds: NewFileKind[];
  onClose: () => void;
  onSubmit: (path: string) => void;
}) {
  const t = useTranslations("themeStudio.files");
  const renaming = state?.mode === "rename" ? state.path : null;
  const [kind, setKind] = useState<NewFileKind>("partial");
  const [name, setName] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);
  // reset the form whenever the dialog opens for a different target
  const key = state ? (renaming ?? "add") : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (renaming) {
      setKind(kindOf(renaming));
      setName(renaming.split("/").pop()!.replace(/\.(liquid|css|js|json)$/, ""));
    } else {
      setName("");
    }
  }
  const effKind = renaming ? kindOf(renaming) : kind;
  const target = name.trim() ? pathFor(effKind, name) : null;
  const exists = !!target && target !== renaming && existing.includes(target);
  const error = name.trim() && !target ? t(effKind === "js" ? "invalidJs" : effKind === "locale" ? "invalidLocale" : "invalidName") : exists ? t("exists") : undefined;

  return (
    <Dialog
      open={!!state}
      onClose={onClose}
      size="sm"
      title={renaming ? t("renameTitle") : t("addTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={!target || exists || target === renaming} onClick={() => target && onSubmit(target)}>
            {renaming ? t("rename") : t("create")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (target && !exists && target !== renaming) onSubmit(target);
        }}
      >
        {!renaming && (
          <Field label={t("kind")} htmlFor="file-kind">
            <Select id="file-kind" value={kind} onChange={(e) => setKind(e.target.value as NewFileKind)}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {t(`kind_${k}`)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t("name")} hint={target ? t("willCreate", { path: target }) : t(`nameHint_${effKind}`)} error={error} htmlFor="file-name">
          <Input id="file-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} aria-invalid={!!error} placeholder={t(`namePlaceholder_${effKind}`)} />
        </Field>
      </form>
    </Dialog>
  );
}
