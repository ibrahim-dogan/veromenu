import "server-only";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/core/utils";
import { guestFontVariables } from "@/themes/fonts";
import { getGuestMessages } from "../i18n";
import type { GuestT } from "../t";
import type { ClientItem, GuestMenuData } from "../types";
import { GuestRuntime } from "./runtime";

export function toClientItems(data: GuestMenuData): ClientItem[] {
  return data.menus.flatMap((m) =>
    m.categories.flatMap((c) =>
      c.items.map((i) => ({
        id: i.id,
        c: i.categoryId,
        n: i.name,
        d: i.description,
        p: i.priceCents,
        v: i.variants,
        img: i.image?.md ?? null,
        ai: !!i.image?.isAi,
        t: i.tags,
        ac: i.allergensConfirmed,
        al: i.allergens,
        ad: i.additives,
        av: i.available,
        o: i.orderable,
      })),
    ),
  );
}

/**
 * Root of every theme: language + direction, CSS variables, fonts, skip link and the client runtime
 * (detail sheet, cart, beacons). Themes put their layout inside.
 */
export function GuestFrame({
  data,
  t,
  vars,
  className,
  children,
}: {
  data: GuestMenuData;
  t: GuestT;
  vars: Record<string, string>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div lang={data.locale} dir={data.dir} style={vars as CSSProperties} className={cn(guestFontVariables, "vm-root bg-g-bg text-g-text font-g-body min-h-dvh", className)}>
      <a href="#vm-main" className="bg-g-primary text-g-on-primary sr-only z-50 rounded-full px-4 py-2 focus:not-sr-only focus:fixed focus:start-3 focus:top-3">
        {t("skipToMenu")}
      </a>
      <GuestRuntime
        init={{
          slug: data.restaurant.slug,
          restaurantId: data.restaurant.id,
          locale: data.locale,
          currency: data.restaurant.currency,
          tableToken: data.tableToken,
          tableLabel: data.table?.label ?? null,
          ordering: data.ordering,
          preview: data.preview,
          track: !data.preview,
          items: toClientItems(data),
          messages: getGuestMessages(data.locale),
        }}
      >
        {children}
      </GuestRuntime>
    </div>
  );
}
