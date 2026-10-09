import { getTranslations } from "next-intl/server";
import { redirect } from "@/core/i18n/navigation";
import { getCurrentUser } from "@/core/auth/session";
import { RegisterForm } from "./register-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("register") };
}

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  if (await getCurrentUser()) redirect({ href: "/dashboard", locale });
  return <RegisterForm />;
}
