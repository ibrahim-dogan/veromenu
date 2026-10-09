import type { ReactNode } from "react";

/** Sets <html lang/dir> before first paint (the guest root layout cannot read ?lang=). */
export function HtmlLang({ lang, dir }: { lang: string; dir: "ltr" | "rtl" }) {
  const js = `document.documentElement.lang=${JSON.stringify(lang)};document.documentElement.dir=${JSON.stringify(dir)};`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

/** Neutral full-screen message (unknown menu, temporarily unavailable …). */
export function GuestMessageScreen({ lang, dir, icon, title, text, children }: { lang: string; dir: "ltr" | "rtl"; icon: string; title: string; text: string; children?: ReactNode }) {
  return (
    <main lang={lang} dir={dir} className="grid min-h-dvh place-items-center bg-[#fbf8f2] px-6 py-16 text-center text-stone-800">
      <HtmlLang lang={lang} dir={dir} />
      <div className="max-w-sm">
        <div aria-hidden className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-white text-4xl shadow-sm ring-1 ring-stone-200">
          {icon}
        </div>
        <h1 className="font-serif text-2xl font-semibold text-balance">{title}</h1>
        <p className="mt-3 leading-relaxed text-stone-600">{text}</p>
        {children}
      </div>
    </main>
  );
}
