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

const BOARDS: Record<string, { bg: string; surface: string }> = {
  chalkboard: { bg: "#1c2320", surface: "#262e2a" },
  black: { bg: "#0b0b0c", surface: "#18181b" },
  navy: { bg: "#0d1424", surface: "#172038" },
};

function cssVars(c: ThemeConfig) {
  const b = BOARDS[String(c.board)] ?? BOARDS.chalkboard;
  return {
    "--g-bg": b.bg,
    "--g-surface": b.surface,
    "--g-text": "#f4f1e8",
    "--g-muted": "#b8b4a7",
    "--g-border": "#4a504c",
    ...commonVars(c),
    ...fontPairingVars(String(c.fontPairing), "chalk"),
  };
}

function BistroItem({ item, config, t, price }: { item: GuestItem; config: ThemeConfig; t: ThemeProps["t"]; price: (c: number | null) => string }) {
  const showImage = config.showImages && item.image;
  return (
    <li {...itemAttrs(item)} className={cn("border-g-border relative flex items-start gap-4 border-b border-dashed py-[var(--g-pad)] last:border-0", !item.available && "opacity-55")}>
      {showImage && <ItemImage image={item.image!} t={t} className="h-18 w-18 shrink-0 rounded-[var(--g-radius)] ring-1 ring-white/10" sizes="72px" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <ItemOpenButton item={item} className="min-w-0 text-[1.08rem] leading-snug font-semibold tracking-wide uppercase">
            {item.name}
            <AllergenMarks item={item} t={t} />
          </ItemOpenButton>
          <span className="text-g-primary shrink-0 text-lg font-bold whitespace-nowrap tabular-nums">{priceLabel(item, price, t)}</span>
        </div>
        {item.description && <p className="text-g-muted mt-1 text-[0.95rem] leading-relaxed">{item.description}</p>}
        <VariantLine item={item} price={price} className="mt-1" />
        <div className="mt-1.5 flex flex-wrap items-center gap-2 empty:hidden">
          <SoldOutBadge item={item} t={t} />
          <TagBadges item={item} t={t} className="text-g-muted" />
          <UnknownAllergenNote item={item} t={t} />
        </div>
      </div>
      {item.orderable && <QuickAddButton item={item} t={t} className="mt-0.5 h-9 w-9" />}
    </li>
  );
}

function Bistro({ data, config, t }: ThemeProps) {
  const price = makePriceFormatter(data.locale, data.restaurant.currency);
  const r = data.restaurant;
  const glow = config.neonGlow ? "vm-neon" : "";
  return (
    <GuestFrame data={data} t={t} vars={cssVars(config)} className={cn("[color-scheme:dark]", config.board === "chalkboard" && "vm-chalk")}>
      <header className="mx-auto max-w-2xl px-5 pt-4 pb-4">
        <div className="flex items-center justify-between gap-2">
          <OrderingNotice data={data} t={t} className="border-g-border border" />
          <LanguageSwitcher data={data} t={t} className="ms-auto" buttonClassName="border-g-border border" />
        </div>
        <div className="mt-6 text-center">
          {r.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.logo.sm} alt="" width={80} height={80} className="mx-auto mb-4 h-20 w-20 rounded-full bg-white/95 object-contain p-1" />
          )}
          <h1 className={cn("font-g-display text-g-accent text-5xl leading-none font-bold text-balance sm:text-6xl", glow)}>{r.name}</h1>
          {r.cuisine && <p className="text-g-muted mt-3 text-sm tracking-[0.25em] uppercase">{r.cuisine}</p>}
        </div>
      </header>

      {data.menuMode === "pdf" ? (
        <main id="vm-main" className="mx-auto max-w-2xl px-5 pt-4">
          <PdfMenu data={data} t={t} />
        </main>
      ) : (
        <>
          <CategoryNav
            categories={navCategories(data)}
            className="bg-g-bg/95 border-g-border border-b backdrop-blur"
            listClassName="mx-auto max-w-2xl gap-1 px-4 py-2"
            linkClassName="rounded-[var(--g-radius)] px-3 py-1.5 text-sm font-semibold tracking-widest uppercase"
            activeClassName={cn("text-g-accent border border-current", glow)}
            inactiveClassName="text-g-muted border border-transparent"
          />
          <main id="vm-main" className="mx-auto max-w-2xl px-5">
            <FilterBar allergens={allergenFilterOptions(data.locale)} className="mt-4" />
            <NoResults t={t} />
            {data.menus.map((menu) => (
              <section key={menu.id} data-vm-menu aria-label={menu.name} className="mt-8">
                {data.menus.length > 1 && (
                  <header className="mb-2 text-center">
                    <h2 className="font-g-display text-g-primary text-4xl">{menu.name}</h2>
                    <ScheduleNote menu={menu} t={t} locale={data.locale} />
                  </header>
                )}
                {data.menus.length === 1 && <ScheduleNote menu={menu} t={t} locale={data.locale} className="text-center" />}
                {menu.categories.map((c) => (
                  <section key={c.id} {...categoryAttrs(c.id)} aria-labelledby={`h-${c.id}`} className="scroll-mt-14 pt-8">
                    <header className="mb-2">
                      <h3 id={`h-${c.id}`} className={cn("font-g-display text-g-accent text-4xl leading-tight", glow)}>
                        {c.name}
                      </h3>
                      {c.description && <p className="text-g-muted mt-1">{c.description}</p>}
                    </header>
                    <ul>
                      {c.items.map((item) => (
                        <BistroItem key={item.id} item={item} config={config} t={t} price={price} />
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
        <LegalFooter data={data} t={t} className="text-g-muted border-g-border mt-12 border-t border-dashed" />
      </div>
    </GuestFrame>
  );
}

const theme: ThemeModule = {
  manifest,
  Component: Bistro,
  cssVars,
  rootClassName: (c) => cn("[color-scheme:dark]", c.board === "chalkboard" && "vm-chalk"),
};
export default theme;
