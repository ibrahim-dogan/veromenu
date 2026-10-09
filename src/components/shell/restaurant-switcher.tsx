"use client";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, Plus, Store } from "lucide-react";
import { Link } from "@/core/i18n/navigation";

export function RestaurantSwitcher({ current, list }: { current: { id: string; name: string }; list: { id: string; name: string }[] }) {
  const t = useTranslations("nav");
  return (
    <details className="relative px-1">
      <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-2 text-sm hover:bg-stone-50">
        <Store size={16} className="text-brand-700" />
        <span className="flex-1 truncate font-medium">{current.name}</span>
        <ChevronsUpDown size={14} className="text-stone-400" />
      </summary>
      <div className="absolute inset-x-1 z-50 mt-1 rounded-xl border border-stone-200 bg-white p-1 shadow-lg">
        <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase text-stone-400">{t("switchRestaurant")}</p>
        {list.map((r) => (
          <Link key={r.id} href={`/dashboard/${r.id}`} className="block truncate rounded-lg px-2.5 py-1.5 text-sm hover:bg-stone-100">
            {r.name}
          </Link>
        ))}
        <Link href="/dashboard" className="mt-1 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-brand-700 hover:bg-brand-50">
          <Plus size={14} /> {t("newRestaurant")}
        </Link>
      </div>
    </details>
  );
}
