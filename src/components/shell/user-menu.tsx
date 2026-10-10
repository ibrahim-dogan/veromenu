"use client";
import { useTranslations } from "next-intl";
import { LogOut, Shield, LayoutDashboard, UserRound } from "lucide-react";
import { Link, useRouter } from "@/core/i18n/navigation";
import { logout } from "@/modules/auth/actions";

export function UserMenu({ name, email, isPlatformAdmin }: { name: string; email: string; isPlatformAdmin: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  return (
    <details className="relative">
      <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded-full">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
          {(name || email).slice(0, 1).toUpperCase()}
        </span>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{name || email}</p>
          <p className="truncate text-xs text-stone-500">{email}</p>
        </div>
        <hr className="my-1 border-stone-100" />
        <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100">
          <LayoutDashboard size={16} /> {t("nav.dashboard")}
        </Link>
        <Link href="/account" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100">
          <UserRound size={16} /> {t("common.profile")}
        </Link>
        {isPlatformAdmin && (
          <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100">
            <Shield size={16} /> {t("nav.admin")}
          </Link>
        )}
        <button
          onClick={async () => {
            await logout();
            router.replace("/login");
            router.refresh();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
        >
          <LogOut size={16} /> {t("common.logout")}
        </button>
      </div>
    </details>
  );
}
