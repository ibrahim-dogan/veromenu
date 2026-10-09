"use client";
import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Lock,
  Mail,
  MailCheck,
  MailWarning,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { useAction } from "@/components/use-action";
import { useRouter } from "@/core/i18n/navigation";
import { cn, toBcp47 } from "@/core/utils";
import { PERMISSION_GROUPS, type Permission } from "@/core/auth/permissions";
import { ConfirmDialog } from "@/modules/tables/components/confirm-dialog";
import { CopyButton } from "@/modules/tables/components/copy-button";
import {
  changeMemberRoleAction,
  createRoleAction,
  deleteRoleAction,
  inviteMemberAction,
  removeMemberAction,
  renewInvitationAction,
  revokeInvitationAction,
  updateRoleAction,
} from "../actions";

export type RoleDto = {
  id: string;
  key: string | null;
  name: string;
  permissions: string[];
  members: number;
  invites: number;
};
export type MemberDto = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleKey: string | null;
  joinedAt: string;
  lastLoginAt: string | null;
};
export type InvitationDto = {
  id: string;
  email: string;
  roleId: string;
  expiresAt: string;
  expired: boolean;
  invitedByName: string | null;
};

type Props = {
  restaurantId: string;
  currentUserId: string;
  actorIsOwner: boolean;
  canCustomRoles: boolean;
  members: MemberDto[];
  roles: RoleDto[];
  invitations: InvitationDto[];
  seats: { used: number; limit: number };
};

export function TeamView(props: Props) {
  const t = useTranslations("team");
  const [tab, setTab] = React.useState<"members" | "roles">("members");
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          {
            value: "members",
            label: t("tabs.members"),
            badge: (
              <span className="rounded-full bg-stone-100 px-1.5 text-xs text-stone-600">
                {props.members.length}
              </span>
            ),
          },
          { value: "roles", label: t("tabs.roles") },
        ]}
      />
      {tab === "members" ? <MembersTab {...props} /> : <RolesTab {...props} />}
    </div>
  );
}

function initials(name: string, email: string) {
  const src = name.trim() || email;
  return src
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
}

function MembersTab({
  restaurantId,
  currentUserId,
  actorIsOwner,
  members,
  roles,
  invitations,
  seats,
}: Props) {
  const t = useTranslations("team");
  const locale = useLocale();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [linkInfo, setLinkInfo] = React.useState<{
    email: string;
    link: string;
    emailSent: boolean;
  } | null>(null);
  const [removing, setRemoving] = React.useState<MemberDto | null>(null);
  const [revoking, setRevoking] = React.useState<InvitationDto | null>(null);
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const dateFmt = new Intl.DateTimeFormat(toBcp47(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const full = seats.used >= seats.limit;

  const changeRole = useAction(changeMemberRoleAction, {
    success: t("roleChanged"),
  });
  const remove = useAction(removeMemberAction, {
    success: t("removed"),
    onSuccess: (d) => {
      setRemoving(null);
      if (d.self) router.push("/dashboard");
    },
  });
  const renew = useAction(renewInvitationAction);
  const revoke = useAction(revokeInvitationAction, {
    success: t("invites.revoked"),
    onSuccess: () => setRevoking(null),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("members.title")}
          description={t("members.seats", {
            used: seats.used,
            limit: seats.limit,
          })}
          actions={
            <Button
              size="sm"
              onClick={() => setInviteOpen(true)}
              disabled={full}
            >
              <UserPlus size={14} aria-hidden /> {t("invite.button")}
            </Button>
          }
        />
        {full && (
          <p className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-sm text-amber-800">
            {t("members.full")}
          </p>
        )}
        <ul className="divide-y divide-stone-100">
          {members.map((m) => {
            const ownerLocked = m.roleKey === "owner" && !actorIsOwner;
            return (
              <li
                key={m.membershipId}
                className="flex flex-wrap items-center gap-3 px-5 py-3"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800"
                  aria-hidden
                >
                  {initials(m.name, m.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium text-stone-900">
                    {m.name || m.email}
                    {m.userId === currentUserId && (
                      <Badge tone="blue">{t("members.you")}</Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {m.email} ·{" "}
                    {t("members.joined", {
                      date: dateFmt.format(new Date(m.joinedAt)),
                    })}
                  </p>
                </div>
                <Select
                  value={m.roleId}
                  disabled={ownerLocked || changeRole.pending}
                  onChange={(e) =>
                    changeRole.run({
                      restaurantId,
                      membershipId: m.membershipId,
                      roleId: e.target.value,
                    })
                  }
                  className="h-9 w-auto min-w-36"
                  aria-label={t("members.role")}
                >
                  {roles.map((r) => (
                    <option
                      key={r.id}
                      value={r.id}
                      disabled={r.key === "owner" && !actorIsOwner}
                    >
                      {r.name}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-600 hover:bg-red-50"
                  disabled={ownerLocked}
                  onClick={() => setRemoving(m)}
                  title={t("members.remove")}
                  aria-label={t("members.remove")}
                >
                  <UserMinus size={16} aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title={t("invites.title")}
          description={t("invites.description", { days: 7 })}
        />
        {invitations.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-stone-500">
            {t("invites.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {invitations.map((inv) => {
              const expired = inv.expired;
              return (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  <Mail
                    size={18}
                    className="shrink-0 text-stone-400"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-900">
                      {inv.email}
                    </p>
                    <p className="text-xs text-stone-500">
                      {roleById.get(inv.roleId)?.name} ·{" "}
                      {expired ? (
                        <span className="text-red-600">
                          {t("invites.expired")}
                        </span>
                      ) : (
                        t("invites.expires", {
                          date: dateFmt.format(new Date(inv.expiresAt)),
                        })
                      )}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={renew.pending}
                    onClick={async () => {
                      const res = await renew.run({
                        restaurantId,
                        invitationId: inv.id,
                      });
                      if (res.ok)
                        setLinkInfo({ email: inv.email, ...res.data });
                    }}
                  >
                    <RefreshCw size={14} aria-hidden /> {t("invites.resend")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => setRevoking(inv)}
                    title={t("invites.revoke")}
                    aria-label={t("invites.revoke")}
                  >
                    <Trash2 size={16} aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {inviteOpen && (
        <InviteDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          restaurantId={restaurantId}
          roles={roles.filter((r) => r.key !== "owner" || actorIsOwner)}
          memberEmails={members.map((m) => m.email.toLowerCase())}
          onInvited={(info) => {
            setInviteOpen(false);
            setLinkInfo(info);
          }}
        />
      )}
      <InviteLinkDialog info={linkInfo} onClose={() => setLinkInfo(null)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          void (
            removing &&
            remove.run({ restaurantId, membershipId: removing.membershipId })
          )
        }
        pending={remove.pending}
        danger
        title={
          removing?.userId === currentUserId
            ? t("members.leaveTitle")
            : t("members.removeTitle", {
                name: removing?.name || removing?.email || "",
              })
        }
        description={
          removing?.userId === currentUserId
            ? t("members.leaveDescription")
            : t("members.removeDescription")
        }
        confirmLabel={t("members.remove")}
      />
      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={() =>
          void (
            revoking && revoke.run({ restaurantId, invitationId: revoking.id })
          )
        }
        pending={revoke.pending}
        danger
        title={t("invites.revokeTitle", { email: revoking?.email ?? "" })}
        description={t("invites.revokeDescription")}
        confirmLabel={t("invites.revoke")}
      />
    </div>
  );
}

function InviteDialog({
  open,
  onClose,
  restaurantId,
  roles,
  memberEmails,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  restaurantId: string;
  roles: RoleDto[];
  memberEmails: string[];
  onInvited: (info: {
    email: string;
    link: string;
    emailSent: boolean;
  }) => void;
}) {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  const defaultRole =
    roles.find((r) => r.key === "service") ??
    roles.find((r) => r.key !== "owner") ??
    roles[0];
  const [email, setEmail] = React.useState("");
  const [roleId, setRoleId] = React.useState(defaultRole?.id ?? "");
  const invite = useAction(inviteMemberAction, {
    onSuccess: (d) => onInvited({ email, ...d }),
  });
  const already = memberEmails.includes(email.trim().toLowerCase());
  const role = roles.find((r) => r.id === roleId);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("invite.title")}
      description={t("invite.description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            type="submit"
            form="invite-form"
            loading={invite.pending}
            disabled={already}
          >
            <Mail size={14} aria-hidden /> {t("invite.submit")}
          </Button>
        </>
      }
    >
      <form
        id="invite-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!already) invite.run({ restaurantId, email, roleId });
        }}
      >
        <Field
          label={tc("email")}
          htmlFor="inv-email"
          error={
            already
              ? t("invite.alreadyMember")
              : invite.fieldErrors.email
                ? t("invite.invalidEmail")
                : undefined
          }
        >
          <Input
            id="inv-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
            aria-invalid={already || !!invite.fieldErrors.email}
          />
        </Field>
        <Field label={t("members.role")} htmlFor="inv-role">
          <Select
            id="inv-role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        {role && <PermissionSummary permissions={role.permissions} />}
      </form>
    </Dialog>
  );
}

function PermissionSummary({ permissions }: { permissions: string[] }) {
  const tp = useTranslations("permissions");
  if (!permissions.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {permissions.map((p) => (
        <li key={p}>
          <Badge tone="green">{tp(p)}</Badge>
        </li>
      ))}
    </ul>
  );
}

function InviteLinkDialog({
  info,
  onClose,
}: {
  info: { email: string; link: string; emailSent: boolean } | null;
  onClose: () => void;
}) {
  const t = useTranslations("team");
  const tc = useTranslations("common");
  return (
    <Dialog
      open={!!info}
      onClose={onClose}
      title={t("invite.sentTitle")}
      footer={<Button onClick={onClose}>{tc("close")}</Button>}
    >
      {info && (
        <div className="space-y-4">
          <p
            className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
              info.emailSent
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-800",
            )}
          >
            {info.emailSent ? (
              <MailCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
            ) : (
              <MailWarning size={16} className="mt-0.5 shrink-0" aria-hidden />
            )}
            {info.emailSent
              ? t("invite.emailSent", { email: info.email })
              : t("invite.emailFailed")}
          </p>
          <div>
            <p className="mb-1.5 text-sm font-medium text-stone-700">
              {t("invite.linkLabel")}
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700">
                {info.link}
              </code>
              <CopyButton value={info.link} />
            </div>
            <p className="mt-1.5 text-xs text-stone-500">
              {t("invite.linkHint")}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function RolesTab({ restaurantId, roles, canCustomRoles }: Props) {
  const t = useTranslations("team");
  const [editing, setEditing] = React.useState<RoleDto | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<RoleDto | null>(null);
  const del = useAction(deleteRoleAction, {
    success: t("roles.deleted"),
    onSuccess: () => setDeleting(null),
  });

  return (
    <div className="space-y-4">
      {!canCustomRoles && (
        <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
          {t("roles.locked")}
        </div>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => setEditing("new")}
          disabled={!canCustomRoles}
        >
          <Plus size={14} aria-hidden /> {t("roles.create")}
        </Button>
      </div>
      {roles.length === 0 ? (
        <EmptyState icon={<ShieldCheck size={28} />} title={t("roles.empty")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((r) => {
            const isOwner = r.key === "owner";
            const unused = r.members === 0;
            return (
              <Card key={r.id} className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-stone-900">
                      {r.name}
                      {isOwner ? (
                        <Badge tone="yellow">
                          <Lock size={11} aria-hidden />{" "}
                          {t("roles.lockedBadge")}
                        </Badge>
                      ) : r.key ? (
                        <Badge>{t("roles.system")}</Badge>
                      ) : (
                        <Badge tone="purple">{t("roles.custom")}</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {t("roles.memberCount", { count: r.members })} ·{" "}
                      {t("roles.permissionCount", {
                        count: r.permissions.length,
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(r)}
                      title={
                        isOwner || !canCustomRoles
                          ? t("roles.view")
                          : t("roles.edit")
                      }
                      aria-label={t("roles.edit")}
                    >
                      <Pencil size={15} aria-hidden />
                    </Button>
                    {!r.key && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:bg-red-50"
                        disabled={!unused}
                        onClick={() => setDeleting(r)}
                        title={unused ? t("roles.delete") : t("roles.inUse")}
                        aria-label={t("roles.delete")}
                      >
                        <Trash2 size={15} aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <PermissionSummary permissions={r.permissions} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <RoleDialog
        key={editing === "new" ? "new" : (editing?.id ?? "none")}
        restaurantId={restaurantId}
        role={editing}
        readOnly={
          editing !== null &&
          editing !== "new" &&
          (editing.key === "owner" || !canCustomRoles)
        }
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          void (deleting && del.run({ restaurantId, roleId: deleting.id }))
        }
        pending={del.pending}
        danger
        title={t("roles.deleteTitle", { name: deleting?.name ?? "" })}
        description={
          deleting && deleting.invites > 0
            ? t("roles.deleteWithInvites", { count: deleting.invites })
            : t("roles.deleteDescription")
        }
        confirmLabel={t("roles.delete")}
      />
    </div>
  );
}

function RoleDialog({
  restaurantId,
  role,
  readOnly,
  onClose,
}: {
  restaurantId: string;
  role: RoleDto | "new" | null;
  readOnly: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("team");
  const tp = useTranslations("permissions");
  const tc = useTranslations("common");
  const existing = role && role !== "new" ? role : null;
  const [name, setName] = React.useState(existing?.name ?? "");
  const [perms, setPerms] = React.useState<Set<string>>(
    new Set(existing?.permissions ?? ["menu.view"]),
  );
  const create = useAction(createRoleAction, {
    success: t("roles.created"),
    onSuccess: onClose,
  });
  const update = useAction(updateRoleAction, {
    success: tc("saved"),
    onSuccess: onClose,
  });

  const toggle = (p: string) =>
    setPerms((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const toggleGroup = (list: Permission[], on: boolean) =>
    setPerms((s) => {
      const n = new Set(s);
      list.forEach((p) => (on ? n.add(p) : n.delete(p)));
      return n;
    });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return onClose();
    const permissions = [...perms];
    if (existing)
      update.run({
        restaurantId,
        roleId: existing.id,
        name: existing.key ? undefined : name,
        permissions,
      });
    else create.run({ restaurantId, name, permissions });
  }

  return (
    <Dialog
      open={role !== null}
      onClose={onClose}
      size="lg"
      title={
        existing
          ? readOnly
            ? existing.name
            : t("roles.editTitle", { name: existing.name })
          : t("roles.createTitle")
      }
      description={
        existing?.key === "owner"
          ? t("roles.ownerLocked")
          : t("roles.matrixHint")
      }
      footer={
        readOnly ? (
          <Button onClick={onClose}>{tc("close")}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              form="role-form"
              loading={create.pending || update.pending}
            >
              {tc("save")}
            </Button>
          </>
        )
      }
    >
      <form id="role-form" onSubmit={submit} className="space-y-5">
        <Field
          label={tc("name")}
          htmlFor="role-name"
          hint={existing?.key ? t("roles.systemNameHint") : undefined}
        >
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            disabled={readOnly || !!existing?.key}
            placeholder={t("roles.namePlaceholder")}
          />
        </Field>
        <div className="space-y-4">
          {Object.entries(PERMISSION_GROUPS).map(([group, list]) => {
            const all = list.every((p) => perms.has(p));
            return (
              <fieldset
                key={group}
                className="rounded-xl border border-stone-200"
              >
                <legend className="sr-only">{tp(`group.${group}`)}</legend>
                <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-2 rounded-t-xl">
                  <span className="text-sm font-semibold text-stone-800">
                    {tp(`group.${group}`)}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      className="text-xs font-medium text-brand-700 hover:underline"
                      onClick={() => toggleGroup(list, !all)}
                    >
                      {all ? t("roles.noneInGroup") : t("roles.allInGroup")}
                    </button>
                  )}
                </div>
                <div className="grid gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-2">
                  {list.map((p) => (
                    <label
                      key={p}
                      className={cn(
                        "flex items-center gap-2 text-sm text-stone-700",
                        readOnly ? "cursor-default" : "cursor-pointer",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-700"
                        checked={perms.has(p)}
                        disabled={readOnly}
                        onChange={() => toggle(p)}
                      />
                      {tp(p)}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      </form>
    </Dialog>
  );
}
