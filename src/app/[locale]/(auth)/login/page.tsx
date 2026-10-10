import { getTranslations } from "next-intl/server";
import { redirect } from "@/core/i18n/navigation";
import { getCurrentUser } from "@/core/auth/session";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("login") };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  const sp = await searchParams;
  if (await getCurrentUser()) redirect({ href: "/dashboard", locale });
  const t = await getTranslations("auth");
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return <LoginForm notice={sp.reset ? t("passwordChanged") : undefined} next={next} />;
}
