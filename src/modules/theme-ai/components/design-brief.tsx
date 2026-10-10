"use client";
import { useTranslations } from "next-intl";
import { FONT_LIBRARY } from "@/modules/theme-engine";
import type { DesignBrief } from "../brief";

/**
 * Read-only view of the AI design brief (result of generateThemeFromFiles → `brief`). Free-text fields are
 * already in the owner's UI locale; enum values are translated here (namespace `themeAi.brief`).
 * Usage in the studio: <DesignBriefView brief={res.data.brief as DesignBrief} />
 */
export function DesignBriefView({ brief, className }: { brief: DesignBrief; className?: string }) {
  const t = useTranslations("themeAi.brief");
  const family = (id: string) => FONT_LIBRARY.find((f) => f.id === id)?.family ?? id;
  const colors = ["background", "surface", "text", "muted", "primary", "accent"] as const;
  const L = brief.layout;
  const layoutChips = [
    t(`values.${L.columns}`),
    t(`values.${L.itemStyle}`),
    t(L.priceAlignment === "right" ? "values.priceRight" : L.priceAlignment === "inline" ? "values.priceInline" : "values.priceBelow"),
    t(`values.${L.alignment}`),
    t(`values.${L.density}`),
    ...(L.dottedLeaders ? [t("values.leaders")] : []),
  ];
  const text = (label: string, value: string) =>
    value && value.toLowerCase() !== "none" ? (
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</dt>
        <dd className="mt-0.5 text-sm text-stone-800">{value}</dd>
      </div>
    ) : null;

  return (
    <section className={`space-y-4 rounded-xl border border-stone-200 bg-white p-4 ${className ?? ""}`} aria-label={t("title")}>
      <div>
        <h3 className="text-sm font-semibold text-stone-900">{t("title")}</h3>
        <p className="mt-1 text-sm text-stone-700">{brief.summary}</p>
        {brief.mood.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("mood")}>
            {brief.mood.map((m) => (
              <li key={m} className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                {m}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-xs font-medium uppercase tracking-wide text-stone-500">{t("palette")}</h4>
        <ul className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {colors.map((c) => (
            <li key={c} className="text-center">
              <span className="block h-10 rounded-lg border border-stone-200" style={{ background: brief.palette[c] }} aria-hidden />
              <span className="mt-1 block text-xs text-stone-700">{t(`colors.${c}`)}</span>
              <span className="block font-mono text-[11px] text-stone-500">{brief.palette[c]}</span>
            </li>
          ))}
        </ul>
        {brief.paletteNotes && <p className="mt-1.5 text-xs text-stone-600">{brief.paletteNotes}</p>}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{t("typography")}</dt>
          <dd className="mt-0.5 space-y-0.5 text-sm text-stone-800">
            <div>
              {t("headlines")}: <strong>{family(brief.typography.headlineFont)}</strong>
              {brief.typography.headlineCase !== "normal" && ` · ${t(brief.typography.headlineCase === "uppercase" ? "values.uppercase" : "values.smallCaps")}`}
            </div>
            <div>
              {t("body")}: <strong>{family(brief.typography.bodyFont)}</strong>
            </div>
            {brief.typography.accentFont !== "none" && (
              <div>
                {t("accentFont")}: <strong>{family(brief.typography.accentFont)}</strong>
              </div>
            )}
            <div className="text-xs text-stone-600">{brief.typography.headlineDescription}</div>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{t("layout")}</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {layoutChips.map((c) => (
              <span key={c} className="rounded-md bg-stone-100 px-1.5 py-0.5 text-xs text-stone-700">
                {c}
              </span>
            ))}
          </dd>
          <dd className="mt-1 text-xs text-stone-600">{L.categoryHeaderStyle}</dd>
        </div>
        {text(t("ornaments"), brief.ornaments)}
        {text(t("textures"), brief.textures)}
        {text(t("header"), brief.header)}
        {text(t("imagery"), brief.imagery.style)}
        {brief.logo.present && text(t("logo"), brief.logo.description)}
        {text(t("notes"), brief.notes)}
      </dl>
    </section>
  );
}
