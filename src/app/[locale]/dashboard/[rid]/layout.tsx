import { getTranslations } from "next-intl/server";
import { and, eq, sql as dsql } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { db } from "@/core/db";
import { orders, reviewTasks } from "@/core/db/schema";
import { listUserRestaurants, requireRestaurant } from "@/core/auth/guards";
import { DASHBOARD_NAV } from "@/core/modules/nav";
import { planHas } from "@/modules/billing/plans";
import { AppShell, type ShellNavGroup } from "@/components/shell/app-shell";
import { UserMenu } from "@/components/shell/user-menu";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { RestaurantSwitcher } from "@/components/shell/restaurant-switcher";
import { VerifyBanner } from "@/components/shell/verify-banner";

export default async function RestaurantLayout({ children, params }: LayoutProps<"/[locale]/dashboard/[rid]">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid);
  const t = await getTranslations();
  const [[openReviews], [pendingOrders], mine] = await Promise.all([
    db.select({ n: dsql<number>`count(*)::int` }).from(reviewTasks).where(and(eq(reviewTasks.restaurantId, rid), eq(reviewTasks.status, "open"))),
    db.select({ n: dsql<number>`count(*)::int` }).from(orders).where(and(eq(orders.restaurantId, rid), eq(orders.status, "pending"))),
    listUserRestaurants(ctx.user.id),
  ]);

  const groupOrder = ["main", "quality", "operations", "settings"] as const;
  const groupLabel = { main: "groupMain", quality: "groupQuality", operations: "groupOperations", settings: "groupSettings" } as const;
  const groups: ShellNavGroup[] = groupOrder
    .map((g) => ({
      label: t(`nav.${groupLabel[g]}`),
      items: DASHBOARD_NAV.filter((n) => n.group === g && (!n.permission || ctx.can(n.permission))).map((n) => ({
        href: `/dashboard/${rid}${n.href ? `/${n.href}` : ""}`,
        label: t(`nav.${n.key}`),
        icon: n.icon,
        exact: n.href === "",
        locked: n.feature ? !planHas(ctx.restaurant.plan, n.feature) : false,
        badge: n.key === "review" ? openReviews.n : n.key === "orders" ? pendingOrders.n : undefined,
      })),
    }))
    .filter((g) => g.items.length);

  return (
    <AppShell
      groups={groups}
      sidebarTop={<RestaurantSwitcher current={{ id: rid, name: ctx.restaurant.name }} list={mine} />}
      banner={
        <>
          {ctx.isAdminOverride && <div className="bg-accent-400 px-4 py-1.5 text-center text-xs font-medium text-stone-900">{t("dashboard.adminMode")}</div>}
          {!ctx.user.emailVerifiedAt && <VerifyBanner />}
        </>
      }
      top={
        <>
          <a
            href={`/m/${ctx.restaurant.slug}`}
            target="_blank"
            className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-stone-600 hover:bg-stone-100 sm:inline-flex"
          >
            <ExternalLink size={15} /> {t("nav.viewMenu")}
          </a>
          <LocaleSwitcher persist />
          <UserMenu name={ctx.user.name} email={ctx.user.email} isPlatformAdmin={ctx.user.isPlatformAdmin} />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
