"use client";
import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { Badge, Input } from "@/components/ui";
import { cn } from "@/core/utils";
import type { ModelInfo } from "@/core/ai/models";

export type CapabilityResult = { result: "ok" | "missing" | "unknown"; missing: string[] };

/** Client copy of core/ai/models.checkCapability (pure function, no server deps). */
export function checkCapabilityClient(capability: string, m: ModelInfo | undefined): CapabilityResult {
  if (!m || !m.input || !m.output) return { result: "unknown", missing: [] };
  const missing: string[] = [];
  for (const need of capability.split("+")) {
    if (need === "text" && !m.output.includes("text")) missing.push("text output");
    if (need === "json" && m.supportsStructured === false) missing.push("structured output");
    if (need === "vision" && !m.input.includes("image")) missing.push("image input");
    if (need === "pdf" && !m.input.includes("file") && !m.input.includes("image")) missing.push("file input");
    if (need === "image-output" && !m.output.includes("image")) missing.push("image output");
    if (need === "audio-input" && !m.input.includes("audio")) missing.push("audio input");
  }
  return { result: missing.length ? "missing" : "ok", missing };
}

export const fmtPrice = (n: number | null) =>
  n == null ? "–" : n === 0 ? "0" : `$${n < 0.1 ? n.toFixed(3) : n < 10 ? n.toFixed(2) : n.toFixed(0)}`;

export function ModalityBadges({ m }: { m: ModelInfo }) {
  if (!m.input || !m.output) return null;
  const ins = m.input.filter((x) => x !== "text");
  const outs = m.output.filter((x) => x !== "text");
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ins.map((x) => (
        <Badge key={`i-${x}`} tone="blue" className="px-1.5 py-0 text-[10px]">
          {x}→
        </Badge>
      ))}
      {outs.map((x) => (
        <Badge key={`o-${x}`} tone="purple" className="px-1.5 py-0 text-[10px]">
          →{x}
        </Badge>
      ))}
    </span>
  );
}

export function CapabilityNote({ capability, model }: { capability: string; model: ModelInfo | undefined }) {
  const t = useTranslations("adminAi");
  const c = checkCapabilityClient(capability, model);
  if (c.result === "ok")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <CheckCircle2 size={13} /> {t("capOk")}
      </span>
    );
  if (c.result === "missing")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
        <AlertTriangle size={13} /> {t("capMissing", { list: c.missing.join(", ") })}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-stone-500">
      <HelpCircle size={13} /> {t("capUnknown")}
    </span>
  );
}

export function ModelPicker({
  value,
  onChange,
  models,
  capability,
  label,
  placeholder,
  allowEmpty,
}: {
  value: string;
  onChange: (v: string) => void;
  models: ModelInfo[] | null;
  capability: string;
  label: string;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const t = useTranslations("adminAi");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const query = (q ?? "").toLowerCase().trim();
  const matches = useMemo(() => {
    if (!models) return [];
    const terms = query.split(/\s+/).filter(Boolean);
    return models.filter((m) => terms.every((term) => m.id.toLowerCase().includes(term) || (m.name ?? "").toLowerCase().includes(term))).slice(0, 60);
  }, [models, query]);
  const selected = models?.find((m) => m.id === value);

  function pick(v: string) {
    onChange(v);
    setQ(null);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        value={q ?? value}
        placeholder={open && value ? value : (placeholder ?? t("modelSearch"))}
        className="h-9 font-mono text-xs"
        onFocus={() => {
          setOpen(true);
          setQ("");
          setActive(0);
        }}
        onBlur={() =>
          setTimeout(() => {
            setOpen(false);
            if (q !== null && q.trim() && !models?.length) onChange(q.trim());
            setQ(null);
          }, 150)
        }
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (matches[active]) pick(matches[active].id);
            else if (q?.trim()) pick(q.trim());
          } else if (e.key === "Escape") {
            setOpen(false);
            setQ(null);
          }
        }}
      />
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full min-w-[22rem] overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 text-xs shadow-xl"
        >
          {allowEmpty && (
            <li role="option" aria-selected={!value} className="cursor-pointer px-3 py-1.5 text-stone-500 hover:bg-stone-50" onMouseDown={() => pick("")}>
              {t("noFallback")}
            </li>
          )}
          {models === null && <li className="px-3 py-2 text-stone-500">{t("modelsLoading")}</li>}
          {models !== null && matches.length === 0 && (
            <li className="px-3 py-2 text-stone-500">{q?.trim() ? t("modelCustom", { id: q.trim() }) : t("modelsNone")}</li>
          )}
          {matches.map((m, i) => {
            const cap = checkCapabilityClient(capability, m);
            return (
              <li
                key={m.id}
                role="option"
                aria-selected={m.id === value}
                onMouseDown={() => pick(m.id)}
                onMouseEnter={() => setActive(i)}
                className={cn("cursor-pointer px-3 py-1.5", i === active ? "bg-brand-50" : "hover:bg-stone-50", cap.result === "missing" && "opacity-60")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-stone-900">{m.id}</span>
                  {cap.result === "missing" && <AlertTriangle size={12} className="shrink-0 text-red-600" aria-label={t("capMissing", { list: cap.missing.join(", ") })} />}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                  <span className="tabular-nums">
                    {t("pricePerM", { input: fmtPrice(m.promptPerM), output: fmtPrice(m.completionPerM) })}
                  </span>
                  {m.contextLength ? <span>{Math.round(m.contextLength / 1000)}k ctx</span> : null}
                  <ModalityBadges m={m} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {value && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
          {selected ? (
            <>
              <span className="tabular-nums">{t("pricePerM", { input: fmtPrice(selected.promptPerM), output: fmtPrice(selected.completionPerM) })}</span>
              <ModalityBadges m={selected} />
            </>
          ) : models && models.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangle size={12} /> {t("modelNotListed")}
            </span>
          ) : null}
          <CapabilityNote capability={capability} model={selected} />
        </div>
      )}
    </div>
  );
}
