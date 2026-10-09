import { getTranslations } from "next-intl/server";
import { AlertTriangle, ArrowUp, Languages, MessageCircle } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { toBcp47 } from "@/core/utils";
import type { LegalSection } from "./ui";

export type LegalDoc = "impressum" | "datenschutz" | "agb" | "avv";

/** Number of translated summary bullets per document (keys legal.<doc>.s1 … sN). */
export const SUMMARY_COUNT: Record<LegalDoc, number> = { impressum: 4, datenschutz: 6, agb: 6, avv: 5 };

/** Date of the current version of all legal texts. */
export const LEGAL_VERSION_DATE = new Date("2026-10-09T12:00:00Z");

/**
 * Shared layout for legal documents. The legally binding body is always German (lang="de");
 * en/tr visitors additionally get a translated summary box above it.
 */
export async function LegalPage({ locale, doc, sections }: { locale: string; doc: LegalDoc; sections: LegalSection[] }) {
  const t = await getTranslations("legal");
  const date = new Intl.DateTimeFormat(toBcp47(locale), { dateStyle: "long", timeZone: "Europe/Berlin" }).format(LEGAL_VERSION_DATE);
  const summary = Array.from({ length: SUMMARY_COUNT[doc] }, (_, i) => t(`${doc}.s${i + 1}`));
  const isGerman = locale === "de";

  return (
    <div className="bg-[#fafaf7]" id="top">
      <div className="mx-auto max-w-6xl px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{t("eyebrow")}</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">{t(`${doc}.title`)}</h1>
          <p className="mt-3 text-sm text-stone-500">{t("updated", { date })}</p>
        </header>

        <div
          role="note"
          className="mt-8 flex max-w-3xl items-start gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm"
        >
          <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="font-semibold">{t("bannerTitle")}</p>
            <p className="mt-1 text-sm leading-relaxed text-amber-800">{t("bannerBody")}</p>
          </div>
        </div>

        {!isGerman && (
          <section aria-labelledby="legal-summary" className="mt-6 max-w-3xl rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2 text-brand-700">
              <Languages size={18} aria-hidden />
              <h2 id="legal-summary" className="font-semibold text-stone-900">
                {t("summaryTitle")}
              </h2>
            </div>
            <p className="mt-2 text-sm text-stone-500">{t("bindingNotice")}</p>
            <ul className="mt-4 space-y-2 text-[15px] leading-relaxed text-stone-700">
              {summary.map((s, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-16">
          <article
            lang="de"
            className="max-w-3xl text-[15px] leading-relaxed text-stone-700 sm:text-base [&_a]:text-brand-700 [&_a]:underline [&_a]:decoration-brand-300 [&_a]:underline-offset-2 hover:[&_a]:decoration-brand-700 [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-stone-900 [&_li]:mt-1.5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-stone-900 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:marker:text-brand-400"
          >
            {isGerman ? null : (
              <p className="mb-6 !mt-0 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600">{t("germanTextFollows")}</p>
            )}
            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24 border-t border-stone-200 pt-8 pb-2 first:border-t-0 first:pt-0">
                <h2 id={`${s.id}-h`} className="font-display text-2xl font-semibold tracking-tight text-stone-900">
                  {s.heading}
                </h2>
                {s.content}
              </section>
            ))}

            <div className="mt-12 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-stone-600" lang={locale}>
                <MessageCircle size={16} className="text-brand-600" aria-hidden />
                {t("questions")}
              </p>
              <Link href="/kontakt" className="text-sm font-semibold" lang={locale}>
                {t("contactLink")} →
              </Link>
            </div>
          </article>

          <aside className="hidden lg:block" aria-label={t("toc")}>
            <nav className="sticky top-24 rounded-2xl border border-stone-200 bg-white p-4">
              <p className="px-2 text-xs font-semibold uppercase tracking-wider text-stone-400">{t("toc")}</p>
              <ol className="mt-3 max-h-[60vh] space-y-0.5 overflow-y-auto" lang="de">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="block rounded-md px-2 py-1.5 text-sm leading-snug text-stone-600 hover:bg-stone-100 hover:text-stone-900">
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ol>
              <a href="#top" className="mt-3 flex items-center gap-1.5 border-t border-stone-100 px-2 pt-3 text-xs font-medium text-stone-500 hover:text-brand-700">
                <ArrowUp size={13} aria-hidden /> {t("backToTop")}
              </a>
            </nav>
          </aside>
        </div>

        {/* Mobile table of contents */}
        <details className="fixed right-4 bottom-4 z-30 lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg [&::-webkit-details-marker]:hidden">
            {t("toc")}
          </summary>
          <nav className="absolute right-0 bottom-12 max-h-[60vh] w-72 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
            <ol lang="de">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded-md px-3 py-2 text-sm text-stone-700 hover:bg-stone-100">
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
            <a href="#top" className="mt-1 flex items-center gap-1.5 border-t border-stone-100 px-3 pt-2 pb-1 text-xs font-medium text-stone-500">
              <ArrowUp size={13} aria-hidden /> {t("backToTop")}
            </a>
          </nav>
        </details>
      </div>
    </div>
  );
}
