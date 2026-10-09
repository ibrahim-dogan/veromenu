import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, CheckCircle2, Circle, ConciergeBell, ExternalLink, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { requireRestaurant } from "@/core/auth/guards";
import { Link } from "@/core/i18n/navigation";
import { getAiCredits } from "@/core/ai";
import { Card, CardBody, CardHeader, buttonClass } from "@/components/ui";
import { cn, toBcp47 } from "@/core/utils";
import { planHas } from "@/modules/billing/plans";
import { getKpis } from "@/modules/stats/service";
import { countOpenReviewTasks, getOnboarding } from "@/modules/stats/overview";
import { countOpenOrders } from "@/modules/ordering/service";
import { KpiGrid } from "@/modules/stats/components/kpi-grid";

export default async function OverviewPage({ params }: PageProps<"/[locale]/dashboard/[rid]">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid);
  const r = ctx.restaurant;
  const t = await getTranslations("overview");
  const locale = await getLocale();

  const canStats = ctx.can("stats.view");
  const canOrders = ctx.can("orders.view") && planHas(r.plan, "ordering");
  const canReview = ctx.can("allergens.review") || ctx.can("translations.manage");
  const canAi = ctx.can("ai.use");
  const canSetup = ctx.can("menu.edit") || ctx.can("settings.manage");

  const [kpis, onboarding, reviews, openOrders, credits] = await Promise.all([
    canStats ? getKpis(rid, r.timezone, 7) : null,
    canSetup ? getOnboarding(r) : null,
    canReview ? countOpenReviewTasks(rid) : null,
    canOrders ? countOpenOrders(rid) : null,
    canAi ? getAiCredits(rid).catch(() => null) : null,
  ]);

  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: r.timezone }).format(new Date()));
  const greetingKey = hour < 11 ? "morning" : hour < 17 ? "day" : "evening";
  const firstName = (ctx.user.name || "").trim().split(/\s+/)[0];
  const done = onboarding?.filter((s) => s.done).length ?? 0;
  const total = onboarding?.length ?? 0;
  const num = new Intl.NumberFormat(toBcp47(locale));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            {firstName ? t(`greeting.${greetingKey}`, { name: firstName }) : t(`greetingNoName.${greetingKey}`)}
          </h1>
          <p className="mt-1 text-sm text-stone-500">{t("subtitle", { restaurant: r.name })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/m/${r.slug}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
            <ExternalLink size={14} aria-hidden /> {t("quick.guestMenu")}
          </a>
          {ctx.can("tables.manage") && (
            <Link href={`/dashboard/${rid}/tables`} className={buttonClass("secondary", "sm")}>
              <QrCode size={14} aria-hidden /> {t("quick.qr")}
            </Link>
          )}
        </div>
      </div>

      {(openOrders || reviews != null || credits) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {openOrders && (
            <Link
              href={`/dashboard/${rid}/orders`}
              className={cn(
                "focus-ring flex items-center gap-4 rounded-xl border bg-white px-5 py-4 shadow-sm transition-colors hover:border-stone-300",
                openOrders.pending > 0 ? "border-amber-300 bg-amber-50/50" : "border-stone-200",
              )}
            >
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", openOrders.pending > 0 ? "bg-accent-400 text-stone-900" : "bg-stone-100 text-stone-500")}>
                <ConciergeBell size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-stone-500">{t("orders.title")}</span>
                <span className="block font-semibold text-stone-900">
                  {openOrders.pending > 0 ? t("orders.pending", { count: openOrders.pending }) : t("orders.open", { count: openOrders.open })}
                </span>
              </span>
              <ArrowRight size={16} className="text-stone-400" aria-hidden />
            </Link>
          )}
          {reviews != null && (
            <Link
              href={`/dashboard/${rid}/review`}
              className="focus-ring flex items-center gap-4 rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-stone-300"
            >
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", reviews > 0 ? "bg-sky-100 text-sky-700" : "bg-emerald-50 text-emerald-700")}>
                <ShieldCheck size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-stone-500">{t("reviews.title")}</span>
                <span className="block font-semibold text-stone-900">{reviews > 0 ? t("reviews.open", { count: reviews }) : t("reviews.none")}</span>
              </span>
              <ArrowRight size={16} className="text-stone-400" aria-hidden />
            </Link>
          )}
          {credits && (
            <div className="flex items-center gap-4 rounded-xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                <Sparkles size={18} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-stone-500">{t("ai.title")}</span>
                <span className="block font-semibold tabular-nums text-stone-900">
                  {t("ai.remaining", { remaining: num.format(credits.remaining), limit: num.format(credits.limit) })}
                </span>
                <span className="mt-1.5 block h-1.5 rounded-full bg-stone-100" aria-hidden>
                  <span
                    className={cn("block h-1.5 rounded-full", credits.remaining / Math.max(1, credits.limit) < 0.15 ? "bg-red-500" : "bg-violet-500")}
                    style={{ width: `${Math.min(100, (credits.used / Math.max(1, credits.limit)) * 100)}%` }}
                  />
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {onboarding && done < total && (
        <Card>
          <CardHeader
            title={t("onboarding.title")}
            description={t("onboarding.progress", { done, total })}
            actions={<span className="text-sm font-semibold tabular-nums text-brand-700">{Math.round((done / total) * 100)} %</span>}
          />
          <div className="h-1 bg-stone-100" aria-hidden>
            <div className="h-1 bg-brand-600 transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <ul className="divide-y divide-stone-100">
            {onboarding.map((s) => (
              <li key={s.key}>
                <Link href={s.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-stone-50">
                  {s.done ? <CheckCircle2 size={20} className="shrink-0 text-emerald-600" aria-hidden /> : <Circle size={20} className="shrink-0 text-stone-300" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm font-medium", s.done ? "text-stone-400 line-through" : "text-stone-800")}>{t(`onboarding.steps.${s.key}.title`)}</span>
                    {!s.done && <span className="block text-xs text-stone-500">{t(`onboarding.steps.${s.key}.hint`)}</span>}
                  </span>
                  <span className="sr-only">{s.done ? t("onboarding.done") : t("onboarding.todo")}</span>
                  {!s.done && <ArrowRight size={16} className="text-stone-300 group-hover:text-stone-500" aria-hidden />}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {onboarding && done === total && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 size={16} aria-hidden /> {t("onboarding.allDone")}
        </p>
      )}

      {kpis && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="font-semibold text-stone-900">{t("kpis.title")}</h2>
            <Link href={`/dashboard/${rid}/stats`} className="text-sm font-medium text-brand-700 hover:underline">
              {t("kpis.more")}
            </Link>
          </div>
          <KpiGrid
            kpis={kpis}
            currency={r.currency}
            days={7}
            keys={planHas(r.plan, "ordering") ? ["views", "visitors", "scans", "orders", "revenueCents"] : ["views", "visitors", "scans"]}
          />
        </section>
      )}

      {!kpis && !onboarding && !openOrders && reviews == null && (
        <Card>
          <CardBody className="text-sm text-stone-600">{t("limitedAccess", { role: ctx.roleName ?? "" })}</CardBody>
        </Card>
      )}
    </div>
  );
}
