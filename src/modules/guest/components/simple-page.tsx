import "server-only";
import type { CSSProperties, ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/core/utils";
import { resolveTheme } from "@/themes";
import { guestFontVariables } from "@/themes/fonts";
import { HtmlLang } from "./screens";

/**
 * Themed shell for secondary guest pages (order status, imprint): uses the restaurant's theme colours
 * and fonts without rendering the full theme.
 */
export async function GuestSimplePage({
  themeId,
  themeConfig,
  lang,
  dir,
  backHref,
  backLabel,
  children,
}: {
  themeId: string;
  themeConfig: unknown;
  lang: string;
  dir: "ltr" | "rtl";
  backHref: string;
  backLabel: string;
  children: ReactNode;
}) {
  const { theme, config } = await resolveTheme(themeId, themeConfig);
  const vars = theme.cssVars(config);
  const Back = dir === "rtl" ? ArrowRight : ArrowLeft;
  return (
    <div lang={lang} dir={dir} style={vars as CSSProperties} className={cn(guestFontVariables, theme.rootClassName?.(config), "vm-root bg-g-bg text-g-text font-g-body min-h-dvh")}>
      <HtmlLang lang={lang} dir={dir} />
      <style>{`html,body{background:${/^#[0-9a-f]{3,8}$/i.test(vars["--g-bg"]) ? vars["--g-bg"] : "#fff"}}`}</style>
      <div className="mx-auto max-w-xl px-5 pt-4 pb-16">
        <a href={backHref} className="text-g-muted hover:text-g-text inline-flex h-10 items-center gap-2 text-sm font-medium">
          <Back size={16} aria-hidden /> {backLabel}
        </a>
        <main className="mt-4">{children}</main>
      </div>
    </div>
  );
}
