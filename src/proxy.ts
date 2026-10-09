import createMiddleware from "next-intl/middleware";
import { routing } from "@/core/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip API, guest menu (/m), media, QR images, Next internals and files with an extension.
  matcher: ["/((?!api|m/|m$|media|_next|_vercel|.*\\..*).*)"],
};
