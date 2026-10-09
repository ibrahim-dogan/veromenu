import type { PlanFeature } from "@/modules/billing/plans";

/** Feature modules an admin can switch per restaurant (`restaurants.modules`); still gated by the plan. */
export const ADMIN_MODULES = ["ordering", "tables", "ai_agent", "ai_images", "ai_import", "custom_branding", "staff_roles"] as const satisfies readonly PlanFeature[];
export type AdminModule = (typeof ADMIN_MODULES)[number];
