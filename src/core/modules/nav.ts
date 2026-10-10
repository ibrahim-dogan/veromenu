import type { Permission } from "@/core/auth/permissions";
import type { PlanFeature } from "@/modules/billing/plans";

/**
 * Navigation registry. Every feature module registers its screens here; the dashboard / admin
 * sidebars are generated from it and filtered by the user's permissions and the restaurant plan.
 * Label key = messages "nav.<key>". Icon = lucide-react icon name (see components/shell/icons.tsx).
 */
export type NavItem = {
  key: string;
  /** Path segment below /dashboard/[rid] (empty string = overview) or below /admin. */
  href: string;
  icon: string;
  permission?: Permission;
  feature?: PlanFeature;
  group: "main" | "quality" | "operations" | "settings";
};

export const DASHBOARD_NAV: NavItem[] = [
  { key: "overview", href: "", icon: "LayoutDashboard", group: "main" },
  { key: "menu", href: "menu", icon: "BookOpen", permission: "menu.view", group: "main" },
  { key: "assistant", href: "assistant", icon: "Sparkles", permission: "ai.use", feature: "ai_agent", group: "main" },
  { key: "import", href: "import", icon: "FileUp", permission: "ai.use", feature: "ai_import", group: "main" },
  { key: "media", href: "media", icon: "Images", permission: "media.manage", group: "main" },
  { key: "review", href: "review", icon: "ShieldCheck", permission: "allergens.review", group: "quality" },
  { key: "translations", href: "translations", icon: "Languages", permission: "translations.manage", group: "quality" },
  { key: "orders", href: "orders", icon: "ConciergeBell", permission: "orders.view", feature: "ordering", group: "operations" },
  { key: "tables", href: "tables", icon: "QrCode", permission: "tables.manage", group: "operations" },
  { key: "stats", href: "stats", icon: "BarChart3", permission: "stats.view", group: "operations" },
  { key: "design", href: "design", icon: "Palette", permission: "theme.manage", group: "settings" },
  { key: "team", href: "team", icon: "Users", permission: "team.manage", group: "settings" },
  { key: "settings", href: "settings", icon: "Settings", permission: "settings.manage", group: "settings" },
];

export const ADMIN_NAV: { key: string; href: string; icon: string }[] = [
  { key: "adminOverview", href: "", icon: "LayoutDashboard" },
  { key: "adminRestaurants", href: "restaurants", icon: "Store" },
  { key: "adminUsers", href: "users", icon: "Users" },
  { key: "adminAi", href: "ai", icon: "Bot" },
  { key: "adminThemes", href: "themes", icon: "Palette" },
  { key: "adminAudit", href: "audit", icon: "ScrollText" },
];
