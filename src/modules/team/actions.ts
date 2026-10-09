"use server";
import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { action } from "@/core/http/action";
import { assertRestaurantPermission } from "@/core/auth/guards";
import { audit } from "@/core/audit";
import { sendMail } from "@/core/mail";
import { DEFAULT_ROLES } from "@/core/auth/permissions";
import {
  changeMemberRole,
  createInvitation,
  createRole,
  deleteRole,
  INVITE_DAYS,
  inviteLink,
  removeMember,
  renewInvitation,
  revokeInvitation,
  updateRole,
} from "./service";

const rid = z.uuid();
const email = z.string().trim().toLowerCase().email().max(200);
const roleName = z.string().trim().min(1).max(60);
const permissions = z.array(z.string().max(60)).max(50);

async function deliverInvite(opts: { to: string; token: string; restaurant: string; inviter: string; roleName: string }) {
  const locale = await getLocale();
  const link = inviteLink(opts.token, locale);
  const t = await getTranslations({ locale, namespace: "team" });
  let emailSent = true;
  try {
    await sendMail(
      opts.to,
      t("mail.subject", { restaurant: opts.restaurant }),
      t("mail.body", { inviter: opts.inviter, restaurant: opts.restaurant, role: opts.roleName, link, days: INVITE_DAYS }),
    );
  } catch (e) {
    console.error("[team] invite mail failed", e);
    emailSent = false;
  }
  return { link, emailSent };
}

async function displayRoleName(role: { key: string | null; name: string }) {
  const locale = await getLocale();
  return (role.key && DEFAULT_ROLES.find((d) => d.key === role.key)?.name[locale]) || role.name;
}

export const inviteMemberAction = action(z.object({ restaurantId: rid, email, roleId: z.uuid() }), async ({ restaurantId, ...input }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "team.manage");
  const { invitation, token, role } = await createInvitation(ctx, input);
  await audit({ restaurantId, userId: ctx.user.id, action: "team.invite", entityType: "invitation", entityId: invitation.id, data: { email: input.email, role: role.name } });
  return deliverInvite({ to: input.email, token, restaurant: ctx.restaurant.name, inviter: ctx.user.name || ctx.user.email, roleName: await displayRoleName(role) });
});

export const renewInvitationAction = action(z.object({ restaurantId: rid, invitationId: z.uuid() }), async ({ restaurantId, invitationId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "team.manage");
  const { invitation, token, role } = await renewInvitation(ctx, invitationId);
  await audit({ restaurantId, userId: ctx.user.id, action: "team.invite_renew", entityType: "invitation", entityId: invitation.id, data: { email: invitation.email } });
  return deliverInvite({ to: invitation.email, token, restaurant: ctx.restaurant.name, inviter: ctx.user.name || ctx.user.email, roleName: await displayRoleName(role) });
});

export const revokeInvitationAction = action(z.object({ restaurantId: rid, invitationId: z.uuid() }), async ({ restaurantId, invitationId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "team.manage");
  const inv = await revokeInvitation(restaurantId, invitationId);
  await audit({ restaurantId, userId: ctx.user.id, action: "team.invite_revoke", entityType: "invitation", entityId: inv.id, data: { email: inv.email } });
  return null;
});

export const changeMemberRoleAction = action(
  z.object({ restaurantId: rid, membershipId: z.uuid(), roleId: z.uuid() }),
  async ({ restaurantId, membershipId, roleId }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "team.manage");
    const m = await changeMemberRole(ctx, membershipId, roleId);
    await audit({ restaurantId, userId: ctx.user.id, action: "team.role_change", entityType: "membership", entityId: membershipId, data: { email: m.email, roleId } });
    return null;
  },
);

export const removeMemberAction = action(z.object({ restaurantId: rid, membershipId: z.uuid() }), async ({ restaurantId, membershipId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "team.manage");
  const m = await removeMember(ctx, membershipId);
  await audit({ restaurantId, userId: ctx.user.id, action: "team.remove", entityType: "membership", entityId: membershipId, data: { email: m.email } });
  return { self: m.userId === ctx.user.id };
});

export const createRoleAction = action(z.object({ restaurantId: rid, name: roleName, permissions }), async ({ restaurantId, ...input }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "team.manage");
  const role = await createRole(ctx, input);
  await audit({ restaurantId, userId: ctx.user.id, action: "team.role_create", entityType: "role", entityId: role.id, data: { name: role.name, permissions: role.permissions } });
  return { id: role.id };
});

export const updateRoleAction = action(
  z.object({ restaurantId: rid, roleId: z.uuid(), name: roleName.optional(), permissions }),
  async ({ restaurantId, roleId, ...input }) => {
    const ctx = await assertRestaurantPermission(restaurantId, "team.manage");
    const role = await updateRole(ctx, roleId, input);
    await audit({ restaurantId, userId: ctx.user.id, action: "team.role_update", entityType: "role", entityId: role.id, data: { name: role.name, permissions: role.permissions } });
    return null;
  },
);

export const deleteRoleAction = action(z.object({ restaurantId: rid, roleId: z.uuid() }), async ({ restaurantId, roleId }) => {
  const ctx = await assertRestaurantPermission(restaurantId, "team.manage");
  const role = await deleteRole(ctx, roleId);
  await audit({ restaurantId, userId: ctx.user.id, action: "team.role_delete", entityType: "role", entityId: role.id, data: { name: role.name } });
  return null;
});
