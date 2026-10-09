import { Globe, Check } from "lucide-react";
import { cn } from "@/core/utils";
import type { GuestT } from "../t";
import type { GuestMenuData } from "../types";
import { guestHref } from "./blocks";

/**
 * Language switcher without client JS: <details> popover with plain links (?lang=xx).
 * Only the owner's enabled languages are offered. The runtime tracks clicks (data-vm-locale).
 */
export function LanguageSwitcher({ data, t, className, buttonClassName, path }: { data: GuestMenuData; t: GuestT; className?: string; buttonClassName?: string; path?: string }) {
  if (data.availableLocales.length < 2) return null;
  const current = data.availableLocales.find((l) => l.code === data.locale) ?? data.availableLocales[0];
  return (
    <details data-vm-popover className={cn("group relative", className)}>
      <summary
        className={cn(
          "flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-full px-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden",
          buttonClassName,
        )}
        aria-label={`${t("language")}: ${current.native}`}
      >
        <Globe size={16} aria-hidden />
        <span aria-hidden>{current.code.toUpperCase()}</span>
      </summary>
      <ul className="bg-g-surface text-g-text border-g-border absolute end-0 top-full z-50 mt-2 max-h-[60vh] w-56 overflow-y-auto rounded-[var(--g-radius)] border py-1 shadow-xl">
        {data.availableLocales.map((l) => (
          <li key={l.code}>
            <a
              href={guestHref(data, { lang: l.code, path })}
              hrefLang={l.code}
              lang={l.code}
              dir={l.rtl ? "rtl" : "ltr"}
              data-vm-locale={l.code}
              aria-current={l.code === data.locale ? "true" : undefined}
              className="hover:bg-g-text/5 flex items-center gap-3 px-4 py-2.5 text-[15px]"
            >
              <span aria-hidden className="text-lg leading-none">
                {l.flag}
              </span>
              <span className="flex-1">{l.native}</span>
              {l.code === data.locale && <Check size={16} className="text-g-primary" aria-hidden />}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
