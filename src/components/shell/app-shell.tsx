"use client";
import { useState } from "react";
import { Menu as MenuIcon, X, Lock } from "lucide-react";
import { Link, usePathname } from "@/core/i18n/navigation";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/core/utils";
import { NavIcon } from "./icons";

export type ShellNavItem = { href: string; label: string; icon: string; locked?: boolean; badge?: number; exact?: boolean };
export type ShellNavGroup = { label?: string; items: ShellNavItem[] };

/** Generic sidebar + topbar layout shared by restaurant dashboard and platform admin. */
export function AppShell({
  groups,
  top,
  sidebarTop,
  banner,
  children,
  variant = "dashboard",
}: {
  groups: ShellNavGroup[];
  top?: React.ReactNode;
  sidebarTop?: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
  variant?: "dashboard" | "admin";
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isActive = (it: ShellNavItem) => (it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + "/"));

  const sidebar = (
    <nav className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4">
      <div className="flex items-center justify-between px-2">
        <Link href="/" className="text-stone-900">
          <Logo />
        </Link>
        {variant === "admin" && <span className="rounded bg-accent-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-900">Admin</span>}
      </div>
      {sidebarTop}
      {groups.map((g, i) => (
        <div key={i}>
          {g.label && <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "focus-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    isActive(it) ? "bg-brand-700 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                  )}
                >
                  <NavIcon name={it.icon} />
                  <span className="flex-1">{it.label}</span>
                  {it.locked && <Lock size={13} className="opacity-60" />}
                  {!!it.badge && (
                    <span className={cn("rounded-full px-1.5 text-xs", isActive(it) ? "bg-white/20" : "bg-accent-500 text-stone-900")}>
                      {it.badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-stone-200 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="focus-ring rounded-md p-1.5 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X size={20} /> : <MenuIcon size={20} />}
          </button>
          <div className="flex flex-1 items-center justify-end gap-3">{top}</div>
        </header>
        {banner}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
