import "server-only";
import { getMessages } from "@/core/i18n/messages";
import { createGuestT, type GuestMessages } from "./t";

/** Guest namespace for a content locale (English fallback is merged by the message loader). */
export function getGuestMessages(locale: string): GuestMessages {
  return (getMessages(locale).guest ?? {}) as GuestMessages;
}

export function getGuestT(locale: string) {
  return createGuestT(getGuestMessages(locale));
}
