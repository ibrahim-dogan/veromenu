import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  Check,
  Minus,
  Languages,
  ShieldCheck,
  FileUp,
  Mic,
  QrCode,
  BarChart3,
  Palette,
  Users,
  Lock,
  Server,
  Cookie,
  Globe2,
  Scale,
  CheckCircle2,
  Sparkles,
  ConciergeBell,
  Plus,
  Upload,
  ClipboardCheck,
  Printer,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { buttonClass } from "@/components/ui";
import { cn, toBcp47 } from "@/core/utils";
import { PLANS, type PlanFeature } from "@/modules/billing/plans";
import { PhoneMockup } from "./phone-mockup";
import { DEMO_REVIEW } from "./demo-menu";

const container = "mx-auto max-w-6xl px-4 sm:px-6";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "center" | "left";
  as?: "h1" | "h2";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow && <p className="text-sm font-semibold tracking-wide text-brand-600">{eyebrow}</p>}
      <Tag className="mt-3 font-display text-3xl leading-[1.15] font-semibold tracking-tight text-balance text-stone-900 sm:text-4xl">{title}</Tag>
      {subtitle && <p className="mt-4 text-base leading-relaxed text-pretty text-stone-600 sm:text-lg">{subtitle}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

export async function Hero() {
  const t = await getTranslations("landing");
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_85%_10%,rgba(240,182,90,0.18),transparent_70%),radial-gradient(50%_60%_at_10%_0%,var(--color-brand-100),transparent_70%)]"
        aria-hidden
      />
      <div className={cn(container, "grid items-center gap-14 pt-12 pb-20 sm:pt-16 lg:grid-cols-[1.12fr_0.88fr] lg:gap-10 lg:pt-20 lg:pb-28")}>
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-xs font-medium text-brand-800 shadow-sm sm:text-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />
            {t("hero.eyebrow")}
          </p>
          <h1 className="mt-6 font-display text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-balance text-stone-900 sm:text-6xl lg:text-[4.1rem]">
            {t("hero.titleLead")} <span className="text-brand-700 italic">{t("hero.titleAccent")}</span> {t("hero.titleTail")}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-stone-600">{t("hero.subtitle")}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/register" className={buttonClass("primary", "lg", "rounded-full px-7 shadow-md shadow-brand-900/10")}>
              {t("hero.ctaPrimary")} <ArrowRight size={18} aria-hidden />
            </Link>
            <Link href="/funktionen" className={buttonClass("secondary", "lg", "rounded-full px-7")}>
              {t("hero.ctaSecondary")}
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-600">
            {(["point1", "point2", "point3"] as const).map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-brand-600" aria-hidden /> {t(`hero.${k}`)}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-fit">
          <PhoneMockup />
          {/* floating proof cards */}
          <FloatCard
            className="top-20 -left-24 hidden md:flex lg:-left-28"
            icon={Languages}
            tone="brand"
            title={t("mockup.translationTitle")}
            body={t("mockup.translationBody")}
          />
          <FloatCard
            className="bottom-36 -left-20 hidden md:flex lg:-left-32"
            icon={ShieldCheck}
            tone="green"
            title={t("mockup.allergenTitle")}
            body={t("mockup.allergenBody")}
          />
          <FloatCard
            className="top-60 -right-24 hidden md:flex lg:-right-20"
            icon={ConciergeBell}
            tone="accent"
            title={t("mockup.orderTitle")}
            body={t("mockup.orderBody")}
          />
        </div>
      </div>
    </section>
  );
}

function FloatCard({
  className,
  icon: Icon,
  title,
  body,
  tone,
}: {
  className?: string;
  icon: LucideIcon;
  title: string;
  body: string;
  tone: "brand" | "green" | "accent";
}) {
  const tones = { brand: "bg-brand-50 text-brand-700", green: "bg-emerald-50 text-emerald-700", accent: "bg-amber-50 text-amber-700" };
  return (
    <div
      className={cn(
        "absolute z-10 max-w-[230px] items-start gap-3 rounded-2xl border border-stone-200/80 bg-white/95 p-3 pr-4 shadow-xl shadow-stone-900/10 backdrop-blur",
        className,
      )}
      aria-hidden
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", tones[tone])}>
        <Icon size={18} />
      </span>
      <span>
        <span className="block text-[13px] leading-tight font-semibold text-stone-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-stone-500">{body}</span>
      </span>
    </div>
  );
}

/* ----------------------------------------------------------- trust strip */

export async function TrustStrip() {
  const t = await getTranslations("landing.trust");
  const items: [LucideIcon, string][] = [
    [Scale, t("lmiv")],
    [ShieldCheck, t("gdpr")],
    [Globe2, t("languages")],
    [Cookie, t("cookieless")],
    [Server, t("hosting")],
  ];
  return (
    <section aria-label={t("label")} className="border-y border-stone-200/80 bg-white/60">
      <ul className={cn(container, "flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-6 sm:justify-between")}>
        {items.map(([Icon, label]) => (
          <li key={label} className="flex items-center gap-2 text-sm font-medium text-stone-600">
            <Icon size={17} className="text-brand-600" aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------- features */

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: "translate", icon: Languages },
  { key: "allergens", icon: ShieldCheck },
  { key: "import", icon: FileUp },
  { key: "assistant", icon: Mic },
  { key: "tables", icon: QrCode },
  { key: "stats", icon: BarChart3 },
  { key: "themes", icon: Palette },
  { key: "team", icon: Users },
  { key: "gdpr", icon: Lock },
];

export async function FeatureGrid({ withHeading = true }: { withHeading?: boolean }) {
  const t = await getTranslations("landing.features");
  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-28">
      <div className={container}>
        {withHeading && <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />}
        <ul className={cn("grid gap-px overflow-hidden rounded-3xl border border-stone-200 bg-stone-200 sm:grid-cols-2 lg:grid-cols-3", withHeading && "mt-14")}>
          {FEATURES.map(({ key, icon: Icon }) => (
            <li key={key} className="group bg-white p-7 transition-colors hover:bg-[#fdfcf8]">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 transition-colors group-hover:bg-brand-700 group-hover:text-white">
                <Icon size={21} aria-hidden />
              </span>
              <h3 className="mt-5 text-[1.05rem] font-semibold text-stone-900">{t(`${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{t(`${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- quality */

export async function QualitySection() {
  const t = await getTranslations("landing.quality");
  const locale = await getLocale();
  const score = new Intl.NumberFormat(toBcp47(locale), { minimumFractionDigits: 1 }).format(DEMO_REVIEW.score);
  return (
    <section className="bg-brand-900 py-20 text-white sm:py-28">
      <div className={container}>
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-accent-400">{t("eyebrow")}</p>
          <h2 className="mt-3 font-display text-3xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-4xl">{t("title")}</h2>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-brand-100/80">{t("subtitle")}</p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* translation review card */}
          <div className="rounded-3xl bg-white/[0.06] p-7 ring-1 ring-white/10 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-400/15 text-accent-400">
                <Languages size={20} aria-hidden />
              </span>
              <h3 className="text-lg font-semibold">{t("translationTitle")}</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-brand-100/75">{t("translationBody")}</p>
            <div className="mt-6 overflow-hidden rounded-2xl bg-white text-stone-800 shadow-2xl shadow-black/20">
              <dl className="divide-y divide-stone-100 text-sm">
                <div className="px-5 py-3.5">
                  <dt className="text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{t("sourceLabel")} · DE</dt>
                  <dd lang="de" className="mt-1 font-medium">{DEMO_REVIEW.source}</dd>
                </div>
                <div className="px-5 py-3.5">
                  <dt className="text-[11px] font-semibold tracking-wider text-stone-400 uppercase">{t("targetLabel")} · EN</dt>
                  <dd lang="en" className="mt-1 font-medium">{DEMO_REVIEW.target}</dd>
                </div>
                <div className="bg-brand-50/60 px-5 py-3.5">
                  <dt className="text-[11px] font-semibold tracking-wider text-brand-700 uppercase">{t("backLabel")} · DE</dt>
                  <dd lang="de" className="mt-1 font-medium text-brand-900">{DEMO_REVIEW.back}</dd>
                </div>
              </dl>
              <div className="flex items-center justify-between gap-3 border-t border-stone-100 bg-stone-50 px-5 py-3 text-xs">
                <span className="flex items-center gap-1.5 text-stone-600">
                  <Sparkles size={14} className="text-accent-600" aria-hidden />
                  {t("scoreLabel")}: <strong className="text-stone-900 tabular-nums">{score} / 5</strong>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                  <Check size={12} aria-hidden /> {t("approved")}
                </span>
              </div>
            </div>
          </div>

          {/* allergen flow card */}
          <div className="rounded-3xl bg-white/[0.06] p-7 ring-1 ring-white/10 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-400/15 text-accent-400">
                <ShieldCheck size={20} aria-hidden />
              </span>
              <h3 className="text-lg font-semibold">{t("allergenTitle")}</h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-brand-100/75">{t("allergenBody")}</p>
            <ol className="mt-6 space-y-3">
              {([1, 2, 3] as const).map((n) => (
                <li key={n} className="flex gap-4 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10">
                  <span
                    className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold",
                      n === 3 ? "bg-accent-400 text-stone-900" : "bg-white/10 text-white",
                    )}
                  >
                    {n}
                  </span>
                  <div>
                    <p className="font-semibold">{t(`step${n}Title`)}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-brand-100/75">{t(`step${n}Body`)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- how it works */

export async function HowItWorks() {
  const t = await getTranslations("landing.how");
  const steps: [LucideIcon, 1 | 2 | 3][] = [
    [Upload, 1],
    [ClipboardCheck, 2],
    [Printer, 3],
  ];
  return (
    <section id="how" className="scroll-mt-20 py-20 sm:py-28">
      <div className={container}>
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} />
        <ol className="relative mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
          <div className="absolute top-7 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-brand-200 via-accent-400/60 to-brand-200 md:block" aria-hidden />
          {steps.map(([Icon, n]) => (
            <li key={n} className="relative text-center">
              <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-stone-200 bg-white text-brand-700 shadow-sm">
                <Icon size={24} aria-hidden />
                <span className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">{n}</span>
              </span>
              <h3 className="mt-5 text-lg font-semibold text-stone-900">{t(`step${n}Title`)}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone-600">{t(`step${n}Body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- pricing */

const FEATURE_ORDER: { f: PlanFeature; key: string }[] = [
  { f: "ai_import", key: "featureAiImport" },
  { f: "tables", key: "featureTables" },
  { f: "ai_images", key: "featureAiImages" },
  { f: "custom_branding", key: "featureCustomBranding" },
  { f: "ordering", key: "featureOrdering" },
  { f: "ai_agent", key: "featureAiAgent" },
  { f: "staff_roles", key: "featureStaffRoles" },
];

export async function PricingSection({ withHeading = true }: { withHeading?: boolean }) {
  const t = await getTranslations("landing.pricing");
  const locale = await getLocale();
  const fmt = (cents: number) =>
    new Intl.NumberFormat(toBcp47(locale), {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  const num = (n: number) => new Intl.NumberFormat(toBcp47(locale)).format(n);

  return (
    <section id="pricing" className="scroll-mt-20 py-20 sm:py-28">
      <div className={container}>
        {withHeading && <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} />}
        <div className={cn("grid gap-6 lg:grid-cols-3 lg:items-stretch", withHeading && "mt-14")}>
          {PLANS.map((plan) => {
            const popular = plan.id === "starter";
            const L = plan.limits;
            const limits = [
              t("limitMenus", { count: L.menus }),
              t("limitItems", { count: num(L.items) }),
              t("limitLocales", { count: L.locales }),
              L.tables > 0 ? t("limitTables", { count: num(L.tables) }) : t("limitNoTables"),
              t("limitUsers", { count: L.users }),
              t("limitAiCredits", { count: num(L.aiCredits) }),
            ];
            return (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-3xl border bg-white p-7 sm:p-8",
                  popular ? "border-brand-700 shadow-xl shadow-brand-900/10 ring-1 ring-brand-700" : "border-stone-200 shadow-sm",
                )}
              >
                {popular && (
                  <span className="absolute -top-3 left-7 rounded-full bg-accent-500 px-3 py-1 text-xs font-bold text-stone-900 shadow-sm">
                    {t("popular")}
                  </span>
                )}
                <h3 className="font-display text-2xl font-semibold text-stone-900">{t(`${plan.id}Name`)}</h3>
                <p className="mt-1.5 min-h-10 text-sm text-stone-600">{t(`${plan.id}Tagline`)}</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-display text-5xl font-semibold tracking-tight text-stone-900 tabular-nums">{fmt(plan.priceMonthlyCents)}</span>
                  <span className="text-sm text-stone-500">{t("perMonth")}</span>
                </p>
                <p className="mt-1 text-xs text-stone-500">{t("vatIncl")}</p>
                <Link
                  href="/register"
                  className={buttonClass(popular ? "primary" : "secondary", "lg", "mt-7 w-full rounded-full")}
                >
                  {t(`${plan.id}Cta`)}
                </Link>
                <ul className="mt-8 space-y-2.5 border-t border-stone-100 pt-6 text-sm">
                  {limits.map((l) => (
                    <li key={l} className="flex items-start gap-2.5 text-stone-700">
                      <Check size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
                      {l}
                    </li>
                  ))}
                </ul>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {FEATURE_ORDER.map(({ f, key }) => {
                    const has = plan.features.includes(f);
                    return (
                      <li key={f} className={cn("flex items-start gap-2.5", has ? "text-stone-700" : "text-stone-400")}>
                        {has ? (
                          <Check size={16} className="mt-0.5 shrink-0 text-brand-600" aria-hidden />
                        ) : (
                          <Minus size={16} className="mt-0.5 shrink-0 text-stone-300" aria-hidden />
                        )}
                        <span className={cn(!has && "line-through decoration-stone-300")}>{t(key)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mx-auto mt-10 max-w-3xl space-y-1.5 text-center text-sm text-stone-500">
          <p className="flex items-center justify-center gap-1.5 font-medium text-stone-700">
            <ShieldCheck size={16} className="text-brand-600" aria-hidden /> {t("baseline")}
          </p>
          <p>{t("creditsNote")}</p>
          <p>{t("billingNote")}</p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- FAQ */

export const FAQ_KEYS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export async function FaqSection() {
  const t = await getTranslations("landing.faq");
  const tCta = await getTranslations("landing.cta");
  return (
    <section id="faq" className="scroll-mt-20 border-t border-stone-200/80 bg-white py-20 sm:py-28">
      <div className={cn(container, "grid gap-12 lg:grid-cols-[0.8fr_1.2fr]")}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading eyebrow={t("eyebrow")} title={t("title")} subtitle={t("subtitle")} align="left" />
          <Link href="/kontakt" className={buttonClass("link", "md", "mt-5 h-auto font-semibold")}>
            {tCta("secondary")} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
        <div className="divide-y divide-stone-200 border-y border-stone-200">
          {FAQ_KEYS.map((n) => (
            <details key={n} className="group py-1" name="faq">
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-6 rounded-md py-4 text-left font-semibold text-stone-900 [&::-webkit-details-marker]:hidden">
                {t(`q${n}`)}
                <Plus size={18} className="shrink-0 text-brand-600 transition-transform group-open:rotate-45" aria-hidden />
              </summary>
              <p className="pr-10 pb-5 text-[15px] leading-relaxed text-stone-600">{t(`a${n}`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- final CTA */

export async function FinalCta() {
  const t = await getTranslations("landing.cta");
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-28">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-brand-800 px-6 py-16 text-center text-white sm:px-12 sm:py-20">
        <div
          className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]"
          aria-hidden
        />
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-accent-400/20 blur-3xl" aria-hidden />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl font-display text-3xl leading-tight font-semibold text-balance sm:text-5xl">{t("title")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-brand-100/85">{t("subtitle")}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className={buttonClass("accent", "lg", "rounded-full px-8")}>
              {t("button")} <ArrowRight size={18} aria-hidden />
            </Link>
            <Link href="/kontakt" className="focus-ring rounded-full px-6 py-3 text-sm font-medium text-white/90 ring-1 ring-white/25 hover:bg-white/10">
              {t("secondary")}
            </Link>
          </div>
          <p className="mt-6 text-sm text-brand-100/70">{t("note")}</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- subpage intro */

export function PageIntro({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <section className="relative overflow-hidden border-b border-stone-200/70">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_80%_at_50%_0%,var(--color-brand-100),transparent_70%)]"
        aria-hidden
      />
      <div className={cn(container, "py-16 sm:py-20")}>
        <SectionHeading eyebrow={eyebrow} title={title} subtitle={subtitle} as="h1" />
      </div>
    </section>
  );
}
