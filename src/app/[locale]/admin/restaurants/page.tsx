import { getFormatter, getTranslations } from "next-intl/server";
import { Search, Store } from "lucide-react";
import { requirePlatformAdmin } from "@/core/auth/guards";
import { Link } from "@/core/i18n/navigation";
import { Badge, Button, DataTable, EmptyState, Input, PageHeader, Select, Td, Th } from "@/components/ui";
import { PLANS } from "@/modules/billing/plans";
import { listRestaurants, PAGE_SIZE } from "@/modules/admin/service";
import { Pagination } from "@/modules/admin/components/pagination";
import { CreateRestaurantDialog } from "@/modules/admin/components/create-restaurant-dialog";

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminRestaurants({ searchParams }: PageProps<"/[locale]/admin/restaurants">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const q = str(sp.q);
  const status = str(sp.status);
  const plan = str(sp.plan);
  const page = Math.max(1, parseInt(str(sp.page), 10) || 1);
  const [t, f, data] = await Promise.all([getTranslations("admin"), getFormatter(), listRestaurants({ q, status, plan, page })]);
  const date = (d: Date) => f.dateTime(d, { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={t("restaurants.title")} description={t("restaurants.description")} actions={<CreateRestaurantDialog />} />

      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={t("restaurants.searchPlaceholder")} className="pl-9" aria-label={t("restaurants.searchPlaceholder")} />
        </div>
        <Select name="status" defaultValue={status} className="sm:w-44" aria-label={t("restaurants.colStatus")}>
          <option value="">{t("restaurants.allStatuses")}</option>
          <option value="active">{t("restaurants.statusActive")}</option>
          <option value="suspended">{t("restaurants.statusSuspended")}</option>
        </Select>
        <Select name="plan" defaultValue={plan} className="sm:w-40" aria-label={t("restaurants.colPlan")}>
          <option value="">{t("restaurants.allPlans")}</option>
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {t(`plans.${p.id}`)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t("restaurants.filter")}
        </Button>
      </form>

      <p className="mb-2 text-sm text-stone-500">{t("restaurants.count", { count: data.total })}</p>

      {data.rows.length === 0 ? (
        <EmptyState icon={<Store size={28} />} title={t("restaurants.empty")} description={t("restaurants.emptyHint")} />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>{t("restaurants.colName")}</Th>
              <Th>{t("restaurants.colPlan")}</Th>
              <Th>{t("restaurants.colStatus")}</Th>
              <Th>{t("restaurants.colOwner")}</Th>
              <Th className="text-right">{t("restaurants.colItems")}</Th>
              <Th>{t("restaurants.colCreated")}</Th>
              <Th>{t("restaurants.colLastActivity")}</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const expired = r.planExpired;
              return (
                <tr key={r.id} className="hover:bg-stone-50">
                  <Td>
                    <Link href={`/admin/restaurants/${r.id}`} className="font-medium text-stone-900 hover:text-brand-700">
                      {r.name}
                    </Link>
                    <p className="text-xs text-stone-400">/{r.slug}</p>
                  </Td>
                  <Td>
                    <Badge tone={r.plan === "pro" ? "purple" : r.plan === "starter" ? "blue" : "neutral"}>{t(`plans.${r.plan}`)}</Badge>
                    {r.planValidUntil && (
                      <p className={expired ? "mt-0.5 text-xs text-red-600" : "mt-0.5 text-xs text-stone-400"}>
                        {expired ? t("restaurants.expired") : t("restaurants.validUntil", { date: date(r.planValidUntil) })}
                      </p>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={r.status === "active" ? "green" : "red"}>
                      {r.status === "active" ? t("restaurants.statusActive") : t("restaurants.statusSuspended")}
                    </Badge>
                  </Td>
                  <Td className="max-w-56 truncate">{r.ownerEmail ?? "–"}</Td>
                  <Td className="text-right tabular-nums">{f.number(r.itemCount)}</Td>
                  <Td className="whitespace-nowrap">{date(r.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-stone-500">{r.lastActivity ? f.relativeTime(r.lastActivity) : "–"}</Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
      <Pagination basePath="/admin/restaurants" params={{ q, status, plan }} page={data.page} pages={Math.max(1, Math.ceil(data.total / PAGE_SIZE))} />
    </>
  );
}
