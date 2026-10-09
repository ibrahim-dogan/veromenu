"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Leaf, ShoppingBag, Info } from "lucide-react";
import { cn } from "@/core/utils";
import { DEMO_CHROME, DEMO_ITEMS, DEMO_LANGS, type DemoLang } from "./demo-menu";

/**
 * Stylised smartphone showing a guest menu (pure HTML/CSS, no images).
 * Cycles through guest languages until the visitor picks one; respects prefers-reduced-motion.
 */
export function PhoneMockup() {
  const ui = useLocale();
  const t = useTranslations("landing.mockup");
  const [lang, setLang] = useState<DemoLang>((DEMO_LANGS.find((l) => l.code === ui)?.code ?? "de") as DemoLang);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setLang((cur) => DEMO_LANGS[(DEMO_LANGS.findIndex((l) => l.code === cur) + 1) % DEMO_LANGS.length].code);
    }, 3200);
    return () => window.clearInterval(id);
  }, [auto]);

  const intl = DEMO_LANGS.find((l) => l.code === lang)!.intl;
  const price = (c: number) => new Intl.NumberFormat(intl, { style: "currency", currency: "EUR" }).format(c / 100);

  return (
    <div className="relative mx-auto w-[300px] sm:w-[320px]" role="group" aria-label={t("label")}>
      <style href="vm-mockup-kf" precedence="default">
        {"@keyframes vm-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}"}
      </style>
      {/* phone frame */}
      <div className="relative rounded-[3rem] bg-stone-900 p-[10px] shadow-[0_40px_80px_-20px_rgba(27,54,42,0.45),0_0_0_1px_rgba(0,0,0,0.08)]">
        <div className="absolute top-[18px] left-1/2 z-20 h-[22px] w-[92px] -translate-x-1/2 rounded-full bg-stone-900" aria-hidden />
        <div className="relative h-[610px] overflow-hidden rounded-[2.4rem] bg-[#fbf8f2]">
          {/* cover */}
          <div className="relative bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 px-5 pt-12 pb-5 text-white">
            <div
              className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:14px_14px]"
              aria-hidden
            />
            <p className="relative text-[11px] font-medium tracking-wide text-white/70 uppercase">Hamburg · {DEMO_CHROME.table[lang]}</p>
            <p className="relative mt-1 font-display text-[26px] leading-tight font-semibold">Gasthaus Lindenhof</p>
            {/* language chips */}
            <div className="relative mt-4 flex gap-1.5" aria-label={t("switchHint")}>
              {DEMO_LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    setAuto(false);
                    setLang(l.code);
                  }}
                  aria-pressed={lang === l.code}
                  className={cn(
                    "focus-ring rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase transition-colors",
                    lang === l.code ? "bg-white text-brand-800 shadow-sm" : "bg-white/15 text-white hover:bg-white/25",
                  )}
                >
                  <span aria-hidden>{l.flag}</span> {l.code}
                </button>
              ))}
            </div>
          </div>

          {/* tabs */}
          <div className="flex gap-4 border-b border-stone-200/80 bg-[#fbf8f2] px-5 pt-3 text-[12px] font-medium">
            {DEMO_CHROME.tabs.map((tab, i) => (
              <span key={i} className={cn("-mb-px border-b-2 pb-2", i === 0 ? "border-accent-500 text-stone-900" : "border-transparent text-stone-400")}>
                {tab[lang]}
              </span>
            ))}
          </div>

          {/* items */}
          <ul key={lang} className="animate-[vm-fade_.45s_ease-out] divide-y divide-stone-200/70 px-5">
            {DEMO_ITEMS.map((it, i) => (
              <li key={i} className="flex gap-3 py-3.5">
                <div className={cn("h-14 w-14 shrink-0 rounded-xl bg-gradient-to-br shadow-inner", it.hue)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] leading-snug font-semibold text-stone-900">{it.name[lang]}</p>
                    <p className="shrink-0 text-[13px] font-semibold text-brand-800 tabular-nums">{price(it.cents)}</p>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-[11.5px] text-stone-500">{it.desc[lang]}</p>
                  <div className="mt-1.5 flex items-center gap-1">
                    {it.vegan && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700">
                        <Leaf size={9} aria-hidden /> {DEMO_CHROME.vegan[lang]}
                      </span>
                    )}
                    {it.allergens.map((a) => (
                      <span key={a} className="grid h-4 w-4 place-items-center rounded-full bg-stone-200/80 text-[9px] font-bold text-stone-600">
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="mx-5 mt-1 flex items-start gap-1 text-[10px] leading-snug text-stone-400">
            <Info size={10} className="mt-px shrink-0" aria-hidden /> {DEMO_CHROME.staff[lang]}
          </p>

          {/* order bar */}
          <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl bg-stone-900 px-4 py-3 text-white shadow-lg">
            <span className="flex items-center gap-2 text-[12.5px] font-medium">
              <ShoppingBag size={15} aria-hidden /> {DEMO_CHROME.order[lang]}
            </span>
            <span className="rounded-full bg-accent-500 px-2 py-0.5 text-[11px] font-bold text-stone-900 tabular-nums">2 · {price(2300)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
