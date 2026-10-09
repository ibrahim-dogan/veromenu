"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import type { AllergenStatus } from "@/core/db/schema";
import { Link } from "@/core/i18n/navigation";
import { Badge, Button } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { formatPrice } from "@/core/utils";
import type { EditorItem } from "./types";

/** cents → "12,50" for German price inputs. */
export const centsToInput = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

export function priceLabel(item: Pick<EditorItem, "priceCents" | "variants">, currency: string, onRequest: string) {
  if (item.variants.length) return item.variants.map((v) => `${v.name} ${formatPrice(v.priceCents, "de-DE", currency)}`).join(" · ");
  if (item.priceCents == null) return onRequest;
  return formatPrice(item.priceCents, "de-DE", currency);
}

const STATUS_TONE: Record<AllergenStatus, "neutral" | "purple" | "yellow" | "green"> = {
  unknown: "neutral",
  ai_suggested: "purple",
  needs_review: "yellow",
  confirmed: "green",
};

export function AllergenStatusBadge({ status, className }: { status: AllergenStatus; className?: string }) {
  const t = useTranslations("menu");
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      {t(`allergenStatus.${status}`)}
    </Badge>
  );
}

export function TranslationGapBadge({ restaurantId, locales, linkable }: { restaurantId: string; locales: string[] | undefined; linkable: boolean }) {
  const t = useTranslations("menu");
  if (!locales?.length) return null;
  const title = t("translationGap", { count: locales.length, locales: locales.map((l) => l.toUpperCase()).join(", ") });
  const inner = (
    <>
      <Languages size={12} aria-hidden />
      <span className="tabular-nums">{locales.length}</span>
    </>
  );
  const cls = "relative z-10 inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-600/20 ring-inset";
  return linkable ? (
    <Link href={`/dashboard/${restaurantId}/translations`} className={`${cls} hover:bg-sky-100`} title={title} aria-label={title} onClick={(e) => e.stopPropagation()}>
      {inner}
    </Link>
  ) : (
    <span className={cls} title={title} aria-label={title}>
      {inner}
    </span>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
  pending,
}: {
  open: boolean;
  title: React.ReactNode;
  message: React.ReactNode;
  confirmLabel: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
}) {
  const t = useTranslations("menu");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-stone-600">{message}</div>
    </Dialog>
  );
}

/** ui Dialog passes the native event to onClose – ignore close/cancel events bubbling up from nested dialogs. */
export function ownCloseOnly(close: () => void) {
  return (e?: unknown) => {
    const ev = e as { type?: string; target?: unknown; currentTarget?: unknown } | undefined;
    if (ev && (ev.type === "close" || ev.type === "cancel") && ev.target !== ev.currentTarget) return;
    close();
  };
}
