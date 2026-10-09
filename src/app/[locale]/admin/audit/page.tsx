import { getFormatter, getTranslations } from "next-intl/server";
import { ScrollText } from "lucide-react";
import { requirePlatformAdmin } from "@/core/auth/guards";
import { Link } from "@/core/i18n/navigation";
import { Button, DataTable, EmptyState, Input, Label, PageHeader, Select, Td, Th, buttonClass } from "@/components/ui";
import { listAudit, restaurantOptions } from "@/modules/admin/service";
import { Pagination } from "@/modules/admin/components/pagination";

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminAudit({ searchParams }: PageProps<"/[locale]/admin/audit">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const filters = {
    restaurant: str(sp.restaurant),
    user: str(sp.user),
    action: str(sp.action),
    from: str(sp.from),
    to: str(sp.to),
  };
  const page = Math.max(1, parseInt(str(sp.page), 10) || 1);
  const [t, f, data, restaurantsList] = await Promise.all([
    getTranslations("admin.audit"),
    getFormatter(),
    listAudit({ restaurantId: filters.restaurant, user: filters.user, action: filters.action, from: filters.from, to: filters.to, page }),
    restaurantOptions(filters.restaurant ? [filters.restaurant] : []),
  ]);
  const active = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <form className="mb-5 grid gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_auto_auto_auto]">
        <div className="space-y-1">
          <Label htmlFor="au-r">{t("restaurant")}</Label>
          <Select id="au-r" name="restaurant" defaultValue={filters.restaurant}>
            <option value="">{t("allRestaurants")}</option>
            {restaurantsList.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-u">{t("user")}</Label>
          <Input id="au-u" name="user" defaultValue={filters.user} placeholder={t("userPlaceholder")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-a">{t("action")}</Label>
          <Input id="au-a" name="action" defaultValue={filters.action} placeholder={t("actionPlaceholder")} className="font-mono" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-from">{t("from")}</Label>
          <Input id="au-from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="au-to">{t("to")}</Label>
          <Input id="au-to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">{t("apply")}</Button>
          {active && (
            <Link href="/admin/audit" className={buttonClass("ghost")}>
              {t("reset")}
            </Link>
          )}
        </div>
      </form>

      {data.rows.length === 0 ? (
        <EmptyState icon={<ScrollText size={28} />} title={t("empty")} />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>{t("colTime")}</Th>
              <Th>{t("colAction")}</Th>
              <Th>{t("colUser")}</Th>
              <Th>{t("colRestaurant")}</Th>
              <Th>{t("colEntity")}</Th>
              <Th>{t("colData")}</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((a) => {
              const json = a.data && Object.keys(a.data).length ? JSON.stringify(a.data, null, 2) : null;
              return (
                <tr key={a.id} className="align-top hover:bg-stone-50">
                  <Td className="whitespace-nowrap text-xs text-stone-500">
                    {f.dateTime(a.createdAt, { dateStyle: "short", timeStyle: "medium" })}
                  </Td>
                  <Td>
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs text-stone-800">{a.action}</span>
                  </Td>
                  <Td className="max-w-48 truncate text-sm">{a.userEmail ?? <span className="text-stone-400">{t("system")}</span>}</Td>
                  <Td className="max-w-48 truncate text-sm">
                    {a.restaurantId && a.restaurantName ? (
                      <Link href={`/admin/restaurants/${a.restaurantId}`} className="text-brand-700 hover:underline">
                        {a.restaurantName}
                      </Link>
                    ) : (
                      <span className="text-stone-400">–</span>
                    )}
                  </Td>
                  <Td className="text-xs text-stone-500">
                    {a.entityType ? (
                      <>
                        {a.entityType}
                        {a.entityId && <span className="block max-w-36 truncate font-mono text-[11px] text-stone-400">{a.entityId}</span>}
                      </>
                    ) : (
                      "–"
                    )}
                  </Td>
                  <Td className="max-w-80">
                    {json ? (
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-brand-700">{t("details")}</summary>
                        <pre className="mt-1.5 max-h-60 overflow-auto rounded-lg bg-stone-900 p-2.5 text-[11px] leading-relaxed text-stone-100">{json}</pre>
                      </details>
                    ) : (
                      <span className="text-stone-400">–</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
      <Pagination basePath="/admin/audit" params={filters} page={data.page} hasMore={data.hasMore} />
    </>
  );
}
