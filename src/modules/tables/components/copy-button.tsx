"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui";
import { toast } from "@/components/ui/toast";

/** Copies `value` to the clipboard (with a fallback for non-secure contexts). */
export function CopyButton({ value, label, ...props }: { value: string; label?: React.ReactNode } & Omit<ButtonProps, "onClick" | "value">) {
  const t = useTranslations("common");
  const [done, setDone] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setDone(true);
    toast.success(t("copied"));
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <Button type="button" variant="secondary" size="sm" onClick={copy} {...props}>
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {label ?? t("copy")}
    </Button>
  );
}
