"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Code2, Copy, Download, Eye, SlidersHorizontal, Trash2, Wand2 } from "lucide-react";
import { Link, useRouter } from "@/core/i18n/navigation";
import { Badge, Button, buttonClass } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { useAction } from "@/components/use-action";
import { deleteThemeAction, duplicateThemeAction, exportThemeAction, renderThemePreviewAction, adoptLibraryThemeAction } from "../actions";
import { downloadText, themeStatus, type ThemeCardData } from "../lib/client";
import { MiniPreview } from "./mini-preview";
import { SandboxFrame } from "./sandbox-frame";

export function StatusBadges({ theme }: { theme: Pick<ThemeCardData, "isActive" | "publishedVersionId" | "currentVersionId"> }) {
  const t = useTranslations("themeStudio.status");
  return (
    <>
      {themeStatus(theme).map((s) => (
        <Badge key={s} tone={s === "active" ? "green" : s === "unpublished" ? "yellow" : "neutral"}>
          {t(s)}
        </Badge>
      ))}
    </>
  );
}

/** Card of a restaurant's own studio theme. */
export function OwnThemeCard({ restaurantId, theme }: { restaurantId: string; theme: ThemeCardData }) {
  const t = useTranslations("themeStudio.hub");
  const f = useFormatter();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const studio = `/dashboard/${restaurantId}/design/studio/${theme.id}`;
  const dup = useAction(duplicateThemeAction, { success: t("duplicated") });
  const del = useAction(deleteThemeAction, { success: t("deleted"), onSuccess: () => setConfirmDelete(false) });
  const exp = useAction(exportThemeAction, { refresh: false, onSuccess: (d) => downloadText(d.fileName, d.json) });

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <Link href={studio} className="focus-ring block" aria-label={t("openStudio", { name: theme.name })}>
        <MiniPreview
          cacheKey={`${theme.id}:${theme.currentVersionId}:${theme.isActive}`}
          load={() => renderThemePreviewAction({ restaurantId, themeId: theme.id })}
          title={theme.name}
          height={640}
        />
      </Link>
      <div className="flex flex-1 flex-col gap-3 border-t border-stone-100 p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="mr-auto font-semibold text-stone-900">{theme.name}</h3>
            <StatusBadges theme={theme} />
          </div>
          {theme.description && <p className="line-clamp-2 text-xs text-stone-500">{theme.description}</p>}
          <p className="text-[11px] text-stone-400">
            {t(`origin_${theme.origin}` as "origin_manual")} · {t("updated", { date: f.dateTime(new Date(theme.updatedAt), { dateStyle: "medium", timeStyle: "short" }) })}
          </p>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <Link href={`${studio}?panel=customize`} className={buttonClass("secondary", "sm")}>
            <SlidersHorizontal size={14} aria-hidden /> {t("customize")}
          </Link>
          <Link href={studio} className={buttonClass("secondary", "sm")}>
            <Code2 size={14} aria-hidden /> {t("editCode")}
          </Link>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="icon" title={t("duplicate")} aria-label={t("duplicate")} loading={dup.pending} onClick={() => dup.run({ restaurantId, themeId: theme.id })}>
              {!dup.pending && <Copy size={15} />}
            </Button>
            <Button variant="ghost" size="icon" title={t("export")} aria-label={t("export")} loading={exp.pending} onClick={() => exp.run({ restaurantId, themeId: theme.id })}>
              {!exp.pending && <Download size={15} />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={theme.isActive ? t("deleteActiveHint") : t("delete")}
              aria-label={t("delete")}
              disabled={theme.isActive}
              onClick={() => setConfirmDelete(true)}
              className="text-red-600 hover:bg-red-50"
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </div>
      </div>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        title={t("deleteTitle", { name: theme.name })}
        description={t("deleteHint")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t("cancel")}
            </Button>
            <Button variant="danger" loading={del.pending} onClick={() => del.run({ restaurantId, themeId: theme.id }).then((r) => r.ok && router.refresh())}>
              {t("delete")}
            </Button>
          </>
        }
      />
    </article>
  );
}

/** Platform library theme (or shipped starter) → "Verwenden" copies it into the restaurant's themes. */
export function LibraryThemeCard({
  restaurantId,
  theme,
  starterKey,
}: {
  restaurantId: string;
  theme: { id?: string; name: string; description: string | null; currentVersionId?: string | null };
  starterKey?: string;
}) {
  const t = useTranslations("themeStudio.hub");
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const adopt = useAction(adoptLibraryThemeAction, {
    success: t("usedTemplate"),
    refresh: false,
    onSuccess: (d) => router.push(`/dashboard/${restaurantId}/design/studio/${d.themeId}?panel=customize`),
  });
  const prev = useAction(renderThemePreviewAction, { refresh: false, onSuccess: (d) => setPreview(d.html) });
  const load = theme.id ? () => renderThemePreviewAction({ restaurantId, themeId: theme.id! }) : null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      {load ? (
        <MiniPreview cacheKey={`lib:${theme.id}:${theme.currentVersionId}`} load={load} title={theme.name} height={640} />
      ) : (
        <div className="grid aspect-[390/640] place-items-center bg-gradient-to-br from-brand-50 to-accent-50 text-brand-700">
          <Wand2 size={28} aria-hidden />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-3 border-t border-stone-100 p-4">
        <div>
          <h3 className="font-semibold text-stone-900">{theme.name}</h3>
          {theme.description && <p className="mt-1 line-clamp-3 text-xs text-stone-500">{theme.description}</p>}
        </div>
        <div className="mt-auto flex gap-2">
          <Button size="sm" loading={adopt.pending} onClick={() => adopt.run({ restaurantId, libraryThemeId: theme.id, starterKey })}>
            {t("use")}
          </Button>
          {theme.id && (
            <Button size="sm" variant="secondary" loading={prev.pending} onClick={() => prev.run({ restaurantId, themeId: theme.id! })}>
              <Eye size={14} aria-hidden /> {t("preview")}
            </Button>
          )}
        </div>
      </div>
      <Dialog open={!!preview} onClose={() => setPreview(null)} size="lg" title={theme.name} description={t("previewHint")}>
        {preview && (
          <div className="mx-auto h-[70vh] max-w-[420px] overflow-hidden rounded-2xl border border-stone-200">
            <SandboxFrame html={preview} title={theme.name} className="h-full w-full" />
          </div>
        )}
      </Dialog>
    </article>
  );
}
