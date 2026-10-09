import { getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { env } from "@/core/env";
import { PageHeader } from "@/components/ui";
import { getPlan, planHas } from "@/modules/billing/plans";
import { orderingSettings } from "@/modules/ordering/service";
import {
  DangerSection,
  GeneralSection,
  HoursSection,
  LanguagesSection,
  LegalSection,
  OrderingSection,
  SlugSection,
  TranslationQualitySection,
} from "@/modules/settings/components/settings-sections";

const SUPPORT_EMAIL = "support@veromenu.de";
const SECTIONS = ["general", "slug", "hours", "legal", "languages", "ordering", "translations", "danger"] as const;

export default async function SettingsPage({ params }: PageProps<"/[locale]/dashboard/[rid]/settings">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid, "settings.manage");
  const t = await getTranslations("settings");
  const r = ctx.restaurant;
  const s = r.settings ?? {};

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="lg:grid lg:grid-cols-[12rem_1fr] lg:gap-8">
        <nav className="hidden lg:block" aria-label={t("title")}>
          <ul className="sticky top-20 space-y-0.5 text-sm">
            {SECTIONS.map((id) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-md px-2.5 py-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-900">
                  {t(`nav.${id}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
          <GeneralSection restaurantId={rid} name={r.name} settings={s} />
          <SlugSection restaurantId={rid} slug={r.slug} appUrl={env().APP_URL} />
          <HoursSection restaurantId={rid} hours={s.openingHours ?? []} />
          <LegalSection restaurantId={rid} legal={s.legal} />
          <LanguagesSection restaurantId={rid} defaultLocale={r.defaultLocale} enabled={r.enabledLocales} limit={getPlan(r.plan).limits.locales} />
          <OrderingSection restaurantId={rid} ordering={orderingSettings(s)} planOk={planHas(r.plan, "ordering")} tablesOk={planHas(r.plan, "tables")} />
          <TranslationQualitySection
            restaurantId={rid}
            value={{ guestsSeeOnlyApproved: s.translations?.guestsSeeOnlyApproved ?? false, autoApproveThreshold: s.translations ? s.translations.autoApproveThreshold : 4.5 }}
          />
          <DangerSection restaurantId={rid} slug={r.slug} supportEmail={SUPPORT_EMAIL} />
        </div>
      </div>
    </>
  );
}
