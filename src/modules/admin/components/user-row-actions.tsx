"use client";
import { useTranslations } from "next-intl";
import { Shield, ShieldOff, Ban, CheckCircle2, KeyRound } from "lucide-react";
import { useAction } from "@/components/use-action";
import { cn } from "@/core/utils";
import { adminSendPasswordReset, adminSetPlatformAdmin, adminSetUserDisabled } from "../actions";

/**
 * Per-user actions in the admin user list (inline icon buttons – dropdowns would be clipped by the
 * scrollable table). Guard rails (self, last admin) are enforced server-side as well.
 */
export function UserRowActions({
  user,
  isSelf,
  isLastAdmin,
}: {
  user: { id: string; email: string; isPlatformAdmin: boolean; disabled: boolean };
  isSelf: boolean;
  /** true when this user is the only active admin left. */
  isLastAdmin: boolean;
}) {
  const t = useTranslations("admin.users");
  const toggleAdmin = useAction(adminSetPlatformAdmin, { success: t("updated") });
  const toggleDisabled = useAction(adminSetUserDisabled, { success: t("updated") });
  const reset = useAction(adminSendPasswordReset, { success: t("resetSent"), refresh: false });
  const pending = toggleAdmin.pending || toggleDisabled.pending || reset.pending;
  const lock = isSelf ? t("cannotSelf") : user.isPlatformAdmin && isLastAdmin ? t("lastAdmin") : null;

  const btn =
    "focus-ring grid h-8 w-8 place-items-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

  const adminLabel = user.isPlatformAdmin ? t("removeAdmin") : t("makeAdmin");
  const disableLabel = user.disabled ? t("enable") : t("disable");

  return (
    <div className={cn("flex items-center justify-end gap-0.5", pending && "pointer-events-none opacity-60")}>
      <button
        type="button"
        className={btn}
        aria-label={adminLabel}
        title={user.isPlatformAdmin && lock ? lock : adminLabel}
        disabled={user.isPlatformAdmin ? !!lock : user.disabled}
        onClick={() => {
          if (user.isPlatformAdmin) {
            if (confirm(t("confirmRemoveAdmin", { email: user.email }))) void toggleAdmin.run({ userId: user.id, isAdmin: false });
          } else void toggleAdmin.run({ userId: user.id, isAdmin: true });
        }}
      >
        {user.isPlatformAdmin ? <ShieldOff size={16} aria-hidden /> : <Shield size={16} aria-hidden />}
      </button>
      <button
        type="button"
        className={btn}
        aria-label={t("sendReset")}
        title={t("sendReset")}
        disabled={user.disabled}
        onClick={() => void reset.run({ userId: user.id })}
      >
        <KeyRound size={16} aria-hidden />
      </button>
      <button
        type="button"
        className={cn(btn, !user.disabled && "hover:bg-red-50 hover:text-red-600")}
        aria-label={disableLabel}
        title={!user.disabled && lock ? lock : disableLabel}
        disabled={!user.disabled && !!lock}
        onClick={() => {
          if (user.disabled) void toggleDisabled.run({ userId: user.id, disabled: false });
          else if (confirm(t("confirmDisable", { email: user.email }))) void toggleDisabled.run({ userId: user.id, disabled: true });
        }}
      >
        {user.disabled ? <CheckCircle2 size={16} aria-hidden /> : <Ban size={16} aria-hidden />}
      </button>
    </div>
  );
}
