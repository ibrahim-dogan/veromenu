"use client";
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/core/i18n/navigation";
import { UI_LOCALES, localeInfo } from "@/core/i18n/locales";
import { updateMyLocale } from "@/modules/auth/actions";
import { cn } from "@/core/utils";

export function LocaleSwitcher({ className, persist }: { className?: string; persist?: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  return (
    <label className={cn("relative inline-flex items-center gap-1.5 text-sm text-stone-600", pending && "opacity-60", className)}>
      <Globe size={16} aria-hidden />
      <select
        aria-label="Language"
        value={locale}
        onChange={(e) => {
          const next = e.target.value as (typeof UI_LOCALES)[number];
          start(async () => {
            if (persist) await updateMyLocale({ locale: next });
            router.replace(pathname, { locale: next });
          });
        }}
        className="focus-ring cursor-pointer appearance-none rounded-md bg-transparent py-1 pr-1 font-medium"
      >
        {UI_LOCALES.map((l) => (
          <option key={l} value={l}>
            {localeInfo(l)?.native ?? l}
          </option>
        ))}
      </select>
    </label>
  );
}
