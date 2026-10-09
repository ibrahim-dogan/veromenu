import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/core/utils";

/** Server-side pagination links that keep the current filters (query string). */
export async function Pagination({
  basePath,
  params,
  page,
  pages,
  hasMore,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  /** Total pages when known; otherwise pass hasMore. */
  pages?: number;
  hasMore?: boolean;
}) {
  const t = await getTranslations("admin.pagination");
  const next = pages ? page < pages : !!hasMore;
  if (page <= 1 && !next) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };
  const btn = "focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50";
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm text-stone-500" aria-label="Pagination">
      <span>{pages ? t("pageOf", { page, pages }) : t("page", { page })}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn}>
            <ChevronLeft size={15} aria-hidden /> {t("prev")}
          </Link>
        ) : (
          <span className={cn(btn, "pointer-events-none opacity-40")}>
            <ChevronLeft size={15} aria-hidden /> {t("prev")}
          </span>
        )}
        {next ? (
          <Link href={href(page + 1)} className={btn}>
            {t("next")} <ChevronRight size={15} aria-hidden />
          </Link>
        ) : (
          <span className={cn(btn, "pointer-events-none opacity-40")}>
            {t("next")} <ChevronRight size={15} aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}
