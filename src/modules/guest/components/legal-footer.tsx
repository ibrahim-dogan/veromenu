import { cn } from "@/core/utils";
import type { GuestT } from "../t";
import type { GuestMenuData } from "../types";
import { guestHref } from "./blocks";

/** Allergen letters + additive footnote numbers used on this menu (LMIV). */
export function AllergenLegend({ data, t, className }: { data: GuestMenuData; t: GuestT; className?: string }) {
  const { allergens, additives } = data.legend;
  if (!allergens.length && !additives.length) return null;
  return (
    <section aria-labelledby="vm-legend" className={cn("text-sm", className)}>
      <h2 id="vm-legend" className="font-g-display mb-2 text-base font-semibold">
        {t("allergenLegend")}
      </h2>
      <dl className="text-g-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {[...allergens, ...additives].map((a) => (
          <div key={a.code} className="contents">
            <dt className="text-g-text text-end font-semibold tabular-nums">{a.letter}</dt>
            <dd>{a.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function OpeningHours({ data, t, className }: { data: GuestMenuData; t: GuestT; className?: string }) {
  const hours = data.restaurant.openingHours;
  if (!hours.length) return null;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat(data.locale, { weekday: "long", timeZone: "UTC" });
  } catch {
    fmt = new Intl.DateTimeFormat("de", { weekday: "long", timeZone: "UTC" });
  }
  const days = [1, 2, 3, 4, 5, 6, 7];
  return (
    <section aria-labelledby="vm-hours" className={cn("text-sm", className)}>
      <h2 id="vm-hours" className="font-g-display mb-2 text-base font-semibold">
        {t("openingHours")}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {days.map((d) => {
          const slots = hours.filter((h) => h.day === d || (d === 7 && h.day === 0));
          return (
            <div key={d} className="contents">
              <dt className="text-g-muted">{fmt.format(new Date(Date.UTC(2024, 0, d)))}</dt>
              <dd className="tabular-nums">{slots.length ? slots.map((s) => `${s.open}–${s.close}`).join(", ") : t("closed")}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/**
 * Legal footer: price notice (PAngV), allergen notice (LMIV), restaurant imprint (DDG §5) and
 * VeroMenu privacy policy, "Powered by VeroMenu" on plans without custom branding.
 */
export function LegalFooter({ data, t, className, linkClassName }: { data: GuestMenuData; t: GuestT; className?: string; linkClassName?: string }) {
  const r = data.restaurant;
  const address = [r.address?.street, [r.address?.zip, r.address?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const link = cn("underline underline-offset-4 hover:no-underline", linkClassName);
  return (
    <footer className={cn("space-y-6 pt-10 pb-12 text-sm", className)}>
      <div className="space-y-1.5">
        <p>{r.currency === "EUR" ? t("pricesInclVat") : t("pricesInclVatGeneric")}</p>
        {(data.hasUnconfirmedAllergens || data.menuMode === "pdf") && <p>{t("allergenNotice")}</p>}
      </div>
      <AllergenLegend data={data} t={t} />
      <OpeningHours data={data} t={t} />
      {(address || r.phone || r.email || r.website) && (
        <address className="space-y-0.5 not-italic">
          <p className="font-g-display text-base font-semibold">{r.name}</p>
          {address && <p>{address}</p>}
          {r.phone && (
            <p>
              <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className={link}>
                {r.phone}
              </a>
            </p>
          )}
          {r.email && (
            <p>
              <a href={`mailto:${r.email}`} className={link}>
                {r.email}
              </a>
            </p>
          )}
          {r.website && (
            <p>
              <a href={/^https?:\/\//.test(r.website) ? r.website : `https://${r.website}`} className={link} rel="noopener" target="_blank">
                {r.website.replace(/^https?:\/\//, "")}
              </a>
            </p>
          )}
        </address>
      )}
      <nav aria-label={t("legalNav")} className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <a href={guestHref(data, { path: "/impressum" })} className={link}>
          {t("imprint")}
        </a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- other root layout: full navigation intended */}
        <a href="/datenschutz" className={link}>
          {t("privacy")}
        </a>
        {data.showBranding && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- other root layout
          <a href="/" className={cn(link, "ms-auto opacity-70")}>
            {t("poweredBy")}
          </a>
        )}
      </nav>
    </footer>
  );
}
