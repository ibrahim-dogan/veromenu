import { requireUser } from "@/core/auth/guards";

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
