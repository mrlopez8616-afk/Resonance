import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  GATE_COOKIE_NAME,
  getAppPassword,
  verifyGateToken,
} from "@/lib/app-gate";

const PUBLIC_PATHS = new Set([
  "/unlock",
  "/api/gate",
  "/api/health",
  "/api/public",
]);

function isDecisionSyncApi(pathname: string): boolean {
  return (
    pathname === "/api/decisions" ||
    pathname.startsWith("/api/decisions/") ||
    pathname === "/api/todos" ||
    pathname.startsWith("/api/todos/") ||
    pathname === "/api/attest" ||
    pathname.startsWith("/api/attest/") ||
    pathname === "/api/ack" ||
    pathname.startsWith("/api/ack/")
  );
}

export function proxy(request: NextRequest) {
  const password = getAppPassword();
  if (!password) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const unlocked = verifyGateToken(
    password,
    request.cookies.get(GATE_COOKIE_NAME)?.value,
  );

  if (pathname === "/unlock") {
    if (unlocked) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/api/gate") ||
    isDecisionSyncApi(pathname)
  ) {
    return NextResponse.next();
  }

  if (unlocked) {
    return NextResponse.next();
  }

  const unlock = request.nextUrl.clone();
  unlock.pathname = "/unlock";
  unlock.search = "";
  if (pathname !== "/") {
    unlock.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|examples/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
