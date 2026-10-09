import "server-only";
import { and, eq, inArray, like, or, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db";
import { auditLog, items, reviewTasks, translations } from "@/core/db/schema";
import type { Restaurant } from "@/core/auth/guards";

export type OnboardingStep = { key: "items" | "languages" | "translations" | "allergens" | "impressum" | "qr" | "design"; done: boolean; href: string };

/** Onboarding checklist for the dashboard overview. */
export async function getOnboarding(r: Restaurant): Promise<OnboardingStep[]> {
  const otherLocales = r.enabledLocales.filter((l) => l !== r.defaultLocale);
  const [[itemStats], [trStats], [qr], [theme]] = await Promise.all([
    db
      .select({
        total: dsql<number>`count(*)::int`,
        unconfirmed: dsql<number>`count(*) filter (where ${items.allergenStatus} <> 'confirmed')::int`,
      })
      .from(items)
      .where(eq(items.restaurantId, r.id)),
    otherLocales.length
      ? db
          .select({
            total: dsql<number>`count(*)::int`,
            pending: dsql<number>`count(*) filter (where ${translations.status} <> 'approved')::int`,
          })
          .from(translations)
          .where(and(eq(translations.restaurantId, r.id), inArray(translations.locale, otherLocales)))
      : Promise.resolve([{ total: 0, pending: 0 }]),
    db
      .select({ n: dsql<number>`count(*)::int` })
      .from(auditLog)
      .where(and(eq(auditLog.restaurantId, r.id), eq(auditLog.action, "qr.download"))),
    db
      .select({ n: dsql<number>`count(*)::int` })
      .from(auditLog)
      .where(and(eq(auditLog.restaurantId, r.id), or(like(auditLog.action, "theme.%"), like(auditLog.action, "design.%")))),
  ]);
  const s = r.settings ?? {};
  const base = `/dashboard/${r.id}`;
  return [
    { key: "items", done: itemStats.total > 0, href: `${base}/menu` },
    { key: "languages", done: r.enabledLocales.length > 1, href: `${base}/settings#languages` },
    { key: "translations", done: otherLocales.length > 0 && trStats.total > 0 && trStats.pending === 0, href: `${base}/translations` },
    { key: "allergens", done: itemStats.total > 0 && itemStats.unconfirmed === 0, href: `${base}/review` },
    { key: "impressum", done: !!(s.legal?.companyName && s.address?.street && s.address?.city), href: `${base}/settings#legal` },
    { key: "qr", done: qr.n > 0, href: `${base}/tables` },
    {
      key: "design",
      done: theme.n > 0 || r.themeId !== "classic" || Object.keys(r.themeConfig ?? {}).length > 0,
      href: `${base}/design`,
    },
  ];
}

export async function countOpenReviewTasks(restaurantId: string) {
  const [r] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(reviewTasks)
    .where(and(eq(reviewTasks.restaurantId, restaurantId), eq(reviewTasks.status, "open")));
  return r.n;
}

