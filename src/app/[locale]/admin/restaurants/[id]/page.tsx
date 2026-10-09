import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft, ExternalLink, LayoutDashboard } from "lucide-react";
import { requirePlatformAdmin } from "@/core/auth/guards";
import { Link } from "@/core/i18n/navigation";
import { Badge, Card, CardBody, CardHeader, DataTable, PageHeader, Td, Th, buttonClass } from "@/components/ui";
import { getRestaurantDetail } from "@/modules/admin/service";
import { RestaurantSettingsForm } from "@/modules/admin/components/restaurant-settings-form";

export default async function AdminRestaurantDetail({ params }: PageProps<"/[locale]/admin/restaurants/[id]">) {
  await requirePlatformAdmin();
  const { id } = await params;
  const d = await getRestaurantDetail(id);
  if (!d) notFound();
  const [t, f] = await Promise.all([getTranslations("admin"), getFormatter()]);
  const r = d.restaurant;
  const date = (x: Date) => f.dateTime(x, { dateStyle: "medium" });
  const n = (v: number) => f.number(v);
  const pct = d.ai.creditsLimit ? Math.min(100, Math.round((d.ai.creditsUsed / d.ai.creditsLimit) * 100)) : 0;

  return (
    <>
      <Link href="/admin/restaurants" className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
        <ArrowLeft size={15} aria-hidden /> {t("detail.back")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {r.name}
            <Badge tone={r.status === "active" ? "green" : "red"}>
              {r.status === "active" ? t("restaurants.statusActive") : t("restaurants.statusSuspended")}
            </Badge>
            <Badge tone={r.plan === "pro" ? "purple" : r.plan === "starter" ? "blue" : "neutral"}>{t(`plans.${r.plan}`)}</Badge>
          </span>
        }
        description={
          <>
            {t("detail.slug")}: /{r.slug} · {t("detail.created")}: {date(r.createdAt)}
          </>
        }
        actions={
          <>
            <a href={`/m/${r.slug}`} target="_blank" rel="noopener" className={buttonClass("secondary")}>
              <ExternalLink size={16} aria-hidden /> {t("detail.openGuest")}
            </a>
            <Link href={`/dashboard/${r.id}`} className={buttonClass("primary")}>
              <LayoutDashboard size={16} aria-hidden /> {t("detail.openDashboard")}
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t("detail.settings")} description={t("detail.settingsHint")} />
            <CardBody>
              <RestaurantSettingsForm
                id={r.id}
                initial={{
                  plan: r.plan,
                  planValidUntil: r.planValidUntil ? r.planValidUntil.toISOString().slice(0, 10) : "",
                  status: r.status,
                  modules: r.modules,
                }}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("detail.members")} />
            {d.members.length ? (
              <div className="p-3">
                <DataTable className="border-0">
                  <thead>
                    <tr>
                      <Th>{t("detail.colMember")}</Th>
                      <Th>{t("detail.colRole")}</Th>
                      <Th>{t("detail.colJoined")}</Th>
                      <Th>{t("detail.colLastLogin")}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.members.map((m) => (
                      <tr key={m.userId}>
                        <Td>
                          <p className="font-medium text-stone-900">{m.name || m.email}</p>
                          {m.name && <p className="text-xs text-stone-500">{m.email}</p>}
                          {m.disabledAt && <Badge tone="red" className="mt-1">{t("detail.deactivated")}</Badge>}
                        </Td>
                        <Td>
                          <Badge tone={m.roleKey === "owner" ? "yellow" : "neutral"}>{m.role}</Badge>
                        </Td>
                        <Td className="whitespace-nowrap">{date(m.joinedAt)}</Td>
                        <Td className="whitespace-nowrap text-stone-500">{m.lastLoginAt ? f.relativeTime(m.lastLoginAt) : t("detail.never")}</Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            ) : (
              <CardBody>
                <p className="text-sm text-stone-500">{t("detail.noMembers")}</p>
              </CardBody>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("detail.stats")} />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  [t("detail.items"), n(d.items.total)],
                  [t("detail.allergensConfirmed"), `${n(d.items.confirmed)} / ${n(d.items.total)}`],
                  [t("detail.views30"), n(d.views30)],
                  [t("detail.orders30"), n(d.orders30)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-stone-50 px-3 py-2.5">
                    <dt className="text-xs text-stone-500">{label}</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-stone-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("detail.ai")} description={t("detail.credits", { used: n(d.ai.creditsUsed), limit: n(d.ai.creditsLimit) })} />
            <CardBody>
              <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                <div className={pct >= 90 ? "h-full bg-red-500" : pct >= 70 ? "h-full bg-accent-500" : "h-full bg-brand-600"} style={{ width: `${pct}%` }} />
              </div>
              {d.ai.byTask.length ? (
                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-stone-500">
                      <th className="pb-1.5 font-medium">{t("detail.colTask")}</th>
                      <th className="pb-1.5 text-right font-medium">{t("detail.colCalls")}</th>
                      <th className="pb-1.5 text-right font-medium">{t("detail.colTokens")}</th>
                      <th className="pb-1.5 text-right font-medium">{t("detail.colCost")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {d.ai.byTask.map((x) => (
                      <tr key={x.task}>
                        <td className="py-1.5 font-mono text-xs">{x.task}</td>
                        <td className="py-1.5 text-right tabular-nums">{n(x.calls)}</td>
                        <td className="py-1.5 text-right tabular-nums">{n(x.tokens)}</td>
                        <td className="py-1.5 text-right tabular-nums">{f.number(x.cost, { style: "currency", currency: "USD", maximumFractionDigits: 3 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="mt-4 text-sm text-stone-500">{t("detail.noAiUsage")}</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={t("detail.recentActivity")}
              actions={
                <Link href={`/admin/audit?restaurant=${r.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                  {t("detail.viewAudit")}
                </Link>
              }
            />
            <CardBody>
              {d.recentAudit.length ? (
                <ul className="space-y-2.5 text-sm">
                  {d.recentAudit.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="font-mono text-xs text-stone-700">{a.action}</span>
                        {a.email && <span className="block truncate text-xs text-stone-400">{a.email}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-stone-400">{f.relativeTime(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-500">{t("detail.noActivity")}</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
