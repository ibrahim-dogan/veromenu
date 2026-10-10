"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowLeft, Bot, ChevronDown, ChevronUp, Code2, Download, Eye, FolderTree, History, PanelLeft, Printer, Rocket, Save, SlidersHorizontal, XCircle } from "lucide-react";
import { cn } from "@/core/utils";
import { Link } from "@/core/i18n/navigation";
import { Badge, Button } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { serializePackage, validatePackage, type ThemeMediaRef } from "@/modules/theme-engine";
import { manifestSchema } from "@/modules/theme-engine/settings";
import type { PrintView, ThemeKind, ThemeManifest, ThemePackage, ThemeValidation, ThemeView } from "@/modules/theme-engine/types";
import { proposeThemeEdit } from "@/modules/theme-ai/actions";
import { publishThemeAction, renameThemeAction, restoreVersionAction, saveThemeSettingsAction, saveVersionAction } from "../../actions";
import { downloadText, studioGet, themeStatus } from "../../lib/client";
import { exportFileName, MANIFEST_PATH, mainTemplate, mediaIdsFor, newFileKindsFor, samePackage, sanitizeSettings, settingsDefaults, starterContent, withSettingsAsDefaults } from "../../lib/package";
import { StatusBadges } from "../theme-cards";
import { AiChat, type ChatMessage } from "./ai-chat";
import { Customizer } from "./customizer";
import { DiffReview } from "./diff-review";
import { applyProposal, proposalEntries, type Proposal } from "../../lib/proposal";
import { FileTree } from "./file-tree";
import { PanelBoundary } from "./panel-boundary";
import { PreviewPane } from "./preview-pane";
import { PrintPreviewPane, type PrintPreviewData } from "./print-preview-pane";
import { VersionsPanel, type VersionRow } from "./versions-panel";

const CodeEditor = dynamic(() => import("./code-editor"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-stone-50" /> });

export type Panel = "files" | "customize" | "ai" | "versions";
type MobileView = "panel" | "code" | "preview";
type Saved = { versionId: string; pkg: ThemePackage };
type Meta = { name: string; isActive: boolean; currentVersionId: string | null; publishedVersionId: string | null };
type Problem = { file?: string; line?: number; message: string; level: "error" | "warning" };
type PreviewData = { view: ThemeView; guestMessages: Record<string, string> };

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
  /** "print" = QR print design (print preview, "Als Druckdesign verwenden", back to the tables page) */
  kind?: ThemeKind;
}) {
  const { restaurantId, themeId } = props;
  const kind: ThemeKind = props.kind ?? "menu";
  const isPrint = kind === "print";
  const MAIN = mainTemplate(kind);
  const t = useTranslations("themeStudio.studio");
  const te = useTranslations("errors");

  // ---------------------------------------------------------------- working copy
  const [saved, setSaved] = useState<Saved>({ versionId: props.versionId, pkg: props.pkg });
  const [files, setFiles] = useState<Record<string, string>>(props.pkg.files);
  const [manifestText, setManifestText] = useState(() => pretty(props.pkg.manifest));
  const [activePath, setActivePath] = useState(MAIN);
  const [jump, setJump] = useState<{ path: string; line: number; nonce: number } | null>(null);
  const [meta, setMeta] = useState<Meta>(props.meta);
  const [panel, setPanel] = useState<Panel>(props.initialPanel);
  const [mobileView, setMobileView] = useState<MobileView>("panel");

  const parsed = useMemo(() => parseManifest(manifestText), [manifestText]);
  // Valid JSON is not enough for the UI: while typing, the manifest is often JSON-valid but not schema-valid
  // ("settings": {}, a color field without default …). Customizer / settings / preview only ever see the last
  // schema-valid manifest; save + validation use the raw one (the server rejects invalid packages anyway).
  const schemaOk = useMemo(() => parsed.ok && manifestSchema.safeParse(parsed.manifest).success, [parsed]);
  const [lastGood, setLastGood] = useState<ThemeManifest>(props.pkg.manifest);
  if (parsed.ok && schemaOk && parsed.manifest !== lastGood) setLastGood(parsed.manifest);
  const manifest = parsed.ok ? parsed.manifest : lastGood;
  const uiManifest = parsed.ok && schemaOk ? parsed.manifest : lastGood;
  const workingPkg = useMemo<ThemePackage>(() => ({ manifest, files }), [manifest, files]);
  const previewWorkingPkg = useMemo<ThemePackage>(() => ({ manifest: uiManifest, files }), [uiManifest, files]);

  const dirtyPaths = useMemo(() => {
    const s = new Set<string>();
    // semantic compare – formatting differences (one-line arrays, indentation) are not "unsaved changes"
    if (!parsed.ok || JSON.stringify(parsed.manifest) !== JSON.stringify(saved.pkg.manifest)) s.add(MANIFEST_PATH);
    for (const p of new Set([...Object.keys(files), ...Object.keys(saved.pkg.files)])) if (files[p] !== saved.pkg.files[p]) s.add(p);
    return s;
  }, [files, parsed, saved.pkg]);
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
    const target = file && (file === MANIFEST_PATH || files[file] !== undefined) ? file : activePath;
    setActivePath(target);
    if (line) setJump({ path: target, line, nonce: Date.now() });
    setMobileView("code");
  };

  // ---------------------------------------------------------------- helpers
  const fail = useCallback(
    (r: { error: string; detail?: string }) => {
      if (r.error === "aborted") return;
      const msg = te.has(r.error) ? te(r.error) : te("unexpected");
      toast.error(r.detail && (r.error === "validation" || r.error === "unexpected") ? `${msg} (${r.detail.slice(0, 200)})` : msg);
    },
    [te],
  );
  /** Server action promises reject on network errors / server restarts – never leave a spinner behind. */
  const crashed = useCallback(() => toast.error(te("unexpected")), [te]);

  // ---------------------------------------------------------------- AI busy
  // Next dispatches server actions one at a time per client: while proposeThemeEdit runs (30–90 s) every other
  // action (save, publish, restore, rename, settings) would silently queue behind it → block them in the UI instead.
  const [aiBusy, setAiBusy] = useState(false);
  const aiBusyRef = useRef(false);

  // ---------------------------------------------------------------- save
  const [saving, setSaving] = useState(false);
  const savingPromise = useRef<Promise<Saved | null> | null>(null);
  const [versionsKey, setVersionsKey] = useState(props.versionId);

  const save = useCallback(
    async (opts: { silent?: boolean; duringAi?: boolean } = {}): Promise<Saved | null> => {
      if (aiBusyRef.current && !opts.duringAi) {
        toast(t("aiBusyBlocked"));
        return null;
      }
      if (!parsed.ok) {
        toast.error(t("manifestInvalid"));
        openAt(MANIFEST_PATH, parsed.line);
        return null;
      }
      // a save is already running (⌘S, publish, AI) → share its result instead of silently returning nothing
      if (savingPromise.current) return savingPromise.current;
      if (!dirty) return saved;
      const pkg = workingPkg;
      const run = (async (): Promise<Saved | null> => {
        setSaving(true);
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
        } catch {
          crashed();
          return null;
        } finally {
          setSaving(false);
        }
      })();
      savingPromise.current = run;
      try {
        return await run;
      } finally {
        if (savingPromise.current === run) savingPromise.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parsed, dirty, saved, workingPkg, restaurantId, themeId, fail, crashed, t],
  );

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------------------------------------------------------------- file ops
  const setContent = useCallback(
    (v: string) => {
      if (activePath === MANIFEST_PATH) setManifestText(v);
      else setFiles((f) => ({ ...f, [activePath]: v }));
    },
    [activePath],
  );
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
    if (activePath === p) setActivePath(MAIN);
  };

  // ---------------------------------------------------------------- customizer
  const [settings, setSettings] = useState<Record<string, unknown>>(() => sanitizeSettings(props.pkg.manifest, props.initialSettings));
  const [guestSettings, setGuestSettings] = useState<Record<string, unknown>>(() => sanitizeSettings(props.pkg.manifest, props.initialSettings));
  const effectiveSettings = useMemo(() => sanitizeSettings(uiManifest, settings), [uiManifest, settings]);
  const settingsDirty = useMemo(() => JSON.stringify(effectiveSettings) !== JSON.stringify(sanitizeSettings(uiManifest, guestSettings)), [effectiveSettings, uiManifest, guestSettings]);
  const [savingSettings, setSavingSettings] = useState(false);

  async function saveSettingsForGuests() {
    if (aiBusyRef.current || savingSettings) return;
    const values = effectiveSettings;
    setSavingSettings(true);
    try {
      const res = await saveThemeSettingsAction({ restaurantId, themeId, values });
      if (!res.ok) return fail(res);
      // The server only keeps fields of the published / latest saved version. Values of fields that exist only in
      // the unsaved working copy are skipped → say so, and don't leave the button "dirty" forever.
      const kept = res.data.settings;
      const skipped = Object.keys(values).some((k) => !(k in kept));
      setGuestSettings(skipped ? { ...values, ...kept } : kept);
      if (skipped) toast(t("settingsPartlyUnsaved"));
      else toast.success(t("settingsSaved"));
    } catch {
      crashed();
    } finally {
      setSavingSettings(false);
    }
  }

  // ---------------------------------------------------------------- AI proposal state
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<{ p: Proposal; base: ThemePackage } | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const say = (role: ChatMessage["role"], text: string) => setChat((c) => [...c, { id: Date.now() + Math.random(), role, text }]);
  const entries = useMemo(() => (proposal ? proposalEntries(proposal.base, proposal.p) : []), [proposal]);

  // ---------------------------------------------------------------- unsaved-changes guard
  const guard = dirty || settingsDirty || !!proposal;
  const guardRef = useRef(guard);
  useEffect(() => {
    guardRef.current = guard;
  });
  useEffect(() => {
    if (!guard) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [guard]);
  // In-app navigation (sidebar, back arrow, any link): client-side route changes don't fire beforeunload.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!guardRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || (url.pathname === window.location.pathname && url.search === window.location.search)) return;
      if (!window.confirm(t("leaveConfirm"))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [t]);

  // ---------------------------------------------------------------- preview data (GET routes, not server actions)
  const [locale, setLocale] = useState(props.defaultLocale);
  const [source, setSource] = useState<"real" | "sample">("real");
  const [data, setData] = useState<PreviewData | null>(null);
  const dataCache = useRef(new Map<string, PreviewData>());
  useEffect(() => {
    if (isPrint) return;
    const key = `${source}:${locale}`;
    const hit = dataCache.current.get(key);
    if (hit) {
      setData(hit);
      return;
    }
    const ac = new AbortController();
    const qs = new URLSearchParams({ locale, source });
    studioGet<{ view: ThemeView; source: "real" | "sample"; guestMessages: Record<string, string> }>(`/api/restaurants/${restaurantId}/themes/preview-data?${qs}`, ac.signal).then((res) => {
      if (ac.signal.aborted) return;
      if (!res.ok) return fail(res);
      const d = { view: res.data.view, guestMessages: res.data.guestMessages };
      dataCache.current.set(key, d);
      setData(d);
      if (source === "real" && res.data.source === "sample") toast(t("realUnavailable"));
    });
    return () => ac.abort();
  }, [restaurantId, locale, source, fail, t, isPrint]);

  // print designs: real tables (generic card + tables) or the engine's sample cards
  const [printData, setPrintData] = useState<PrintPreviewData | null>(null);
  const printCache = useRef(new Map<string, PrintPreviewData>());
  useEffect(() => {
    if (!isPrint) return;
    const hit = printCache.current.get(source);
    if (hit) {
      setPrintData(hit);
      return;
    }
    const ac = new AbortController();
    studioGet<{ views: PrintView[]; source: "real" | "sample"; total: number; locale: string; guestMessages: Record<string, string> }>(
      `/api/restaurants/${restaurantId}/themes/print-data?source=${source}`,
      ac.signal,
    ).then((res) => {
      if (ac.signal.aborted) return;
      if (!res.ok) return fail(res);
      const d = { views: res.data.views, total: res.data.total, locale: res.data.locale, guestMessages: res.data.guestMessages };
      printCache.current.set(source, d);
      setPrintData(d);
    });
    return () => ac.abort();
  }, [isPrint, restaurantId, source, fail]);

  const [media, setMedia] = useState<Record<string, ThemeMediaRef>>({});
  const mediaKey = mediaIdsFor(uiManifest, effectiveSettings).join(",");
  useEffect(() => {
    const ids = mediaKey ? mediaKey.split(",") : [];
    const missing = ids.filter((i) => !media[i]);
    if (!missing.length) return;
    const ac = new AbortController();
    studioGet<Record<string, ThemeMediaRef>>(`/api/restaurants/${restaurantId}/themes/media?ids=${encodeURIComponent(missing.join(","))}`, ac.signal).then((res) => {
      if (!ac.signal.aborted && res.ok) setMedia((m) => ({ ...m, ...res.data }));
    });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey, restaurantId]);

  // ---------------------------------------------------------------- AI
  async function sendAi(text: string) {
    if (aiBusyRef.current) return;
    aiBusyRef.current = true;
    setAiBusy(true);
    say("user", text);
    try {
      const base = await save({ silent: true, duringAi: true });
      if (!base) return say("system", t("aiNeedsValid"));
      const res = await proposeThemeEdit({ restaurantId, themeId, versionId: base.versionId, instruction: text });
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
    } catch {
      crashed();
      say("system", t("aiFailed"));
    } finally {
      aiBusyRef.current = false;
      setAiBusy(false);
    }
  }

  async function applyAi(all: boolean) {
    if (!proposal || applying) return;
    // The proposal is built on the version saved when the request was sent. If the working copy changed since
    // (file tree ops, "set as default" …), applying replaces those changes → ask first.
    if ((!parsed.ok || !samePackage(workingPkg, proposal.base)) && !window.confirm(t("aiDiscardEdits"))) return;
    const acc = all ? new Set(entries.map((e) => e.path)) : accepted;
    const pkg = applyProposal(proposal.base, proposal.p, acc);
    setApplying(true);
    let res: Awaited<ReturnType<typeof saveVersionAction>>;
    try {
      res = await saveVersionAction({
        restaurantId,
        themeId,
        pkg: pkg as unknown as { manifest: Record<string, unknown>; files: Record<string, string> },
        note: (proposal.p.summary || t("aiNote")).slice(0, 300),
        author: "ai",
      });
    } catch {
      return crashed();
    } finally {
      setApplying(false);
    }
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
    // the AI may have deleted the open file – don't keep editing (and thereby resurrecting) it
    if (activePath !== MANIFEST_PATH && pkg.files[activePath] === undefined) setActivePath(MAIN);
    say("system", t("aiApplied", { number: res.data.number }));
    toast.success(t("aiApplied", { number: res.data.number }));
  }

  // ---------------------------------------------------------------- versions
  const [versionPreview, setVersionPreview] = useState<{ id: string; number: number; pkg: ThemePackage } | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const versionReq = useRef<AbortController | null>(null);

  async function previewVersion(v: VersionRow) {
    versionReq.current?.abort();
    versionReq.current = null;
    if (versionPreview?.id === v.id) return setVersionPreview(null);
    const ac = new AbortController();
    versionReq.current = ac;
    const res = await studioGet<{ versionId: string; pkg: ThemePackage }>(`/api/restaurants/${restaurantId}/themes/${themeId}/versions/${v.id}`, ac.signal);
    if (ac.signal.aborted) return; // a newer click won
    versionReq.current = null;
    if (!res.ok) return fail(res);
    setVersionPreview({ id: v.id, number: v.number, pkg: res.data.pkg });
    setMobileView("preview");
  }

  async function restoreVersion(v: VersionRow) {
    if (restoring || aiBusyRef.current) return;
    if ((dirty || proposal) && !window.confirm(t("restoreDiscard"))) return;
    setRestoring(v.id);
    let res: Awaited<ReturnType<typeof restoreVersionAction>>;
    try {
      res = await restoreVersionAction({ restaurantId, themeId, versionId: v.id, note: t("restoredNote", { number: v.number }) });
    } catch {
      return crashed();
    } finally {
      setRestoring(null);
    }
    if (!res.ok) return fail(res);
    versionReq.current?.abort();
    setFiles(res.data.pkg.files);
    setManifestText(pretty(res.data.pkg.manifest));
    setSaved({ versionId: res.data.versionId, pkg: res.data.pkg });
    setMeta((m) => ({ ...m, currentVersionId: res.data.versionId }));
    setVersionsKey(res.data.versionId);
    setVersionPreview(null);
    setProposal(null); // a pending AI proposal was built on the old version – applying it would revert the restore
    if (!res.data.pkg.files[activePath] && activePath !== MANIFEST_PATH) setActivePath(MAIN);
    toast.success(t("restored", { number: v.number, newNumber: res.data.number }));
  }

  // ---------------------------------------------------------------- publish / export / rename
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Publishing always publishes the working copy – never while the preview shows something else.
  const publishBlocked = aiBusy ? t("aiBusyBlocked") : proposal ? t("publishBlockedProposal") : versionPreview ? t("publishBlockedVersion") : null;
  async function publish() {
    if (publishing || publishBlocked) return;
    setPublishing(true);
    try {
      const base = await save({ silent: true });
      if (!base) return;
      const res = await publishThemeAction({ restaurantId, themeId, versionId: base.versionId, settings: effectiveSettings });
      if (!res.ok) return fail(res);
      setMeta((m) => ({ ...m, isActive: true, publishedVersionId: res.data.versionId, currentVersionId: base.versionId }));
      setGuestSettings(res.data.settings);
      setPublishOpen(false);
      toast.success(isPrint ? t("printSelected") : t("published"));
    } catch {
      crashed();
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
    try {
      const res = await renameThemeAction({ restaurantId, themeId, name: v });
      if (!res.ok) return fail(res);
      setMeta((m) => ({ ...m, name: res.data.name }));
    } catch {
      crashed();
    }
  }

  // ---------------------------------------------------------------- preview package
  const previewPkg = useMemo(() => {
    if (versionPreview) return versionPreview.pkg;
    if (proposal) return applyProposal(proposal.base, proposal.p, accepted);
    return previewWorkingPkg;
  }, [versionPreview, proposal, accepted, previewWorkingPkg]);
  const previewSettings = useMemo(() => sanitizeSettings(previewPkg.manifest, settings), [previewPkg.manifest, settings]);

  const content = activePath === MANIFEST_PATH ? manifestText : (files[activePath] ?? "");
  const panels: { key: Panel; icon: typeof FolderTree; label: string }[] = [
    { key: "files", icon: FolderTree, label: t("panelFiles") },
    { key: "customize", icon: SlidersHorizontal, label: t("panelCustomize") },
    { key: "ai", icon: Bot, label: t("panelAi") },
    { key: "versions", icon: History, label: t("panelVersions") },
  ];
  const hub = isPrint ? `/dashboard/${restaurantId}/tables` : `/dashboard/${restaurantId}/design`;
  const statusMeta = { ...meta, currentVersionId: dirty ? "__dirty__" : meta.currentVersionId };
  const clearJump = useCallback(() => setJump(null), []);
  const previewBanner = versionPreview ? (
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
    ) : null;

  return (
    <div className="fixed inset-x-0 top-14 bottom-0 z-20 flex flex-col bg-white lg:left-[260px]">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 px-3 py-2">
        {/* unsaved-changes confirm: document-level click guard above */}
        <Link href={hub} className="focus-ring rounded-md p-1.5 text-stone-500 hover:bg-stone-100" aria-label={isPrint ? t("backPrint") : t("back")} title={isPrint ? t("backPrint") : t("back")}>
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
            <button
              type="button"
              onClick={() => setEditingName(true)}
              disabled={aiBusy}
              className="focus-ring truncate rounded-md px-1 text-sm font-semibold text-stone-900 hover:bg-stone-100 disabled:hover:bg-transparent"
              title={aiBusy ? t("aiBusyBlocked") : t("rename")}
            >
              {meta.name}
            </button>
          )}
          <span className="hidden flex-wrap gap-1 sm:flex">
            {isPrint && (
              <Badge tone="blue">
                <Printer size={11} aria-hidden className="mr-1 inline" />
                {t("kindPrint")}
              </Badge>
            )}
            <StatusBadges theme={statusMeta} kind={kind} />
            {dirty && <Badge tone="yellow">{t("unsaved")}</Badge>}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={exportTheme} title={t("export")} aria-label={t("export")}>
            <Download size={15} aria-hidden /> <span className="hidden md:inline">{t("export")}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => save()} loading={saving} disabled={!dirty || aiBusy} title={aiBusy ? t("aiBusyBlocked") : t("saveShortcut")}>
            {!saving && <Save size={15} aria-hidden />} <span className="hidden sm:inline">{t("save")}</span>
          </Button>
          <Button size="sm" onClick={() => setPublishOpen(true)} disabled={errorCount > 0 || publishing || !!publishBlocked} title={publishBlocked ?? undefined}>
            {isPrint ? <Printer size={15} aria-hidden /> : <Rocket size={15} aria-hidden />}{" "}
            <span className="hidden sm:inline">{isPrint ? (meta.isActive ? t("usePrintUpdate") : t("usePrint")) : meta.isActive ? t("publishUpdate") : t("publish")}</span>
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
            <PanelBoundary resetKey={`${panel}\n${manifestText}`}>
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
                  mainTemplate={MAIN}
                  fileKinds={newFileKindsFor(kind)}
                />
              )}
              {panel === "customize" && (
                <Customizer
                  restaurantId={restaurantId}
                  manifest={uiManifest}
                  values={effectiveSettings}
                  onChange={(id, v) => setSettings((s) => ({ ...s, [id]: v }))}
                  isActive={meta.isActive}
                  dirty={settingsDirty}
                  saving={savingSettings}
                  blocked={aiBusy}
                  onSaveForGuests={saveSettingsForGuests}
                  onReset={() => setSettings(settingsDefaults(uiManifest))}
                  onSaveAsDefaults={() => {
                    if (!parsed.ok) return toast.error(t("manifestInvalid"));
                    if (!schemaOk) return toast.error(t("manifestSchemaInvalid"));
                    setManifestText(pretty(withSettingsAsDefaults(parsed.manifest, effectiveSettings)));
                    toast(t("defaultsApplied"));
                  }}
                  onEditFields={() => openAt(MANIFEST_PATH)}
                  kind={kind}
                  onPrintSpec={(spec) => {
                    if (!parsed.ok) return toast.error(t("manifestInvalid"));
                    setManifestText(pretty({ ...parsed.manifest, print: spec }));
                  }}
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
                  kind={kind}
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
                  restoreDisabled={aiBusy}
                />
              )}
            </PanelBoundary>
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
                <span className="ml-auto hidden text-[11px] text-stone-400 md:inline">{aiBusy ? t("aiBusyBlocked") : t("saveShortcut")}</span>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                {/* read-only while the AI works: its proposal is built on the version saved when the request was sent */}
                <CodeEditor
                  key={activePath}
                  path={activePath}
                  value={content}
                  onChange={setContent}
                  readOnly={aiBusy}
                  jump={jump}
                  onJumped={clearJump}
                  errorLines={errorLines}
                  ariaLabel={t("editorLabel", { path: activePath })}
                />
              </div>
            </>
          )}
          <ProblemsBar problems={problems} open={showProblems} onToggle={() => setShowProblems((v) => !v)} onPick={(p) => openAt(p.file, p.line)} />
        </section>

        {/* preview */}
        <section className={cn("min-h-0 w-full flex-col border-l border-stone-200 lg:flex lg:w-[42%] lg:max-w-[720px] lg:min-w-[340px]", mobileView === "preview" ? "flex" : "hidden")}>
          <PanelBoundary resetKey={previewPkg}>
            {isPrint ? (
              <PrintPreviewPane
                pkg={printData ? previewPkg : null}
                data={printData}
                media={media}
                settings={previewSettings}
                source={source}
                onSource={setSource}
                onRenderErrors={setRenderErrors}
                banner={previewBanner}
              />
            ) : (
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
                banner={previewBanner}
              />
            )}
          </PanelBoundary>
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
        title={isPrint ? t("usePrintTitle") : t("publishTitle")}
        description={isPrint ? t("usePrintDescription") : t("publishDescription")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPublishOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={publish} loading={publishing} disabled={!!publishBlocked}>
              {isPrint ? <Printer size={15} aria-hidden /> : <Rocket size={15} aria-hidden />} {isPrint ? t("usePrintConfirm") : t("publishConfirm")}
            </Button>
          </>
        }
      >
        <ul className="space-y-1.5 text-sm text-stone-600">
          {dirty && <li>• {t("publishWillSave")}</li>}
          <li>• {isPrint ? t("usePrintSettings") : t("publishSettings")}</li>
          {themeStatus(meta).includes("active") ? null : <li>• {isPrint ? t("usePrintReplaces") : t("publishActivates")}</li>}
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
