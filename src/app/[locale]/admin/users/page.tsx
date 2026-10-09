import { getFormatter, getTranslations } from "next-intl/server";
import { Search, Users } from "lucide-react";
import { requirePlatformAdmin } from "@/core/auth/guards";
import { Link } from "@/core/i18n/navigation";
import { Badge, Button, DataTable, EmptyState, Input, PageHeader, Select, Td, Th } from "@/components/ui";
import { listUsers, PAGE_SIZE } from "@/modules/admin/service";
import { Pagination } from "@/modules/admin/components/pagination";
import { CreateAdminDialog } from "@/modules/admin/components/create-admin-dialog";
import { UserRowActions } from "@/modules/admin/components/user-row-actions";

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminUsers({ searchParams }: PageProps<"/[locale]/admin/users">) {
  const me = await requirePlatformAdmin();
  const sp = await searchParams;
  const q = str(sp.q);
  const filter = str(sp.filter);
  const page = Math.max(1, parseInt(str(sp.page), 10) || 1);
  const [t, f, data] = await Promise.all([getTranslations("admin"), getFormatter(), listUsers({ q, filter, page })]);

  return (
    <>
      <PageHeader title={t("users.title")} description={t("users.description")} actions={<CreateAdminDialog />} />

      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" aria-hidden />
          <Input name="q" defaultValue={q} placeholder={t("users.searchPlaceholder")} className="pl-9" aria-label={t("users.searchPlaceholder")} />
        </div>
        <Select name="filter" defaultValue={filter} className="sm:w-52" aria-label={t("users.filter")}>
          <option value="">{t("users.filterAll")}</option>
          <option value="admins">{t("users.filterAdmins")}</option>
          <option value="disabled">{t("users.filterDisabled")}</option>
          <option value="unverified">{t("users.filterUnverified")}</option>
        </Select>
        <Button type="submit" variant="secondary">
          {t("users.filter")}
        </Button>
      </form>

      <p className="mb-2 text-sm text-stone-500">{t("users.count", { count: data.total })}</p>

      {data.rows.length === 0 ? (
        <EmptyState icon={<Users size={28} />} title={t("users.empty")} />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>{t("users.colUser")}</Th>
              <Th>{t("users.colRestaurants")}</Th>
              <Th>{t("users.colStatus")}</Th>
              <Th>{t("users.colLastLogin")}</Th>
              <Th>{t("users.colCreated")}</Th>
              <Th className="text-right">
                <span className="sr-only">{t("users.actions")}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((u) => {
              const isSelf = u.id === me.id;
              const isLastAdmin = u.isPlatformAdmin && !u.disabledAt && data.activeAdmins <= 1;
              return (
                <tr key={u.id} className={u.disabledAt ? "bg-stone-50/60 text-stone-400" : "hover:bg-stone-50"}>
                  <Td>
                    <p className="flex items-center gap-1.5 font-medium text-stone-900">
                      {u.name || u.email}
                      {isSelf && <Badge tone="yellow">{t("users.you")}</Badge>}
                    </p>
                    {u.name && <p className="text-xs text-stone-500">{u.email}</p>}
                  </Td>
                  <Td className="max-w-64">
                    {u.restaurants.length ? (
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
                        {u.restaurants.slice(0, 2).map((r) => (
                          <Link key={r.id} href={`/admin/restaurants/${r.id}`} className="truncate text-brand-700 hover:underline">
                            {r.name}
                          </Link>
                        ))}
                        {u.restaurants.length > 2 && <span className="text-xs text-stone-400">{t("users.more", { count: u.restaurants.length - 2 })}</span>}
                      </span>
                    ) : (
                      <span className="text-stone-400">{t("users.none")}</span>
                    )}
                  </Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {u.isPlatformAdmin && <Badge tone="purple">{t("users.admin")}</Badge>}
                      {u.disabledAt ? (
                        <Badge tone="red">{t("users.disabled")}</Badge>
                      ) : u.emailVerifiedAt ? (
                        <Badge tone="green">{t("users.verified")}</Badge>
                      ) : (
                        <Badge tone="yellow">{t("users.unverified")}</Badge>
                      )}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-stone-500">{u.lastLoginAt ? f.relativeTime(u.lastLoginAt) : t("users.never")}</Td>
                  <Td className="whitespace-nowrap">{f.dateTime(u.createdAt, { dateStyle: "medium" })}</Td>
                  <Td className="w-32">
                    <UserRowActions
                      user={{ id: u.id, email: u.email, isPlatformAdmin: u.isPlatformAdmin, disabled: !!u.disabledAt }}
                      isSelf={isSelf}
                      isLastAdmin={isLastAdmin}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
      <Pagination basePath="/admin/users" params={{ q, filter }} page={data.page} pages={Math.max(1, Math.ceil(data.total / PAGE_SIZE))} />
    </>
  );
}
