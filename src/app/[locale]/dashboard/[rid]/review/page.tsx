import { getLocale, getTranslations } from "next-intl/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/core/db";
import { reviewTasks, translations } from "@/core/db/schema";
import { ForbiddenError, requireRestaurant } from "@/core/auth/guards";
import { getAiCredits } from "@/core/ai";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/core/utils";
import { EmptyState, PageHeader } from "@/components/ui";
import { getAllergenState, listUnconfirmed } from "@/modules/allergens/service";
import { AllergenTaskCard, OtherTaskCard, TranslationTaskCard, type TranslationTaskView } from "./_components/review-cards";
import { UnconfirmedItems } from "./_components/unconfirmed-items";

type Tab = "allergens" | "translations" | "other";
const MAX_TASKS = 50;

export default async function ReviewPage({ params, searchParams }: PageProps<"/[locale]/dashboard/[rid]/review">) {
  const { rid } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(rid);
  const canAllergens = ctx.can("allergens.review");
  const canTranslations = ctx.can("translations.manage");
  if (!canAllergens && !canTranslations) throw new ForbiddenError("missing permission allergens.review");
  const t = await getTranslations("review");
  const tt = await getTranslations("translations");
  const uiLocale = await getLocale();

  const tabs: Tab[] = [...(canAllergens ? (["allergens"] as const) : []), ...(canTranslations || canAllergens ? (["translations"] as const) : []), ...(canAllergens ? (["other"] as const) : [])];
  const tab: Tab = tabs.includes(sp.tab as Tab) ? (sp.tab as Tab) : tabs[0];

  const open = await db
    .select()
    .from(reviewTasks)
    .where(and(eq(reviewTasks.restaurantId, rid), eq(reviewTasks.status, "open")))
    .orderBy(desc(reviewTasks.createdAt));
  const byKind = {
    allergens: open.filter((x) => x.kind === "allergen"),
    translations: open.filter((x) => x.kind === "translation"),
    other: open.filter((x) => x.kind === "menu_import" || x.kind === "other"),
  };

  const langName = (code: string) => {
    try {
      return new Intl.DisplayNames([uiLocale], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  let body: React.ReactNode = null;
  if (tab === "allergens") {
    const tasks = byKind.allergens.slice(0, MAX_TASKS);
    const [states, unconfirmed, credits] = await Promise.all([
      Promise.all(tasks.map((task) => (task.entityId ? getAllergenState(rid, task.entityId).catch(() => null) : null))),
      listUnconfirmed(rid),
      getAiCredits(rid),
    ]);
    body = (
      <div className="space-y-6">
        {tasks.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={28} />} title={t("emptyAllergens")} description={t("emptyAllergensHint")} />
        ) : (
          <div className="space-y-4">
            {tasks.map((task, i) =>
              states[i] ? (
                <AllergenTaskCard
                  key={task.id}
                  restaurantId={rid}
                  taskId={task.id}
                  reason={task.reason}
                  createdAt={task.createdAt.toISOString()}
                  state={{ ...states[i]!, canConfirm: canAllergens }}
                />
              ) : null,
            )}
          </div>
        )}
        <UnconfirmedItems restaurantId={rid} items={unconfirmed} creditsRemaining={credits.remaining} />
      </div>
    );
  } else if (tab === "translations") {
    const tasks = byKind.translations.slice(0, MAX_TASKS);
    const tIds = tasks.map((x) => String(x.payload.translationId ?? "")).filter((x) => /^[0-9a-f-]{36}$/.test(x));
    const rows = tIds.length ? await db.select().from(translations).where(and(eq(translations.restaurantId, rid), inArray(translations.id, tIds))) : [];
    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const views: TranslationTaskView[] = tasks.map((task) => {
      const p = task.payload as Record<string, unknown>;
      const row = rowMap.get(String(p.translationId));
      const kind = String(p.kind ?? "item");
      const field = String(p.field ?? "name");
      return {
        taskId: task.id,
        createdAt: task.createdAt.toISOString(),
        localeLabel: langName(String(row?.locale ?? p.locale ?? "")),
        sourceLabel: langName(ctx.restaurant.defaultLocale),
        kindLabel: `${tt.has(`kind.${kind}`) ? tt(`kind.${kind}`) : kind} · ${tt.has(`field.${field}`) ? tt(`field.${field}`) : field}`,
        source: String(p.source ?? ""),
        value: row?.value ?? String(p.value ?? ""),
        backTranslation: row?.backTranslation ?? (p.backTranslation as string | null) ?? null,
        qualityScore: row?.qualityScore ?? (p.qualityScore as number | null) ?? null,
        notes: row?.reviewNotes ?? null,
        outdated: !row || row.status === "stale",
      };
    });
    body =
      views.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={28} />} title={t("emptyTranslations")} description={t("emptyTranslationsHint")} />
      ) : (
        <div className="space-y-4">
          {views.map((v) => (
            <TranslationTaskCard key={v.taskId} restaurantId={rid} task={v} canEdit={canTranslations} />
          ))}
        </div>
      );
  } else {
    const tasks = byKind.other.slice(0, MAX_TASKS);
    body =
      tasks.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={28} />} title={t("emptyOther")} />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <OtherTaskCard
              key={task.id}
              restaurantId={rid}
              task={{ id: task.id, kind: task.kind, title: task.title, reason: task.reason, createdAt: task.createdAt.toISOString() }}
            />
          ))}
        </div>
      );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-stone-200" aria-label={t("title")}>
        {tabs.map((x) => (
          <Link
            key={x}
            href={`/dashboard/${rid}/review?tab=${x}`}
            aria-current={tab === x ? "page" : undefined}
            className={cn(
              "focus-ring -mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              tab === x ? "border-brand-600 text-brand-800" : "border-transparent text-stone-500 hover:text-stone-800",
            )}
          >
            {t(`tab.${x}`)}
            {byKind[x].length > 0 && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-red-700">{byKind[x].length}</span>
            )}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
