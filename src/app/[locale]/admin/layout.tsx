import { getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/core/auth/guards";
import { ADMIN_NAV } from "@/core/modules/nav";
import { AppShell } from "@/components/shell/app-shell";
import { UserMenu } from "@/components/shell/user-menu";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();
  const t = await getTranslations("nav");
  return (
    <AppShell
      variant="admin"
      groups={[
        {
          items: ADMIN_NAV.map((n) => ({ href: `/admin${n.href ? `/${n.href}` : ""}`, label: t(n.key), icon: n.icon, exact: n.href === "" })),
        },
      ]}
      top={
        <>
          <LocaleSwitcher persist />
          <UserMenu name={user.name} email={user.email} isPlatformAdmin />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
