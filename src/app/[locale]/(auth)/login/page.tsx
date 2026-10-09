import { getTranslations } from "next-intl/server";
import { redirect } from "@/core/i18n/navigation";
import { getCurrentUser } from "@/core/auth/session";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("login") };
}

export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  if (await getCurrentUser()) redirect({ href: "/dashboard", locale });
  return <LoginForm />;
}
