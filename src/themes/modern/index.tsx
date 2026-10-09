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
    "--g-bg": "#f4f4f1",
    "--g-surface": "#ffffff",
    "--g-text": "#151515",
    "--g-muted": "#666660",
    "--g-border": "#e4e4df",
    ...commonVars(c),
    ...fontPairingVars(String(c.fontPairing), "modern"),
  };
}

function ModernCard({ item, config, t, price }: { item: GuestItem; config: ThemeConfig; t: ThemeProps["t"]; price: (c: number | null) => string }) {
  const grid = config.layout === "grid";
  const showImage = !!(config.showImages && item.image);
  const p = priceLabel(item, price, t);
  return (
    <li
      {...itemAttrs(item)}
      className={cn(
        "bg-g-surface relative flex overflow-hidden rounded-[var(--g-radius)] shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_16px_-8px_rgb(0_0_0/0.12)] transition-shadow",
        grid ? "flex-col" : "flex-row-reverse items-stretch",
        !item.available && "opacity-60",
      )}
    >
      {showImage && (
        <ItemImage
          image={item.image!}
          t={t}
          className={grid ? "aspect-[16/10] w-full" : "my-[var(--g-pad)] me-[var(--g-pad)] aspect-square w-28 shrink-0 rounded-[calc(var(--g-radius)*0.75)] sm:w-32"}
          sizes={grid ? "(min-width: 640px) 360px, 100vw" : "128px"}
          size={grid ? "md" : "sm"}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-[var(--g-pad)]">
        <div className="flex items-start gap-2">
          <ItemOpenButton item={item} className="font-g-display min-w-0 flex-1 text-[1.05rem] leading-snug font-bold tracking-tight">
            {item.name}
            <AllergenMarks item={item} t={t} />
          </ItemOpenButton>
        </div>
        {item.description && <p className="text-g-muted line-clamp-2 text-sm leading-relaxed">{item.description}</p>}
        <VariantLine item={item} price={price} />
        <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
          <SoldOutBadge item={item} t={t} />
          <TagBadges item={item} t={t} badgeClassName="bg-g-bg border-0 text-g-text" />
          <UnknownAllergenNote item={item} t={t} />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {p ? <span className="text-g-text text-base font-bold tabular-nums">{p}</span> : <span />}
          <QuickAddButton item={item} t={t} />
        </div>
      </div>
    </li>
  );
}

function Modern({ data, config, t }: ThemeProps) {
  const price = makePriceFormatter(data.locale, data.restaurant.currency);
  const r = data.restaurant;
  const hero = config.heroStyle !== "compact" && r.cover;
  const grid = config.layout === "grid";
  return (
    <GuestFrame data={data} t={t} vars={cssVars(config)}>
      {hero ? (
        <header className="relative">
          <div className="relative aspect-[16/10] max-h-[46vh] w-full overflow-hidden bg-black sm:aspect-[21/9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.cover!.md} srcSet={`${r.cover!.sm} 480w, ${r.cover!.md} 1200w`} sizes="100vw" alt="" fetchPriority="high" className="absolute inset-0 h-full w-full object-cover opacity-90" />
            {r.cover!.isAi && <span className="absolute end-3 bottom-3 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{t("aiImage")}</span>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/30" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
              <OrderingNotice data={data} t={t} className="bg-white/90 text-stone-900 backdrop-blur" />
              <LanguageSwitcher data={data} t={t} className="ms-auto" buttonClassName="bg-white/90 text-stone-900 backdrop-blur" />
            </div>
            <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-3xl items-end gap-4 px-5 pb-5 text-white">
              {r.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.logo.sm} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-lg" />
              )}
              <div className="min-w-0">
                <h1 className="font-g-display text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">{r.name}</h1>
                {r.cuisine && <p className="mt-0.5 text-sm text-white/80">{r.cuisine}</p>}
              </div>
            </div>
          </div>
        </header>
      ) : (
        <header className="mx-auto max-w-3xl px-5 pt-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <OrderingNotice data={data} t={t} className="bg-g-surface shadow-sm" />
            <LanguageSwitcher data={data} t={t} className="ms-auto" buttonClassName="bg-g-surface shadow-sm" />
          </div>
          <div className="mt-4 flex items-center gap-4">
            {r.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.logo.sm} alt="" width={64} height={64} className="bg-g-surface h-16 w-16 shrink-0 rounded-2xl object-contain p-1 shadow-sm" />
            )}
            <div className="min-w-0">
              <h1 className="font-g-display text-3xl leading-tight font-extrabold tracking-tight text-balance">{r.name}</h1>
              {r.cuisine && <p className="text-g-muted mt-0.5 text-sm">{r.cuisine}</p>}
            </div>
          </div>
        </header>
      )}

      {data.menuMode === "pdf" ? (
        <main id="vm-main" className="mx-auto max-w-3xl px-4 pt-6">
          <PdfMenu data={data} t={t} />
        </main>
      ) : (
        <>
          <CategoryNav
            categories={navCategories(data)}
            className="bg-g-bg/90 mt-3 backdrop-blur-md"
            listClassName="mx-auto max-w-3xl px-4 py-2.5"
            linkClassName="rounded-full px-4 py-2 text-sm font-semibold transition-colors"
            activeClassName="bg-g-primary text-g-on-primary shadow-sm"
            inactiveClassName="bg-g-surface text-g-text shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
          />
          <main id="vm-main" className="mx-auto max-w-3xl px-4">
            <FilterBar allergens={allergenFilterOptions(data.locale)} className="mt-3" />
            <NoResults t={t} />
            {data.menus.map((menu) => (
              <section key={menu.id} data-vm-menu aria-label={menu.name} className="mt-6">
                {data.menus.length > 1 && (
                  <header className="mb-1 px-1">
                    <h2 className="font-g-display text-g-accent text-sm font-bold tracking-[0.15em] uppercase">{menu.name}</h2>
                    <ScheduleNote menu={menu} t={t} locale={data.locale} />
                  </header>
                )}
                {data.menus.length === 1 && <ScheduleNote menu={menu} t={t} locale={data.locale} className="px-1" />}
                {menu.categories.map((c) => (
                  <section key={c.id} {...categoryAttrs(c.id)} aria-labelledby={`h-${c.id}`} className="scroll-mt-16 pt-6">
                    <header className="mb-3 flex items-baseline justify-between gap-3 px-1">
                      <h3 id={`h-${c.id}`} className="font-g-display text-2xl font-extrabold tracking-tight">
                        {c.name}
                      </h3>
                      <span className="text-g-muted text-sm tabular-nums">{c.items.length}</span>
                    </header>
                    {c.description && <p className="text-g-muted -mt-2 mb-3 px-1 text-sm">{c.description}</p>}
                    <ul className={cn("grid gap-[calc(var(--g-gap)*0.75)]", grid && "sm:grid-cols-2")}>
                      {c.items.map((item) => (
                        <ModernCard key={item.id} item={item} config={config} t={t} price={price} />
                      ))}
                    </ul>
                  </section>
                ))}
              </section>
            ))}
          </main>
        </>
      )}
      <div className="mx-auto max-w-3xl px-5">
        <LegalFooter data={data} t={t} className="text-g-muted border-g-border mt-12 border-t" />
      </div>
    </GuestFrame>
  );
}

const theme: ThemeModule = { manifest, Component: Modern, cssVars };
export default theme;
