/**
 * Restaurant-scoped permissions. Roles are just named sets of these strings,
 * so owners can build custom roles ("Service", "Küche", "Social Media") in the team screen.
 * Labels: messages/<locale>/permissions.json
 */
export const PERMISSIONS = [
  "menu.view",
  "menu.edit",
  "menu.availability", // toggle sold-out only (service staff)
  "translations.manage",
  "allergens.review",
  "media.manage",
  "tables.manage",
  "orders.view",
  "orders.manage",
  "stats.view",
  "settings.manage", // restaurant profile, legal, languages, ordering rules
  "theme.manage",
  "team.manage",
  "ai.use", // AI agent, imports, image generation
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_GROUPS: Record<string, Permission[]> = {
  menu: ["menu.view", "menu.edit", "menu.availability", "media.manage"],
  quality: ["translations.manage", "allergens.review"],
  operations: ["tables.manage", "orders.view", "orders.manage"],
  insights: ["stats.view"],
  administration: ["settings.manage", "theme.manage", "team.manage", "ai.use"],
};

/** Default roles created for every new restaurant. */
export const DEFAULT_ROLES: { key: string; name: Record<string, string>; permissions: Permission[] }[] = [
  { key: "owner", name: { de: "Inhaber", en: "Owner", tr: "Sahip" }, permissions: [...PERMISSIONS] },
  {
    key: "manager",
    name: { de: "Manager", en: "Manager", tr: "Müdür" },
    permissions: PERMISSIONS.filter((p) => p !== "team.manage"),
  },
  {
    key: "service",
    name: { de: "Service", en: "Service", tr: "Servis" },
    permissions: ["menu.view", "menu.availability", "orders.view", "orders.manage"],
  },
  { key: "kitchen", name: { de: "Küche", en: "Kitchen", tr: "Mutfak" }, permissions: ["orders.view", "orders.manage", "menu.availability"] },
  {
    key: "editor",
    name: { de: "Redakteur", en: "Editor", tr: "Editör" },
    permissions: ["menu.view", "menu.edit", "media.manage", "translations.manage", "allergens.review", "ai.use"],
  },
];

export const isPermission = (p: string): p is Permission => (PERMISSIONS as readonly string[]).includes(p);
