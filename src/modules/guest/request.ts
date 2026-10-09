import "server-only";
import { headers } from "next/headers";
import { decodeConfigParam } from "@/themes/config";
import { loadGuestMenu } from "./load";

export type GuestSearchParams = Record<string, string | string[] | undefined>;
export const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/** Loads the guest menu for a request: ?t= table token, ?lang=, Accept-Language, ?preview=1&theme=&config=. */
export async function loadGuestRequest(slug: string, sp: GuestSearchParams) {
  const h = await headers();
  const wantsPreview = firstParam(sp.preview) === "1";
  return loadGuestMenu(slug, {
    lang: firstParam(sp.lang),
    tableToken: firstParam(sp.t),
    acceptLanguage: h.get("accept-language"),
    preview: wantsPreview ? { themeId: firstParam(sp.theme), config: decodeConfigParam(firstParam(sp.config)) } : null,
  });
}
