"use client";
/**
 * Menu kit flow: Willkommen → upload the printed menu once (PDF / photos) → live progress per step → ONE review
 * screen (import preview, logo, menu theme, print design) with per-part apply + "Alles übernehmen".
 * The job runs on the server; this component only polls GET /api/restaurants/[rid]/jobs/[jobId].
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Lock,
  Palette,
  QrCode,
  RotateCcw,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/core/utils";
import { Badge, Button, buttonClass, Card, CardBody } from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { Dropzone } from "@/modules/media/components/dropzone";
import { uploadMedia, type MediaItem } from "@/modules/media/components/media-client";
import { renderThemePreviewAction } from "@/modules/theme-studio/actions";
import { MiniPreview } from "@/modules/theme-studio/components/mini-preview";
import { UploadedList } from "@/modules/theme-studio/components/new-theme";
import { useElapsed } from "@/modules/theme-studio/components/ai-progress";
import { applyKit, retryKitStep, setKitLogoAction, startMenuKit } from "../actions";
import { SourceThumbs } from "./stored-sources";
import { KIT_MAX_FILES, type KitAllergenMode, type KitApplyPart, type KitJobDto, type KitStepDto, type KitStepKey } from "../types";

type Perms = { theme: boolean; print: boolean; logo: boolean };
type StoredFile = KitJobDto["files"][number];

export type KitOnboardingProps = {
  restaurantId: string;
  restaurantSlug: string;
  firstName: string | null;
  initialJob: KitJobDto | null;
  startFresh: boolean;
  /** plan feature theme_studio (Starter / Pro) */
  designs: boolean;
  steps: KitStepKey[];
  stored: StoredFile[];
  perms: Perms;
};

const POLL_MS = 3000;

async function fetchJob(restaurantId: string, jobId: string): Promise<KitJobDto | null> {
  try {
    const res = await fetch(`/api/restaurants/${restaurantId}/jobs/${jobId}`, { cache: "no-store" });
    const body = (await res.json()) as { ok: boolean; data?: KitJobDto };
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

export function KitOnboarding(props: KitOnboardingProps) {
  const { restaurantId } = props;
  const [job, setJob] = useState<KitJobDto | null>(props.initialJob);
  const [uploading, setUploading] = useState(props.startFresh || !props.initialJob);

  const jobId = job?.id;
  const active = !!job?.active;
  useEffect(() => {
    if (!jobId || !active) return;
    let alive = true;
    const h = setInterval(async () => {
      const next = await fetchJob(restaurantId, jobId);
      if (alive && next) setJob(next);
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [restaurantId, jobId, active]);

  const reload = async () => {
    if (!jobId) return;
    const next = await fetchJob(restaurantId, jobId);
    if (next) setJob(next);
  };

  if (uploading || !job)
    return (
      <UploadView
        {...props}
        onBack={job ? () => setUploading(false) : undefined}
        onStarted={async (id) => {
          const next = await fetchJob(restaurantId, id);
          if (next) setJob(next);
          setUploading(false);
        }}
      />
    );
  if (job.active) return <ProgressView job={job} restaurantId={restaurantId} />;
  return <ReviewView {...props} job={job} onJob={setJob} onReload={reload} onNew={() => setUploading(true)} />;
}

// ------------------------------------------------------------------ upload

function UploadView({
  restaurantId,
  firstName,
  designs,
  steps,
  stored,
  onStarted,
  onBack,
}: KitOnboardingProps & { onStarted: (jobId: string) => Promise<void>; onBack?: () => void }) {
  const t = useTranslations("kit");
  const te = useTranslations("errors");
  const [files, setFiles] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState<"upload" | "stored" | null>(null);

  async function start(mediaIds?: string[]) {
    setBusy(mediaIds ? "upload" : "stored");
    try {
      const res = await startMenuKit({ restaurantId, mediaIds });
      if (!res.ok) return void toast.error(te.has(res.error) ? te(res.error) : te("unexpected"));
      if (res.data.existing) toast(t("upload.alreadyRunning"));
      await onStarted(res.data.jobId);
    } catch {
      toast.error(te("unexpected"));
    } finally {
      setBusy(null);
    }
  }

  const bullets: { key: "import" | "logo" | "theme" | "print"; icon: typeof FileText; locked: boolean }[] = [
    { key: "import", icon: FileText, locked: false },
    { key: "logo", icon: ImageIcon, locked: false },
    { key: "theme", icon: Palette, locked: !designs || !steps.includes("theme") },
    { key: "print", icon: QrCode, locked: !designs || !steps.includes("print") },
  ];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-violet-50 px-5 py-6 sm:px-8 sm:py-8">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm">
          <Sparkles size={13} aria-hidden /> {designs ? t("welcome.planPaid") : t("welcome.planFree")}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
          {firstName ? t("welcome.title", { name: firstName }) : t("welcome.titleNoName")}
        </h1>
        <p className="mt-2 max-w-2xl text-stone-600">{t("welcome.lead")}</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {bullets.map((b) => (
            <li key={b.key} className={cn("flex items-start gap-3 rounded-xl bg-white/70 px-3 py-2.5", b.locked && "opacity-60")}>
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", b.locked ? "bg-stone-100 text-stone-400" : "bg-brand-700 text-white")}>
                {b.locked ? <Lock size={15} aria-hidden /> : <b.icon size={16} aria-hidden />}
              </span>
              <span className="text-sm">
                <span className="block font-medium text-stone-900">{t(`welcome.bullets.${b.key}.title`)}</span>
                <span className="block text-stone-500">{b.locked ? t("welcome.lockedHint") : t(`welcome.bullets.${b.key}.hint`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div>
            <h2 className="font-semibold text-stone-900">{t("upload.title")}</h2>
            <p className="text-sm text-stone-500">{t("upload.hint", { max: KIT_MAX_FILES })}</p>
          </div>
          <Dropzone
            restaurantId={restaurantId}
            accept="any"
            multiple
            onUploaded={(m) =>
              setFiles((l) => {
                if (l.length >= KIT_MAX_FILES) {
                  toast.error(t("upload.limit", { max: KIT_MAX_FILES }));
                  return l;
                }
                return [...l, m];
              })
            }
          />
          <UploadedList items={files} onRemove={(id) => setFiles((l) => l.filter((x) => x.id !== id))} />
          <div className="flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-stone-500">{t("upload.duration")}</p>
            <div className="flex flex-wrap items-center gap-2">
              {onBack ? (
                <Button variant="ghost" onClick={onBack}>
                  {t("upload.back")}
                </Button>
              ) : (
                <Link href={`/dashboard/${restaurantId}`} className={buttonClass("ghost")}>
                  {t("upload.later")}
                </Link>
              )}
              <Button size="lg" onClick={() => start(files.map((f) => f.id))} disabled={!files.length || !!busy} loading={busy === "upload"}>
                {t("upload.start")} <ArrowRight size={16} aria-hidden />
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {stored.length > 0 && (
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <SourceThumbs files={stored} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-stone-900">{t("upload.useStored")}</p>
              <p className="text-sm text-stone-500">{t("upload.storedHint", { count: stored.length })}</p>
            </div>
            <Button variant="secondary" onClick={() => start()} disabled={!!busy} loading={busy === "stored"}>
              {t("upload.useStoredButton")}
            </Button>
          </CardBody>
        </Card>
      )}
      {!onBack && <p className="text-center text-xs text-stone-500">{t("upload.laterHint")}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ progress

function StepIcon({ status }: { status: KitStepDto["status"] }) {
  if (status === "done") return <CheckCircle2 size={20} className="text-emerald-600" aria-hidden />;
  if (status === "failed") return <XCircle size={20} className="text-red-600" aria-hidden />;
  if (status === "running") return <Loader2 size={20} className="animate-spin text-brand-700" aria-hidden />;
  return <Circle size={20} className="text-stone-300" aria-hidden />;
}

function useStepError() {
  const t = useTranslations("kit");
  const te = useTranslations("errors");
  return (code: string | null) => {
    if (!code) return null;
    if (t.has(`errors.${code}`)) return t(`errors.${code}`);
    return te.has(code) ? te(code) : t("errors.unexpected");
  };
}

function ProgressView({ job, restaurantId }: { job: KitJobDto; restaurantId: string }) {
  const t = useTranslations("kit");
  const errorText = useStepError();
  const elapsed = useElapsed(Date.parse(job.startedAt));
  const finished = job.steps.filter((s) => s.status === "done" || s.status === "failed" || s.status === "skipped").length;
  const pct = Math.round((finished / Math.max(1, job.steps.length)) * 100);
  const min = Math.floor(elapsed / 60);
  const sec = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-brand-50 to-white px-5 py-6 sm:px-8">
          <div className="flex items-start gap-3">
            <Sparkles size={22} className="mt-1 shrink-0 animate-pulse text-violet-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-stone-900">{t("progress.title")}</h1>
              <p className="mt-1 text-sm text-stone-600">{t("progress.hint")}</p>
            </div>
            <span className="shrink-0 font-mono text-sm text-stone-500 tabular-nums" aria-label={t("progress.elapsed")}>
              {min}:{sec}
            </span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 rounded-full bg-brand-600 transition-all duration-700" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        </div>
        <ol className="divide-y divide-stone-100" aria-live="polite">
          {job.steps.map((s) => (
            <li key={s.key} className="flex items-start gap-3 px-5 py-3 sm:px-8">
              <span className="mt-0.5">
                <StepIcon status={s.status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", s.status === "pending" ? "text-stone-400" : "text-stone-800")}>{t(`steps.${s.key}`)}</span>
                {s.status === "failed" && <span className="block text-xs text-red-700">{errorText(s.error)}</span>}
              </span>
              <span className="shrink-0 text-xs text-stone-400">{t(`status.${s.status}`)}</span>
            </li>
          ))}
        </ol>
      </Card>
      <div className="text-center">
        <Link href={`/dashboard/${restaurantId}`} className={buttonClass("secondary")}>
          {t("progress.leave")}
        </Link>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ review

function ReviewView({
  restaurantId,
  restaurantSlug,
  designs,
  perms,
  job,
  onJob,
  onReload,
  onNew,
}: KitOnboardingProps & { job: KitJobDto; onJob: (j: KitJobDto) => void; onReload: () => Promise<void>; onNew: () => void }) {
  const t = useTranslations("kit");
  const te = useTranslations("errors");
  // Printed allergen marks are the restaurant's own declaration → take them over by default (owner can switch to "suggest").
  const [allergenMode, setAllergenMode] = useState<KitAllergenMode>((job.import?.hintCount ?? 0) > 0 ? "confirm" : "suggest");
  const [applying, setApplying] = useState<KitApplyPart | "all" | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const step = (k: KitStepKey) => job.steps.find((s) => s.key === k);
  const failed = job.steps.filter((s) => s.status === "failed");

  const importReady = job.import?.status === "ready";
  const pending: KitApplyPart[] = [
    ...(importReady && !job.import?.applied ? (["import"] as const) : []),
    ...(job.theme && !job.theme.active && perms.theme ? (["theme"] as const) : []),
    ...(job.print && !job.print.selected && perms.print ? (["print"] as const) : []),
  ];
  const allApplied = pending.length === 0 && (!!job.import?.applied || !!job.theme?.active || !!job.print?.selected);

  async function apply(parts: KitApplyPart[], key: KitApplyPart | "all") {
    if (applying) return;
    setApplying(key);
    try {
      const res = await applyKit({ restaurantId, jobId: job.id, parts, allergenMode });
      if (!res.ok) return void toast.error(te.has(res.error) ? te(res.error) : te("unexpected"));
      for (const p of parts) {
        const o = res.data[p];
        if (o && !o.ok) toast.error(`${t(`review.${p}.title`)}: ${te.has(o.error) ? te(o.error) : te("unexpected")}`);
      }
      const okParts = parts.filter((p) => res.data[p]?.ok);
      if (okParts.length) toast.success(key === "all" ? t("review.appliedAll") : t(`review.${okParts[0]}.appliedToast`));
      await onReload();
    } catch {
      toast.error(te("unexpected"));
    } finally {
      setApplying(null);
    }
  }

  async function retry(k?: KitStepKey) {
    if (retrying) return;
    setRetrying(k ?? "all");
    try {
      const res = await retryKitStep({ restaurantId, jobId: job.id, step: k });
      if (!res.ok) return void toast.error(te.has(res.error) ? te(res.error) : te("unexpected"));
      onJob(res.data);
    } catch {
      toast.error(te("unexpected"));
    } finally {
      setRetrying(null);
    }
  }

  const retryButton = (k: KitStepKey) =>
    step(k)?.status === "failed" ? (
      <Button size="sm" variant="secondary" onClick={() => retry(k)} loading={retrying === k} disabled={!!retrying}>
        <RotateCcw size={14} aria-hidden /> {t("retry")}
      </Button>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white px-5 py-6 sm:flex-row sm:items-center sm:px-8">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-stone-900 sm:text-2xl">{failed.length ? t("review.titlePartial") : t("review.title")}</h1>
          <p className="mt-1 text-sm text-stone-600">{allApplied ? t("review.leadDone") : t("review.lead")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {failed.length > 0 && (
            <Button variant="secondary" onClick={() => retry()} loading={retrying === "all"} disabled={!!retrying}>
              <RotateCcw size={15} aria-hidden /> {t("retryAll")}
            </Button>
          )}
          {allApplied ? (
            <a href={`/m/${restaurantSlug}`} target="_blank" rel="noreferrer" className={buttonClass("primary", "lg")}>
              <ExternalLink size={16} aria-hidden /> {t("review.openGuest")}
            </a>
          ) : (
            <Button size="lg" onClick={() => apply(pending, "all")} disabled={!pending.length || !!applying} loading={applying === "all"}>
              <CheckCircle2 size={17} aria-hidden /> {t("review.applyAll")}
            </Button>
          )}
        </div>
      </div>

      {importReady && !job.import?.applied && (job.import?.hintCount ?? 0) > 0 && (
        <fieldset className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4">
          <legend className="sr-only">{t("review.allergens.title")}</legend>
          <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
            <AlertTriangle size={16} className="text-amber-600" aria-hidden /> {t("review.allergens.title")}
          </p>
          <p className="mt-1 text-sm text-stone-600">{t("review.allergens.hint", { count: job.import?.hintCount ?? 0 })}</p>
          <div className="mt-3 space-y-2">
            {(["suggest", "confirm"] as const).map((m) => (
              <label key={m} className="flex cursor-pointer items-start gap-2.5 text-sm text-stone-800">
                <input type="radio" name="kit-allergens" value={m} checked={allergenMode === m} onChange={() => setAllergenMode(m)} className="mt-0.5 accent-brand-700" />
                <span>
                  <span className="block font-medium">{t(`review.allergens.${m}`)}</span>
                  <span className="block text-xs text-stone-500">{t(`review.allergens.${m}Hint`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* menu import */}
        <ReviewCard icon={FileText} title={t("review.import.title")} step={step("import")} action={retryButton("import")}>
          {job.import && (importReady || job.import.applied) ? (
            <div className="space-y-3">
              <p className="text-sm text-stone-700">{t("review.import.found", { items: job.import.itemCount, categories: job.import.categoryCount })}</p>
              {job.files.length > 0 && <SourceThumbs files={job.files} size="sm" />}
              <div className="flex flex-wrap gap-2">
                {job.import.applied ? (
                  <>
                    <Badge tone="green">
                      <CheckCircle2 size={13} aria-hidden /> {t("review.applied")}
                    </Badge>
                    <Link href={`/dashboard/${restaurantId}/menu`} className={buttonClass("secondary", "sm")}>
                      {t("review.import.openMenu")}
                    </Link>
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={() => apply(["import"], "import")} loading={applying === "import"} disabled={!!applying}>
                      {t("review.import.apply")}
                    </Button>
                    <Link href={`/dashboard/${restaurantId}/import`} className={buttonClass("secondary", "sm")}>
                      {t("review.import.edit")}
                    </Link>
                  </>
                )}
              </div>
            </div>
          ) : (
            <StepPlaceholder step={step("import")} />
          )}
        </ReviewCard>

        {/* logo */}
        <ReviewCard icon={ImageIcon} title={t("review.logo.title")} step={step("logo")} action={retryButton("logo")}>
          <LogoPanel restaurantId={restaurantId} job={job} canEdit={perms.logo} onChanged={onReload} />
        </ReviewCard>

        {designs ? (
          <>
            {step("theme") && (
              <ReviewCard icon={Palette} title={t("review.theme.title")} step={step("theme")} action={retryButton("theme") ?? retryButton("brief")}>
                {job.theme ? (
                  <DesignPanel
                    restaurantId={restaurantId}
                    design={{ id: job.theme.id, versionId: job.theme.versionId, name: job.theme.name, summary: job.theme.summary, applied: job.theme.active }}
                    applyLabel={t("review.theme.apply")}
                    appliedLabel={t("review.theme.active")}
                    canApply={perms.theme}
                    applying={applying === "theme"}
                    disabled={!!applying}
                    onApply={() => apply(["theme"], "theme")}
                  />
                ) : (
                  <StepPlaceholder step={step("theme")} brief={step("brief")} />
                )}
              </ReviewCard>
            )}
            {step("print") && (
              <ReviewCard icon={QrCode} title={t("review.print.title")} step={step("print")} action={retryButton("print") ?? retryButton("brief")}>
                {job.print ? (
                  <DesignPanel
                    restaurantId={restaurantId}
                    design={{ id: job.print.id, versionId: job.print.versionId, name: job.print.name, summary: job.print.summary, applied: job.print.selected }}
                    applyLabel={t("review.print.apply")}
                    appliedLabel={t("review.print.selected")}
                    canApply={perms.print}
                    applying={applying === "print"}
                    disabled={!!applying}
                    onApply={() => apply(["print"], "print")}
                    extraLink={{ href: `/dashboard/${restaurantId}/print`, label: t("review.print.openTables") }}
                    print
                  />
                ) : (
                  <StepPlaceholder step={step("print")} brief={step("brief")} />
                )}
              </ReviewCard>
            )}
          </>
        ) : (
          <Card className="border-dashed lg:col-span-2">
            <CardBody className="flex items-start gap-3">
              <Lock size={18} className="mt-0.5 shrink-0 text-stone-400" aria-hidden />
              <div className="text-sm">
                <p className="font-medium text-stone-900">{t("review.upsell.title")}</p>
                <p className="text-stone-500">{t("review.upsell.hint")}</p>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
        <Button variant="ghost" onClick={onNew}>
          <Upload size={15} aria-hidden /> {t("review.newUpload")}
        </Button>
        <Link href={`/dashboard/${restaurantId}`} className={buttonClass("secondary")}>
          {t("review.toOverview")} <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function ReviewCard({
  icon: Icon,
  title,
  step,
  action,
  children,
}: {
  icon: typeof FileText;
  title: string;
  step?: KitStepDto;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations("kit");
  return (
    <Card className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-stone-100 px-5 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <Icon size={18} aria-hidden />
        </span>
        <h2 className="min-w-0 flex-1 font-semibold text-stone-900">{title}</h2>
        {step && step.status !== "done" && (
          <Badge tone={step.status === "failed" ? "red" : "neutral"}>{t(`status.${step.status}`)}</Badge>
        )}
        {action}
      </div>
      <CardBody className="flex-1">{children}</CardBody>
    </Card>
  );
}

function StepPlaceholder({ step, brief }: { step?: KitStepDto; brief?: KitStepDto }) {
  const t = useTranslations("kit");
  const errorText = useStepError();
  // a design that failed because the style analysis failed → show the analysis error
  const s = step?.status === "failed" && step.error === "dependency" && brief?.status === "failed" ? brief : step;
  if (s?.status === "failed")
    return (
      <p className="flex items-start gap-2 text-sm text-red-700">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {errorText(s.error)}
      </p>
    );
  return <p className="text-sm text-stone-500">{t("review.notAvailable")}</p>;
}

function LogoPanel({ restaurantId, job, canEdit, onChanged }: { restaurantId: string; job: KitJobDto; canEdit: boolean; onChanged: () => Promise<void> }) {
  const t = useTranslations("kit");
  const te = useTranslations("errors");
  const tm = useTranslations("media");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const shown = job.currentLogo ?? (job.logo ? { mediaId: job.logo.mediaId, url: job.logo.url } : null);
  const logoStep = job.steps.find((s) => s.key === "logo");
  const fromKit = !!job.logo && job.currentLogo?.mediaId === job.logo.mediaId;

  async function onFile(el: HTMLInputElement) {
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadMedia(restaurantId, file);
      if (!up.ok) return void toast.error(tm.has(`errors.${up.error}`) ? tm(`errors.${up.error}`) : te("unexpected"));
      const res = await setKitLogoAction({ restaurantId, mediaId: up.item.id });
      if (!res.ok) return void toast.error(te.has(res.error) ? te(res.error) : te("unexpected"));
      toast.success(t("review.logo.saved"));
      await onChanged();
    } catch {
      toast.error(te("unexpected"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-stone-200 bg-[repeating-conic-gradient(#f5f5f4_0%_25%,#fff_0%_50%)] bg-[length:16px_16px]">
        {shown?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown.url} alt={t("review.logo.title")} className="max-h-full max-w-full object-contain p-1.5" />
        ) : (
          <ImageIcon size={24} className="text-stone-300" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        <p className="text-stone-600">
          {fromKit
            ? t("review.logo.found")
            : shown
              ? t("review.logo.current")
              : logoStep?.status === "done"
                ? t("review.logo.notFound")
                : logoStep?.status === "failed"
                  ? t("review.logo.failed")
                  : t("review.logo.none")}
        </p>
        {canEdit && (
          <>
            <Button size="sm" variant="secondary" onClick={() => input.current?.click()} loading={busy}>
              <Upload size={14} aria-hidden /> {t("review.logo.other")}
            </Button>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onFile(e.currentTarget)} />
          </>
        )}
      </div>
    </div>
  );
}

function DesignPanel({
  restaurantId,
  design,
  applyLabel,
  appliedLabel,
  canApply,
  applying,
  disabled,
  onApply,
  extraLink,
  print,
}: {
  restaurantId: string;
  design: { id: string; versionId: string | null; name: string; summary: string | null; applied: boolean };
  applyLabel: string;
  appliedLabel: string;
  canApply: boolean;
  applying: boolean;
  disabled: boolean;
  onApply: () => void;
  extraLink?: { href: string; label: string };
  print?: boolean;
}) {
  const t = useTranslations("kit");
  return (
    <div className="flex gap-4">
      <MiniPreview
        cacheKey={`kit:${design.id}:${design.versionId ?? ""}:${design.applied ? 1 : 0}`}
        load={() => renderThemePreviewAction({ restaurantId, themeId: design.id })}
        title={design.name}
        className={cn("shrink-0 rounded-lg border border-stone-200", print ? "w-40" : "w-32")}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium text-stone-900">{design.name}</p>
        {design.summary && <p className="line-clamp-4 text-sm text-stone-600">{design.summary}</p>}
        <p className="text-xs text-stone-500">{t("review.draftHint")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {design.applied ? (
            <Badge tone="green">
              <CheckCircle2 size={13} aria-hidden /> {appliedLabel}
            </Badge>
          ) : (
            canApply && (
              <Button size="sm" onClick={onApply} loading={applying} disabled={disabled}>
                {applyLabel}
              </Button>
            )
          )}
          <Link href={`/dashboard/${restaurantId}/design/studio/${design.id}`} className={buttonClass("secondary", "sm")}>
            {t("review.openStudio")}
          </Link>
          {extraLink && design.applied && (
            <Link href={extraLink.href} className={buttonClass("ghost", "sm")}>
              {extraLink.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
