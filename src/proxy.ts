import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/core/i18n/routing";

const intl = createMiddleware(routing);

export default function proxy(req: NextRequest) {
  // Guest menu: no locale routing, but forward the URL so the root layout can set <html lang/dir>
  // server-side (layouts can't read search params).
  if (req.nextUrl.pathname.startsWith("/m/")) {
    const headers = new Headers(req.headers);
    headers.set("x-vm-url", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.next({ request: { headers } });
  }
  return intl(req);
}

export const config = {
  // Skip API, media, Next internals and files with an extension.
  matcher: ["/((?!api|media|_next|_vercel|.*\\..*).*)"],
};
