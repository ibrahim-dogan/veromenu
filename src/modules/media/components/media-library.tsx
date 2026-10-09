"use client";
import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, FileText, Images, Pencil, Sparkles, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { useAction } from "@/components/use-action";
import { deleteMediaAction, updateMediaAltAction } from "../actions";
import type { MediaDto, MediaUsage } from "../service";
import { Dropzone } from "./dropzone";
import { formatBytes, invalidateMedia, isPdf } from "./media-client";
import { Thumb } from "./media-picker";

type Row = MediaDto & { usage: MediaUsage };
type Filter = "all" | "upload" | "ai_generated" | "pdf";

const usageCount = (u: MediaUsage) => u.items + u.categories + u.menus + u.branding;

export function MediaLibrary({ restaurantId, items }: { restaurantId: string; items: Row[] }) {
  const t = useTranslations("media");
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [deleting, setDeleting] = React.useState<Row | null>(null);

  const counts = {
    all: items.length,
    upload: items.filter((m) => m.kind === "upload" && !isPdf(m)).length,
    ai_generated: items.filter((m) => m.kind === "ai_generated").length,
    pdf: items.filter((m) => isPdf(m)).length,
  };
  const list = items.filter((m) =>
    filter === "all" ? true : filter === "pdf" ? isPdf(m) : filter === "upload" ? m.kind === "upload" && !isPdf(m) : m.kind === filter,
  );

  return (
    <div className="space-y-6">
      <Dropzone restaurantId={restaurantId} accept="any" onUploaded={() => router.refresh()} />

      <Tabs<Filter>
        value={filter}
        onChange={setFilter}
        items={(["all", "upload", "ai_generated", "pdf"] as const).map((f) => ({
          value: f,
          label: t(f === "all" ? "filterAll" : f === "upload" ? "filterUploads" : f === "pdf" ? "filterPdf" : "filterAi"),
          badge: <span className="rounded-full bg-stone-100 px-1.5 text-xs text-stone-600 tabular-nums">{counts[f]}</span>,
        }))}
      />

      {list.length === 0 ? (
        <EmptyState icon={<Images size={32} />} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((m) => {
            const used = usageCount(m.usage);
            return (
              <li key={m.id} className="group overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
                <a href={m.url} target="_blank" rel="noreferrer" className="relative block aspect-square bg-stone-50" aria-label={t("openOriginal")}>
                  <Thumb item={m} />
                  {m.kind === "ai_generated" && (
                    <Badge tone="purple" className="absolute top-2 left-2 bg-violet-50/95">
                      <Sparkles size={12} aria-hidden /> {t("aiBadge")}
                    </Badge>
                  )}
                </a>
                <div className="space-y-2 p-3">
                  <p className={m.alt ? "line-clamp-2 text-sm text-stone-700" : "text-sm text-stone-400 italic"}>{m.alt || t("noAlt")}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                    {isPdf(m) ? (
                      <span className="inline-flex items-center gap-1">
                        <FileText size={12} aria-hidden /> PDF
                      </span>
                    ) : (
                      m.width && <span>{m.width}×{m.height}</span>
                    )}
                    <span aria-hidden>·</span>
                    <span>{formatBytes(m.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {used > 0 ? <Badge tone="green">{t("usedIn", { count: used })}</Badge> : <Badge>{t("unused")}</Badge>}
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(m)} aria-label={t("editDetails")}>
                        <Pencil size={15} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => setDeleting(m)} aria-label={t("delete")}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <EditDialog restaurantId={restaurantId} item={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteDialog restaurantId={restaurantId} item={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function EditDialog({ restaurantId, item, onClose }: { restaurantId: string; item: Row; onClose: () => void }) {
  const t = useTranslations("media");
  const format = useFormatter();
  const [alt, setAlt] = React.useState(item.alt ?? "");
  const { run, pending } = useAction(updateMediaAltAction, {
    success: t("saved"),
    onSuccess: () => {
      invalidateMedia(restaurantId);
      onClose();
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("editDetails")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button loading={pending} onClick={() => run({ restaurantId, mediaId: item.id, alt: alt.trim() || null })}>
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run({ restaurantId, mediaId: item.id, alt: alt.trim() || null });
        }}
      >
        {!isPdf(item) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.variants.md ?? item.url} alt={item.alt ?? ""} className="max-h-64 w-full rounded-lg bg-stone-50 object-contain" />
        )}
        <Field label={t("altLabel")} hint={t("altHint")} htmlFor="media-alt">
          <Input id="media-alt" value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} />
        </Field>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-stone-500">{t("uploadedAt")}</dt>
          <dd>{format.dateTime(new Date(item.createdAt), { dateStyle: "medium", timeStyle: "short" })}</dd>
          <dt className="text-stone-500">{t("size")}</dt>
          <dd>
            {formatBytes(item.sizeBytes)}
            {item.width ? ` · ${item.width}×${item.height}` : ""}
          </dd>
          {item.kind === "ai_generated" && (
            <>
              <dt className="text-stone-500">{t("aiModel")}</dt>
              <dd className="break-all">{item.aiModel ?? "–"}</dd>
              <dt className="text-stone-500">{t("aiPrompt")}</dt>
              <dd className="text-stone-700">{item.aiPrompt ?? "–"}</dd>
            </>
          )}
        </dl>
        {item.kind === "ai_generated" && (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">{t("aiTransparency")}</p>
        )}
        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
          <ExternalLink size={14} aria-hidden /> {t("openOriginal")}
        </a>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ restaurantId, item, onClose }: { restaurantId: string; item: Row; onClose: () => void }) {
  const t = useTranslations("media");
  const used = usageCount(item.usage);
  const { run, pending } = useAction(deleteMediaAction, {
    success: t("deleted"),
    onSuccess: () => {
      invalidateMedia(restaurantId);
      onClose();
    },
  });
  const parts = [
    item.usage.items && t("usageItems", { count: item.usage.items }),
    item.usage.categories && t("usageCategories", { count: item.usage.categories }),
    item.usage.menus && t("usageMenus", { count: item.usage.menus }),
    item.usage.branding && t("usageBranding"),
  ].filter(Boolean) as string[];
  return (
    <Dialog
      open
      size="sm"
      onClose={onClose}
      title={t("deleteTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="danger" loading={pending} onClick={() => run({ restaurantId, mediaId: item.id, force: true })}>
            {used ? t("deleteAnyway") : t("delete")}
          </Button>
        </>
      }
    >
      {used > 0 ? (
        <div className="flex gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{t("deleteInUse")}</p>
            <ul className="mt-1 list-disc ps-5">
              {parts.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="mt-2">{t("deleteInUseHint")}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-600">{t("deleteConfirm")}</p>
      )}
    </Dialog>
  );
}
