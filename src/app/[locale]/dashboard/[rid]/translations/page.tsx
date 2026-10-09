import { getTranslations } from "next-intl/server";
import { Coins, Languages } from "lucide-react";
import { requireRestaurant } from "@/core/auth/guards";
import { getAiCredits } from "@/core/ai";
import { Link } from "@/core/i18n/navigation";
import { buttonClass, EmptyState, PageHeader } from "@/components/ui";
import { collectSourceUnits } from "@/modules/translations/source";
import { getGlossary, getProgress, listForLocale, targetLocales, translationSettings } from "@/modules/translations/service";
import { TranslationsWorkspace } from "@/modules/translations/components/translations-workspace";
import { GlossaryCard } from "@/modules/translations/components/glossary-card";
import { QualitySettingsCard } from "@/modules/translations/components/quality-settings-card";

export default async function TranslationsPage({ params, searchParams }: PageProps<"/[locale]/dashboard/[rid]/translations">) {
  const { rid } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(rid, "translations.manage");
  const t = await getTranslations("translations");
  const r = ctx.restaurant;
  const locales = targetLocales(r);

  if (!locales.length) {
    return (
      <>
        <PageHeader title={t("title")} description={t("description")} />
        <EmptyState
          icon={<Languages size={28} />}
          title={t("noLocalesTitle")}
          description={t("noLocalesDescription")}
          action={
            ctx.can("settings.manage") ? (
              <Link href={`/dashboard/${rid}/settings`} className={buttonClass("primary")}>
                {t("noLocalesCta")}
              </Link>
            ) : undefined
          }
        />
      </>
    );
  }

  const requested = typeof sp.lang === "string" ? sp.lang : undefined;
  const current = requested && locales.includes(requested) ? requested : locales[0];
  const units = await collectSourceUnits(rid);
  const [progress, rows, glossary, credits] = await Promise.all([
    getProgress(rid, locales, units),
    listForLocale(rid, current, units),
    getGlossary(rid),
    getAiCredits(rid),
  ]);
  const settings = translationSettings(r);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <span
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600"
            title={t("creditsHint")}
          >
            <Coins size={15} className="text-accent-600" />
            {t("credits", { remaining: credits.remaining, limit: credits.limit })}
          </span>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <TranslationsWorkspace
          restaurantId={rid}
          sourceLocale={r.defaultLocale}
          locales={locales}
          current={current}
          progress={progress}
          rows={rows}
        />
        <div className="space-y-6">
          <QualitySettingsCard
            restaurantId={rid}
            guestsSeeOnlyApproved={settings.guestsSeeOnlyApproved}
            autoApproveThreshold={settings.autoApproveThreshold}
          />
        </div>
      </div>
      <div className="mt-6">
        <GlossaryCard
          restaurantId={rid}
          locales={locales}
          entries={glossary.map((g) => ({ id: g.id, term: g.term, locale: g.locale, translation: g.translation, doNotTranslate: g.doNotTranslate }))}
        />
      </div>
    </>
  );
}
