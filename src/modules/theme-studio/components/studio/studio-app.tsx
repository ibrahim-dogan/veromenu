"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, Bot, ChevronDown, ChevronUp, Code2, Download, Eye, FolderTree, History, PanelLeft, Rocket, Save, SlidersHorizontal, XCircle } from "lucide-react";
import { cn } from "@/core/utils";
import { Link } from "@/core/i18n/navigation";
import { Badge, Button } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { serializePackage, validatePackage, type ThemeMediaRef } from "@/modules/theme-engine";
import type { ThemeManifest, ThemePackage, ThemeValidation, ThemeView } from "@/modules/theme-engine/types";
import { proposeThemeEdit } from "@/modules/theme-ai/actions";
import {
  getVersionAction,
  previewDataAction,
  publishThemeAction,
  renameThemeAction,
  resolveMediaAction,
  restoreVersionAction,
  saveThemeSettingsAction,
  saveVersionAction,
} from "../../actions";
import { downloadText, themeStatus } from "../../lib/client";
import { exportFileName, MANIFEST_PATH, MENU_TEMPLATE, mediaIdsFor, sanitizeSettings, settingsDefaults, starterContent, withSettingsAsDefaults } from "../../lib/package";
import { StatusBadges } from "../theme-cards";
import { AiChat, type ChatMessage } from "./ai-chat";
import { Customizer } from "./customizer";
import { DiffReview } from "./diff-review";
import { applyProposal, proposalEntries, type Proposal } from "../../lib/proposal";
import { FileTree } from "./file-tree";
import { PreviewPane } from "./preview-pane";
import { VersionsPanel, type VersionRow } from "./versions-panel";

const CodeEditor = dynamic(() => import("./code-editor"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-stone-50" /> });

export type Panel = "files" | "customize" | "ai" | "versions";
type MobileView = "panel" | "code" | "preview";
type Saved = { versionId: string; pkg: ThemePackage };
type Meta = { name: string; isActive: boolean; currentVersionId: string | null; publishedVersionId: string | null };
type Problem = { file?: string; line?: number; message: string; level: "error" | "warning" };

const pretty = (m: unknown) => JSON.stringify(m, null, 2);

function parseManifest(text: string): { ok: true; manifest: ThemeManifest } | { ok: false; message: string; line?: number } {
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, message: "manifest must be a JSON object" };
    return { ok: true, manifest: v as ThemeManifest };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pos = /position (\d+)/.exec(msg);
    const lineM = /line (\d+)/.exec(msg);
    const line = lineM ? Number(lineM[1]) : pos ? text.slice(0, Number(pos[1])).split("\n").length : undefined;
    return { ok: false, message: msg, line };
  }
}

export function StudioApp(props: {
  restaurantId: string;
  slug: string;
  themeId: string;
  meta: Meta;
  versionId: string;
  pkg: ThemePackage;
  initialSettings: Record<string, unknown>;
  initialPanel: Panel;
  locales: { code: string; label: string }[];
  defaultLocale: string;
  canUseAi: boolean;
}) {
  const { restaurantId, themeId } = props;
  const t = useTranslations("themeStudio.studio");
  const te = useTranslations("errors");

  // ---------------------------------------------------------------- working copy
  const [saved, setSaved] = useState<Saved>({ versionId: props.versionId, pkg: props.pkg });
  const [files, setFiles] = useState<Record<string, string>>(props.pkg.files);
  const [manifestText, setManifestText] = useState(() => pretty(props.pkg.manifest));
  const [activePath, setActivePath] = useState(MENU_TEMPLATE);
  const [jump, setJump] = useState<{ line: number; nonce: number } | null>(null);
  const [meta, setMeta] = useState<Meta>(props.meta);
  const [panel, setPanel] = useState<Panel>(props.initialPanel);
  const [mobileView, setMobileView] = useState<MobileView>("panel");

  const parsed = useMemo(() => parseManifest(manifestText), [manifestText]);
  // while the manifest JSON is broken, keep previewing/customizing with the last valid one
  const [lastGood, setLastGood] = useState<ThemeManifest>(props.pkg.manifest);
  if (parsed.ok && parsed.manifest !== lastGood) setLastGood(parsed.manifest);
  const manifest = parsed.ok ? parsed.manifest : lastGood;
  const workingPkg = useMemo<ThemePackage>(() => ({ manifest, files }), [manifest, files]);

  const savedManifestText = useMemo(() => pretty(saved.pkg.manifest), [saved.pkg.manifest]);
  const dirtyPaths = useMemo(() => {
    const s = new Set<string>();
    if (manifestText.trim() !== savedManifestText.trim()) s.add(MANIFEST_PATH);
    for (const p of new Set([...Object.keys(files), ...Object.keys(saved.pkg.files)])) if (files[p] !== saved.pkg.files[p]) s.add(p);
    return s;
  }, [files, manifestText, saved.pkg.files, savedManifestText]);
  const dirty = dirtyPaths.size > 0;

  // ---------------------------------------------------------------- validation
  const [validation, setValidation] = useState<ThemeValidation | null>(null);
  const [renderErrors, setRenderErrors] = useState<string[]>([]);
  const [showProblems, setShowProblems] = useState(false);
  useEffect(() => {
    const h = setTimeout(() => {
      try {
        setValidation(validatePackage(workingPkg));
      } catch (e) {
        setValidation({ ok: false, errors: [{ message: e instanceof Error ? e.message : String(e) }], warnings: [] });
      }
    }, 400);
    return () => clearTimeout(h);
  }, [workingPkg]);

  const problems = useMemo<Problem[]>(() => {
    const out: Problem[] = [];
    if (!parsed.ok) out.push({ file: MANIFEST_PATH, line: parsed.line, message: parsed.message, level: "error" });
    for (const e of validation?.errors ?? []) out.push({ file: e.file ?? (/manifest/i.test(e.message) ? MANIFEST_PATH : undefined), line: e.line, message: e.message, level: "error" });
    for (const w of validation?.warnings ?? []) out.push({ file: w.file, message: w.message, level: "warning" });
    for (const r of renderErrors) out.push({ message: r, level: "warning" });
    return out;
  }, [parsed, validation, renderErrors]);
  const errorCount = problems.filter((p) => p.level === "error").length;
  const errorCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of problems) if (p.level === "error" && p.file) c[p.file] = (c[p.file] ?? 0) + 1;
    return c;
  }, [problems]);
  const errorLines = useMemo(() => problems.filter((p) => p.level === "error" && p.file === activePath && p.line).map((p) => p.line!), [problems, activePath]);

  const openAt = (file: string | undefined, line?: number) => {
    if (file && (file === MANIFEST_PATH || files[file] !== undefined)) setActivePath(file);
    if (line) setJump({ line, nonce: Date.now() });
    setMobileView("code");
  };

  // ---------------------------------------------------------------- helpers
  const fail = useCallback(
    (r: { error: string; detail?: string }) => {
      const msg = te.has(r.error) ? te(r.error) : te("unexpected");
      toast.error(r.detail && (r.error === "validation" || r.error === "unexpected") ? `${msg} (${r.detail.slice(0, 200)})` : msg);
    },
    [te],
  );

  // ---------------------------------------------------------------- save
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [versionsKey, setVersionsKey] = useState(props.versionId);

  const save = useCallback(
    async (opts: { silent?: boolean } = {}): Promise<Saved | null> => {
      if (!parsed.ok) {
        toast.error(t("manifestInvalid"));
        openAt(MANIFEST_PATH, parsed.line);
        return null;
      }
      if (!dirty) return saved;
      if (savingRef.current) return null;
      savingRef.current = true;
      setSaving(true);
      const pkg = workingPkg;
      try {
        const res = await saveVersionAction({ restaurantId, themeId, pkg: pkg as unknown as { manifest: Record<string, unknown>; files: Record<string, string> }, author: "user" });
        if (!res.ok) {
          fail(res);
          return null;
        }
        if (!res.data.saved) {
          setValidation(res.data.validation);
          setShowProblems(true);
          toast.error(t("saveInvalid"));
          return null;
        }
        const next = { versionId: res.data.versionId, pkg };
        setSaved(next);
        setMeta((m) => ({ ...m, currentVersionId: res.data.versionId! }));
        setVersionsKey(res.data.versionId);
        if (!opts.silent) toast.success(t("savedVersion", { number: res.data.number }));
        return next;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, dirty, saved, workingPkg, restaurantId, themeId, fail, t],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ---------------------------------------------------------------- file ops
  const setContent = (v: string) => {
    if (activePath === MANIFEST_PATH) setManifestText(v);
    else setFiles((f) => ({ ...f, [activePath]: v }));
  };
  const addFile = (p: string) => {
    setFiles((f) => ({ ...f, [p]: f[p] ?? starterContent(p) }));
    setActivePath(p);
    setMobileView("code");
  };
  const renameFile = (from: string, to: string) => {
    setFiles((f) => {
      const { [from]: content, ...rest } = f;
      return { ...rest, [to]: content ?? "" };
    });
    if (activePath === from) setActivePath(to);
    if (from.startsWith("templates/partials/")) toast(t("renameHint"));
  };
  const deleteFile = (p: string) => {
    setFiles((f) => {
      const { [p]: _gone, ...rest } = f;
      void _gone;
      return rest;
    });
    if (activePath === p) setActivePath(MENU_TEMPLATE);
  };

  // ---------------------------------------------------------------- customizer
  const [settings, setSettings] = useState<Record<string, unknown>>(() => sanitizeSettings(props.pkg.manifest, props.initialSettings));
  const [guestSettings, setGuestSettings] = useState<Record<string, unknown>>(() => sanitizeSettings(props.pkg.manifest, props.initialSettings));
  const effectiveSettings = useMemo(() => sanitizeSettings(manifest, settings), [manifest, settings]);
  const settingsDirty = JSON.stringify(effectiveSettings) !== JSON.stringify(sanitizeSettings(manifest, guestSettings));
  const [savingSettings, setSavingSettings] = useState(false);

  async function saveSettingsForGuests() {
    setSavingSettings(true);
    const res = await saveThemeSettingsAction({ restaurantId, themeId, values: effectiveSettings });
    setSavingSettings(false);
    if (!res.ok) return fail(res);
    setGuestSettings(res.data.settings);
    toast.success(t("settingsSaved"));
  }

  // ---------------------------------------------------------------- preview data
  const [locale, setLocale] = useState(props.defaultLocale);
  const [source, setSource] = useState<"real" | "sample">("real");
  const [data, setData] = useState<{ view: ThemeView; guestMessages: Record<string, string> } | null>(null);
  const dataCache = useRef(new Map<string, { view: ThemeView; guestMessages: Record<string, string> }>());
  useEffect(() => {
    const key = `${source}:${locale}`;
    const hit = dataCache.current.get(key);
    if (hit) return setData(hit);
    let alive = true;
    previewDataAction({ restaurantId, locale, source }).then((res) => {
      if (!alive) return;
      if (!res.ok) return fail(res);
      const d = { view: res.data.view as ThemeView, guestMessages: res.data.guestMessages };
      dataCache.current.set(key, d);
      setData(d);
      if (source === "real" && res.data.source === "sample") toast(t("realUnavailable"));
    });
    return () => {
      alive = false;
    };
  }, [restaurantId, locale, source, fail, t]);

  const [media, setMedia] = useState<Record<string, ThemeMediaRef>>({});
  const mediaKey = mediaIdsFor(manifest, effectiveSettings).join(",");
  useEffect(() => {
    const ids = mediaKey ? mediaKey.split(",") : [];
    const missing = ids.filter((i) => !media[i]);
    if (!missing.length) return;
    resolveMediaAction({ restaurantId, ids: missing }).then((res) => res.ok && setMedia((m) => ({ ...m, ...res.data })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey, restaurantId]);

  // ---------------------------------------------------------------- AI
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [proposal, setProposal] = useState<{ p: Proposal; base: ThemePackage } | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const say = (role: ChatMessage["role"], text: string) => setChat((c) => [...c, { id: Date.now() + Math.random(), role, text }]);
  const entries = useMemo(() => (proposal ? proposalEntries(proposal.base, proposal.p) : []), [proposal]);

  async function sendAi(text: string) {
    say("user", text);
    const base = await save({ silent: true });
    if (!base) return say("system", t("aiNeedsValid"));
    setAiBusy(true);
    const res = await proposeThemeEdit({ restaurantId, themeId, versionId: base.versionId, instruction: text });
    setAiBusy(false);
    if (!res.ok) {
      fail(res);
      return say("system", t("aiFailed"));
    }
    const p: Proposal = { baseVersionId: base.versionId, summary: res.data.summary, changedFiles: res.data.changedFiles ?? {}, deletedFiles: res.data.deletedFiles ?? [], manifest: res.data.manifest as ThemeManifest | undefined };
    const list = proposalEntries(base.pkg, p);
    say("ai", res.data.summary || t("aiDone"));
    if (!list.length) return say("system", t("aiNoChanges"));
    setProposal({ p, base: base.pkg });
    setAccepted(new Set(list.map((e) => e.path)));
    setMobileView("code");
  }

  async function applyAi(all: boolean) {
    if (!proposal) return;
    const acc = all ? new Set(entries.map((e) => e.path)) : accepted;
    const pkg = applyProposal(proposal.base, proposal.p, acc);
    setApplying(true);
    const res = await saveVersionAction({
      restaurantId,
      themeId,
      pkg: pkg as unknown as { manifest: Record<string, unknown>; files: Record<string, string> },
      note: (proposal.p.summary || t("aiNote")).slice(0, 300),
      author: "ai",
    });
    setApplying(false);
    if (!res.ok) return fail(res);
    if (!res.data.saved) {
      setValidation(res.data.validation);
      setShowProblems(true);
      return toast.error(t("aiInvalid"));
    }
    setFiles(pkg.files);
    setManifestText(pretty(pkg.manifest));
    setSaved({ versionId: res.data.versionId, pkg });
    setMeta((m) => ({ ...m, currentVersionId: res.data.versionId! }));
    setVersionsKey(res.data.versionId);
    setProposal(null);
    say("system", t("aiApplied", { number: res.data.number }));
    toast.success(t("aiApplied", { number: res.data.number }));
  }

  // ---------------------------------------------------------------- versions
  const [versionPreview, setVersionPreview] = useState<{ id: string; number: number; pkg: ThemePackage } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function previewVersion(v: VersionRow) {
    if (versionPreview?.id === v.id) return setVersionPreview(null);
    const res = await getVersionAction({ restaurantId, themeId, versionId: v.id });
    if (!res.ok) return fail(res);
    setVersionPreview({ id: v.id, number: v.number, pkg: res.data.pkg });
    setMobileView("preview");
  }

  async function restoreVersion(v: VersionRow) {
    if (dirty && !window.confirm(t("restoreDiscard"))) return;
    setRestoring(v.id);
    const res = await restoreVersionAction({ restaurantId, themeId, versionId: v.id, note: t("restoredNote", { number: v.number }) });
    setRestoring(null);
    if (!res.ok) return fail(res);
    setFiles(res.data.pkg.files);
    setManifestText(pretty(res.data.pkg.manifest));
    setSaved({ versionId: res.data.versionId, pkg: res.data.pkg });
    setMeta((m) => ({ ...m, currentVersionId: res.data.versionId }));
    setVersionsKey(res.data.versionId);
    setVersionPreview(null);
    if (!res.data.pkg.files[activePath] && activePath !== MANIFEST_PATH) setActivePath(MENU_TEMPLATE);
    toast.success(t("restored", { number: v.number, newNumber: res.data.number }));
  }

  // ---------------------------------------------------------------- publish / export / rename
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  async function publish() {
    setPublishing(true);
    try {
      const base = await save({ silent: true });
      if (!base) return;
      const res = await publishThemeAction({ restaurantId, themeId, versionId: base.versionId, settings: effectiveSettings });
      if (!res.ok) return fail(res);
      setMeta((m) => ({ ...m, isActive: true, publishedVersionId: res.data.versionId, currentVersionId: base.versionId }));
      setGuestSettings(res.data.settings);
      setPublishOpen(false);
      toast.success(t("published"));
    } finally {
      setPublishing(false);
    }
  }

  function exportTheme() {
    if (!parsed.ok) return toast.error(t("manifestInvalid"));
    downloadText(exportFileName(meta.name), serializePackage(workingPkg));
  }

  const [editingName, setEditingName] = useState(false);
  async function rename(name: string) {
    setEditingName(false);
    const v = name.trim();
    if (!v || v === meta.name) return;
    const res = await renameThemeAction({ restaurantId, themeId, name: v });
    if (!res.ok) return fail(res);
    setMeta((m) => ({ ...m, name: res.data.name }));
  }

  // ---------------------------------------------------------------- preview package
  const previewPkg = useMemo(() => {
    if (versionPreview) return versionPreview.pkg;
    if (proposal) return applyProposal(proposal.base, proposal.p, accepted);
    return workingPkg;
  }, [versionPreview, proposal, accepted, workingPkg]);
  const previewSettings = useMemo(() => sanitizeSettings(previewPkg.manifest, settings), [previewPkg.manifest, settings]);

  const content = activePath === MANIFEST_PATH ? manifestText : (files[activePath] ?? "");
  const panels: { key: Panel; icon: typeof FolderTree; label: string }[] = [
    { key: "files", icon: FolderTree, label: t("panelFiles") },
    { key: "customize", icon: SlidersHorizontal, label: t("panelCustomize") },
    { key: "ai", icon: Bot, label: t("panelAi") },
    { key: "versions", icon: History, label: t("panelVersions") },
  ];
  const hub = `/dashboard/${restaurantId}/design`;
  const statusMeta = { ...meta, currentVersionId: dirty ? "__dirty__" : meta.currentVersionId };

  return (
    <div className="fixed inset-x-0 top-14 bottom-0 z-20 flex flex-col bg-white lg:left-[260px]">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2">
        <Link
          href={hub}
          className="focus-ring rounded-md p-1.5 text-stone-500 hover:bg-stone-100"
          aria-label={t("back")}
          title={t("back")}
          onClick={(e) => {
            if (dirty && !window.confirm(t("leaveConfirm"))) e.preventDefault();
          }}
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {editingName ? (
            <input
              autoFocus
              defaultValue={meta.name}
              maxLength={80}
              onBlur={(e) => rename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="focus-ring h-8 min-w-0 rounded-md border border-stone-300 px-2 text-sm font-semibold"
              aria-label={t("rename")}
            />
          ) : (
            <button type="button" onClick={() => setEditingName(true)} className="focus-ring truncate rounded-md px-1 text-sm font-semibold text-stone-900 hover:bg-stone-100" title={t("rename")}>
              {meta.name}
            </button>
          )}
          <span className="hidden flex-wrap gap-1 sm:flex">
            <StatusBadges theme={statusMeta} />
            {dirty && <Badge tone="yellow">{t("unsaved")}</Badge>}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={exportTheme} title={t("export")} aria-label={t("export")}>
            <Download size={15} aria-hidden /> <span className="hidden md:inline">{t("export")}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => save()} loading={saving} disabled={!dirty} title={t("saveShortcut")}>
            {!saving && <Save size={15} aria-hidden />} <span className="hidden sm:inline">{t("save")}</span>
          </Button>
          <Button size="sm" onClick={() => setPublishOpen(true)} disabled={errorCount > 0 || publishing}>
            <Rocket size={15} aria-hidden /> <span className="hidden sm:inline">{meta.isActive ? t("publishUpdate") : t("publish")}</span>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* activity bar (desktop) */}
        <nav className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-stone-200 bg-stone-50 py-2 lg:flex" aria-label={t("panels")}>
          {panels.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPanel(p.key)}
              aria-pressed={panel === p.key}
              title={p.label}
              aria-label={p.label}
              className={cn("focus-ring relative grid h-10 w-10 place-items-center rounded-lg", panel === p.key ? "bg-white text-brand-700 shadow-sm" : "text-stone-500 hover:bg-white hover:text-stone-800")}
            >
              <p.icon size={18} />
              {p.key === "files" && errorCount > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />}
              {p.key === "ai" && proposal && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-violet-500" />}
            </button>
          ))}
        </nav>

        {/* side panel */}
        <aside className={cn("min-h-0 w-full shrink-0 flex-col border-r border-stone-200 bg-white lg:flex lg:w-72", mobileView === "panel" ? "flex" : "hidden")}>
          <div className="flex gap-1 overflow-x-auto border-b border-stone-200 p-1.5 lg:hidden">
            {panels.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPanel(p.key)}
                aria-pressed={panel === p.key}
                className={cn("focus-ring flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap", panel === p.key ? "bg-brand-50 text-brand-800" : "text-stone-600")}
              >
                <p.icon size={14} aria-hidden /> {p.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {panel === "files" && (
              <FileTree
                paths={Object.keys(files)}
                active={activePath}
                dirtyPaths={dirtyPaths}
                errorCounts={errorCounts}
                onOpen={(p) => {
                  setActivePath(p);
                  setMobileView("code");
                }}
                onAdd={addFile}
                onRename={renameFile}
                onDelete={deleteFile}
              />
            )}
            {panel === "customize" && (
              <Customizer
                restaurantId={restaurantId}
                manifest={manifest}
                values={effectiveSettings}
                onChange={(id, v) => setSettings((s) => ({ ...s, [id]: v }))}
                isActive={meta.isActive}
                dirty={settingsDirty}
                saving={savingSettings}
                onSaveForGuests={saveSettingsForGuests}
                onReset={() => setSettings(settingsDefaults(manifest))}
                onSaveAsDefaults={() => {
                  if (!parsed.ok) return toast.error(t("manifestInvalid"));
                  setManifestText(pretty(withSettingsAsDefaults(parsed.manifest, effectiveSettings)));
                  toast(t("defaultsApplied"));
                }}
                onEditFields={() => openAt(MANIFEST_PATH)}
              />
            )}
            {panel === "ai" && (
              <AiChat
                restaurantId={restaurantId}
                messages={chat}
                busy={aiBusy}
                disabled={!props.canUseAi || !!proposal}
                disabledHint={!props.canUseAi ? t("aiNoPermission") : proposal ? t("aiReviewPending") : dirty ? t("aiWillSave") : undefined}
                onSend={sendAi}
              />
            )}
            {panel === "versions" && (
              <VersionsPanel
                restaurantId={restaurantId}
                themeId={themeId}
                currentVersionId={meta.currentVersionId}
                publishedVersionId={meta.publishedVersionId}
                previewingId={versionPreview?.id ?? null}
                refreshKey={versionsKey}
                onPreview={previewVersion}
                onRestore={restoreVersion}
                busyId={restoring}
              />
            )}
          </div>
        </aside>

        {/* center: editor or AI diff */}
        <section className={cn("min-h-0 min-w-0 flex-1 flex-col", mobileView === "code" ? "flex" : "hidden lg:flex")}>
          {proposal ? (
            <DiffReview
              entries={entries}
              summary={proposal.p.summary}
              accepted={accepted}
              onToggle={(p) =>
                setAccepted((s) => {
                  const n = new Set(s);
                  if (n.has(p)) n.delete(p);
                  else n.add(p);
                  return n;
                })
              }
              onAcceptAll={() => applyAi(true)}
              onApply={() => applyAi(false)}
              onReject={() => {
                setProposal(null);
                say("system", t("aiRejected"));
              }}
              applying={applying}
            />
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-1.5">
                <Code2 size={14} className="text-stone-400" aria-hidden />
                <span className="truncate font-mono text-xs text-stone-700">{activePath}</span>
                {dirtyPaths.has(activePath) && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label={t("unsaved")} />}
                <span className="ml-auto hidden text-[11px] text-stone-400 md:inline">{t("saveShortcut")}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <CodeEditor key={activePath} path={activePath} value={content} onChange={setContent} jump={jump} errorLines={errorLines} ariaLabel={t("editorLabel", { path: activePath })} />
              </div>
            </>
          )}
          <ProblemsBar problems={problems} open={showProblems} onToggle={() => setShowProblems((v) => !v)} onPick={(p) => openAt(p.file, p.line)} />
        </section>

        {/* preview */}
        <section className={cn("min-h-0 w-full flex-col border-l border-stone-200 lg:flex lg:w-[42%] lg:max-w-[720px] lg:min-w-[340px]", mobileView === "preview" ? "flex" : "hidden")}>
          <PreviewPane
            pkg={data ? previewPkg : null}
            view={data?.view ?? null}
            guestMessages={data?.guestMessages ?? {}}
            media={media}
            settings={previewSettings}
            locale={locale}
            locales={props.locales}
            onLocale={setLocale}
            source={source}
            onSource={setSource}
            onRenderErrors={setRenderErrors}
            banner={
              versionPreview ? (
                <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                  <Eye size={13} aria-hidden /> {t("previewingVersion", { number: versionPreview.number })}
                  <button type="button" className="ml-auto font-medium underline" onClick={() => setVersionPreview(null)}>
                    {t("backToWorking")}
                  </button>
                </div>
              ) : proposal ? (
                <div className="flex items-center gap-2 border-b border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-900">
                  <Bot size={13} aria-hidden /> {t("previewingProposal")}
                </div>
              ) : null
            }
          />
        </section>
      </div>

      {/* mobile view switcher */}
      <nav className="grid grid-cols-3 border-t border-stone-200 bg-white lg:hidden" aria-label={t("views")}>
        {(
          [
            ["panel", PanelLeft, t("viewPanel")],
            ["code", Code2, t("viewCode")],
            ["preview", Eye, t("viewPreview")],
          ] as const
        ).map(([v, Icon, label]) => (
          <button key={v} type="button" onClick={() => setMobileView(v)} aria-pressed={mobileView === v} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", mobileView === v ? "text-brand-700" : "text-stone-500")}>
            <Icon size={18} aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      <Dialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        size="sm"
        title={t("publishTitle")}
        description={t("publishDescription")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPublishOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={publish} loading={publishing}>
              <Rocket size={15} aria-hidden /> {t("publishConfirm")}
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 text-sm text-stone-600">
          {dirty && <li>• {t("publishWillSave")}</li>}
          <li>• {t("publishSettings")}</li>
          {themeStatus(meta).includes("active") ? null : <li>• {t("publishActivates")}</li>}
        </ul>
      </Dialog>
    </div>
  );
}

function ProblemsBar({ problems, open, onToggle, onPick }: { problems: Problem[]; open: boolean; onToggle: () => void; onPick: (p: Problem) => void }) {
  const t = useTranslations("themeStudio.studio");
  const errors = problems.filter((p) => p.level === "error").length;
  const warnings = problems.length - errors;
  return (
    <div className="border-t border-stone-200 bg-white">
      <button type="button" onClick={onToggle} className="focus-ring flex w-full items-center gap-3 px-3 py-1.5 text-xs text-stone-600" aria-expanded={open}>
        <span className={cn("flex items-center gap-1", errors ? "text-red-600" : "text-stone-500")}>
          <XCircle size={13} aria-hidden /> {t("errors", { count: errors })}
        </span>
        <span className={cn("flex items-center gap-1", warnings ? "text-amber-600" : "text-stone-500")}>
          <AlertTriangle size={13} aria-hidden /> {t("warnings", { count: warnings })}
        </span>
        <span className="ml-auto">{open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>
      </button>
      {open && (
        <ul className="max-h-48 overflow-y-auto border-t border-stone-100 py-1">
          {problems.length === 0 && <li className="px-3 py-2 text-xs text-stone-500">{t("noProblems")}</li>}
          {problems.map((p, i) => (
            <li key={i}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full items-start gap-2 px-3 py-1 text-left text-xs hover:bg-stone-50">
                {p.level === "error" ? <XCircle size={13} className="mt-0.5 shrink-0 text-red-600" aria-hidden /> : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />}
                {p.file && (
                  <span className="shrink-0 font-mono text-stone-500">
                    {p.file}
                    {p.line ? `:${p.line}` : ""}
                  </span>
                )}
                <span className="text-stone-800">{p.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
