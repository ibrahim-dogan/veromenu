import { cn } from "@/core/utils";
import { makePriceFormatter } from "@/modules/guest/t";
import type { GuestItem } from "@/modules/guest/types";
import { GuestFrame } from "@/modules/guest/components/guest-frame";
import { CategoryNav } from "@/modules/guest/components/category-nav";
import { FilterBar } from "@/modules/guest/components/filter-bar";
import { LanguageSwitcher } from "@/modules/guest/components/language-switcher";
import { LegalFooter } from "@/modules/guest/components/legal-footer";
import { PdfMenu } from "@/modules/guest/components/pdf-menu";
import {
  AllergenMarks,
  ItemImage,
  ItemOpenButton,
  NoResults,
  OrderingNotice,
  QuickAddButton,
  ScheduleNote,
  SoldOutBadge,
  TagBadges,
  UnknownAllergenNote,
  VariantLine,
  allergenFilterOptions,
  categoryAttrs,
  itemAttrs,
  navCategories,
  priceLabel,
} from "@/modules/guest/components/blocks";
import { commonVars } from "../config";
import { fontPairingVars } from "../fonts";
import type { ThemeConfig, ThemeModule, ThemeProps } from "../types";
import manifest from "./manifest";

function cssVars(c: ThemeConfig) {
  return {
    "--g-bg": c.paperTexture ? "#f5eddd" : "#fbf8f2",
    "--g-surface": "#fffdf8",
    "--g-text": "#2a2118",
    "--g-muted": "#6f6253",
    "--g-border": "#e2d5bf",
    ...commonVars(c),
    ...fontPairingVars(String(c.fontPairing), "elegant"),
  };
}

function Ornament({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("text-g-accent flex items-center justify-center gap-3", className)}>
      <span className="h-px w-10 bg-current opacity-60" />
      <span className="text-sm">❦</span>
      <span className="h-px w-10 bg-current opacity-60" />
    </div>
  );
}

function ClassicItem({ item, config, t, price }: { item: GuestItem; config: ThemeConfig; t: ThemeProps["t"]; price: (c: number | null) => string }) {
  const leader = config.leaderStyle === "line" ? "border-solid border-b" : config.leaderStyle === "dots" ? "border-dotted border-b-2" : "border-0";
  const showImage = config.showImages && item.image;
  return (
    <li {...itemAttrs(item)} className={cn("relative flex items-start gap-4 py-[calc(var(--g-gap)/2)]", !item.available && "opacity-60")}>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <ItemOpenButton item={item} className="font-g-display min-w-0 text-[1.15rem] leading-snug font-semibold">
            {item.name}
            <AllergenMarks item={item} t={t} />
          </ItemOpenButton>
          <span aria-hidden className={cn("border-g-muted/40 min-w-6 flex-1 -translate-y-1", leader)} />
          <span className="font-g-display shrink-0 text-[1.05rem] font-semibold whitespace-nowrap tabular-nums">{priceLabel(item, price, t)}</span>
        </div>
        {item.description && <p className="text-g-muted mt-0.5 text-[0.95rem] leading-relaxed italic">{item.description}</p>}
        <VariantLine item={item} price={price} className="mt-1" />
        <div className="mt-1 flex flex-wrap items-center gap-2 empty:hidden">
          <SoldOutBadge item={item} t={t} />
          <TagBadges item={item} t={t} compact className="text-g-muted" />
          <UnknownAllergenNote item={item} t={t} />
        </div>
      </div>
      {showImage && <ItemImage image={item.image!} t={t} className="mt-1 h-20 w-20 shrink-0 rounded-[var(--g-radius)] shadow-sm ring-1 ring-black/5" sizes="80px" />}
      {item.orderable && <QuickAddButton item={item} t={t} className="mt-1 h-9 w-9" />}
    </li>
  );
}

function Classic({ data, config, t }: ThemeProps) {
  const price = makePriceFormatter(data.locale, data.restaurant.currency);
  const r = data.restaurant;
  return (
    <GuestFrame data={data} t={t} vars={cssVars(config)} className={cn(config.paperTexture && "vm-paper")}>
      <header className="mx-auto max-w-2xl px-5 pt-4 pb-6 text-center">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <OrderingNotice data={data} t={t} className="bg-g-surface border-g-border border" />
          <LanguageSwitcher data={data} t={t} className="ms-auto" buttonClassName="border-g-border bg-g-surface border" />
        </div>
        {r.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.logo.sm} alt="" width={88} height={88} className="mx-auto mt-4 h-22 w-22 rounded-full object-contain" />
        )}
        {r.cuisine && <p className="text-g-muted mt-5 text-xs tracking-[0.3em] uppercase">{r.cuisine}</p>}
        <h1 className="font-g-display mt-2 text-4xl leading-tight font-semibold text-balance sm:text-5xl">{r.name}</h1>
        <Ornament className="mt-4" />
      </header>

      {data.menuMode === "pdf" ? (
        <main id="vm-main" className="mx-auto max-w-2xl px-5">
          <PdfMenu data={data} t={t} />
        </main>
      ) : (
        <>
          <CategoryNav
            categories={navCategories(data)}
            className="bg-g-bg/95 border-g-border border-y backdrop-blur"
            listClassName="mx-auto max-w-2xl gap-6 px-5"
            linkClassName="border-b-2 py-3 text-[13px] font-semibold tracking-[0.12em] uppercase"
            activeClassName="border-g-primary text-g-primary"
            inactiveClassName="text-g-muted border-transparent"
          />
          <main id="vm-main" className="mx-auto max-w-2xl px-5">
            <FilterBar allergens={allergenFilterOptions(data.locale)} className="mt-5" />
            <NoResults t={t} />
            {data.menus.map((menu) => (
              <section key={menu.id} data-vm-menu aria-label={menu.name} className="mt-8">
                {data.menus.length > 1 && (
                  <header className="mb-2 text-center">
                    <h2 className="font-g-display text-3xl font-semibold">{menu.name}</h2>
                    {menu.description && <p className="text-g-muted mt-1 italic">{menu.description}</p>}
                    <ScheduleNote menu={menu} t={t} locale={data.locale} className="mt-1" />
                  </header>
                )}
                {data.menus.length === 1 && <ScheduleNote menu={menu} t={t} locale={data.locale} className="text-center" />}
                {menu.categories.map((c) => (
                  <section key={c.id} {...categoryAttrs(c.id)} aria-labelledby={`h-${c.id}`} className="scroll-mt-14 pt-8">
                    <header className="mb-4 text-center">
                      <h3 id={`h-${c.id}`} className="font-g-display text-g-primary text-[1.7rem] leading-tight font-semibold">
                        {c.name}
                      </h3>
                      {c.description && <p className="text-g-muted mt-1 text-[0.95rem] italic">{c.description}</p>}
                      <Ornament className="mt-3 scale-75" />
                    </header>
                    <ul className="space-y-[calc(var(--g-gap)/2)]">
                      {c.items.map((item) => (
                        <ClassicItem key={item.id} item={item} config={config} t={t} price={price} />
                      ))}
                    </ul>
                  </section>
                ))}
              </section>
            ))}
          </main>
        </>
      )}
      <div className="mx-auto max-w-2xl px-5">
        <Ornament className="mt-12" />
        <LegalFooter data={data} t={t} className="text-g-muted" />
      </div>
    </GuestFrame>
  );
}

const theme: ThemeModule = {
  manifest,
  Component: Classic,
  cssVars,
  rootClassName: (c) => (c.paperTexture ? "vm-paper" : ""),
};
export default theme;
