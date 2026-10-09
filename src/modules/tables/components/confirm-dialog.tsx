"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";

/** Small reusable confirmation dialog. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  danger,
  pending,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<unknown>;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  danger?: boolean;
  pending?: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} type="button">
            {t("cancel")}
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={pending} onClick={() => void onConfirm()} type="button">
            {confirmLabel ?? t("confirm")}
          </Button>
        </>
      }
    >
      {description && <p className="text-sm text-stone-600">{description}</p>}
      {children}
    </Dialog>
  );
}
