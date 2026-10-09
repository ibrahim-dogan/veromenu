import { getLocale, getTranslations } from "next-intl/server";
import { requireRestaurant } from "@/core/auth/guards";
import { DEFAULT_ROLES } from "@/core/auth/permissions";
import { PageHeader } from "@/components/ui";
import { planHas } from "@/modules/billing/plans";
import { listInvitations, listMembers, listRoles, seatUsage } from "@/modules/team/service";
import { TeamView } from "@/modules/team/components/team-view";

export default async function TeamPage({ params }: PageProps<"/[locale]/dashboard/[rid]/team">) {
  const { rid } = await params;
  const ctx = await requireRestaurant(rid, "team.manage");
  const t = await getTranslations("team");
  const locale = await getLocale();
  const [members, roles, invitations, seats] = await Promise.all([listMembers(rid), listRoles(rid), listInvitations(rid), seatUsage(rid)]);

  // System roles are shown in the viewer's UI language.
  const roleName = (r: { key: string | null; name: string }) => (r.key && DEFAULT_ROLES.find((d) => d.key === r.key)?.name[locale]) || r.name;
  const me = members.find((m) => m.userId === ctx.user.id);
  const now = new Date().getTime();
  const actorIsOwner = ctx.isAdminOverride || ctx.user.isPlatformAdmin || me?.roleKey === "owner";

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <TeamView
        restaurantId={rid}
        currentUserId={ctx.user.id}
        actorIsOwner={actorIsOwner}
        canCustomRoles={planHas(ctx.restaurant.plan, "staff_roles")}
        seats={{ used: seats.used, limit: seats.limit }}
        roles={roles.map((r) => ({ id: r.id, key: r.key, name: roleName(r), permissions: r.permissions, members: r.members, invites: r.invites }))}
        members={members.map((m) => ({
          ...m,
          joinedAt: m.joinedAt.toISOString(),
          lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
        }))}
        invitations={invitations.map((i) => ({
          id: i.id,
          email: i.email,
          roleId: i.roleId,
          expiresAt: i.expiresAt.toISOString(),
          expired: i.expiresAt.getTime() < now,
          invitedByName: i.invitedByName,
        }))}
      />
    </>
  );
}
