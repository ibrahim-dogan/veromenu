import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { desc, eq, gt, and } from "drizzle-orm";
import { db } from "@/core/db";
import { sessions } from "@/core/db/schema";
import { requireUser, listUserRestaurants } from "@/core/auth/guards";
import { SESSION_COOKIE } from "@/core/auth/session";
import { sha256 } from "@/core/crypto";
import { Link } from "@/core/i18n/navigation";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/shell/user-menu";
import { AccountForms } from "./account-forms";

export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage() {
  const user = await requireUser();
  const t = await getTranslations("account");
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const [list, mine] = await Promise.all([
    db
      .select({ id: sessions.id, userAgent: sessions.userAgent, createdAt: sessions.createdAt })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.createdAt)),
    listUserRestaurants(user.id),
  ]);
  const current = sha256(token);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href={mine.length === 1 ? `/dashboard/${mine[0].id}` : "/dashboard"}>
          <Logo />
        </Link>
        <UserMenu name={user.name} email={user.email} isPlatformAdmin={user.isPlatformAdmin} />
      </div>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="mt-1 mb-6 text-sm text-stone-500">{t("subtitle")}</p>
      <AccountForms
        user={{ name: user.name, email: user.email, locale: user.locale, verified: !!user.emailVerifiedAt, createdAt: user.createdAt.toISOString() }}
        sessions={list.map((s) => ({ id: s.id.slice(0, 8), current: s.id === current, userAgent: s.userAgent, createdAt: s.createdAt.toISOString() }))}
        restaurants={mine.map((r) => ({ id: r.id, name: r.name, roleName: r.roleName }))}
      />
    </div>
  );
}
