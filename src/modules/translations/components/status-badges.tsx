"use client";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";
import type { EffectiveStatus } from "../service";

export function scoreTone(score: number | null | undefined) {
  if (score == null) return "neutral" as const;
  if (score >= 4.5) return "green" as const;
  if (score >= 3.5) return "blue" as const;
  if (score >= 2.5) return "yellow" as const;
  return "red" as const;
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  const t = useTranslations("translations");
  if (score == null) return <Badge tone="neutral">{t("noScore")}</Badge>;
  return (
    <Badge tone={scoreTone(score)} title={t("scoreHint")}>
      {t("score", { value: score.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}
    </Badge>
  );
}

const STATUS_TONE: Record<EffectiveStatus, "green" | "blue" | "yellow" | "red" | "neutral" | "purple"> = {
  approved: "green",
  machine: "blue",
  needs_review: "red",
  stale: "yellow",
  missing: "neutral",
};

export function TranslationStatusBadge({ status, human }: { status: EffectiveStatus; human?: boolean }) {
  const t = useTranslations("translations");
  return <Badge tone={STATUS_TONE[status]}>{status === "approved" && human ? t("status.approvedHuman") : t(`status.${status}`)}</Badge>;
}
