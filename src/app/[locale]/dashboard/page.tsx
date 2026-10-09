import { getTranslations } from "next-intl/server";
import { Store } from "lucide-react";
import { Link, redirect } from "@/core/i18n/navigation";
import { listUserRestaurants, requireUser } from "@/core/auth/guards";
import { Logo } from "@/components/brand/logo";
import { Card } from "@/components/ui";
import { UserMenu } from "@/components/shell/user-menu";
import { CreateRestaurantForm } from "./create-restaurant-form";

export default async function DashboardPicker({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  const user = await requireUser();
  const list = await listUserRestaurants(user.id);
  if (list.length === 1 && !user.isPlatformAdmin) redirect({ href: `/dashboard/${list[0].id}`, locale });
  const t = await getTranslations("dashboard");
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-10 flex items-center justify-between">
        <Logo />
        <UserMenu name={user.name} email={user.email} isPlatformAdmin={user.isPlatformAdmin} />
      </div>
      <h1 className="mb-4 text-2xl font-semibold">{t("pickTitle")}</h1>
      {list.length === 0 && <p className="mb-4 text-stone-500">{t("pickEmpty")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((r) => (
          <Link key={r.id} href={`/dashboard/${r.id}`}>
            <Card className="flex items-center gap-3 p-4 transition hover:border-brand-400 hover:shadow">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700">
                <Store size={20} />
              </span>
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-stone-500">
                  {t("role")}: {r.roleName}
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="mt-8 p-5">
        <h2 className="mb-3 font-semibold">{t("createTitle")}</h2>
        <CreateRestaurantForm />
      </Card>
    </div>
  );
}
