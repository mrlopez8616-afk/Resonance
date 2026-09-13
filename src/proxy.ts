import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  GATE_COOKIE_NAME,
  getAppPassword,
  verifyGateToken,
} from "@/lib/app-gate";
import { isApiPath, shouldBypassAppGate } from "@/lib/app-gate-paths";

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

  if (shouldBypassAppGate(pathname)) {
    return NextResponse.next();
  }

  if (unlocked) {
    return NextResponse.next();
  }

  // Locked fetch to an API that is not in the Decision-sync pass-through
  // list must stay JSON. An HTML /unlock redirect makes response.json()
  // throw and the UI shows a fake "network error".
  if (isApiPath(pathname)) {
    return NextResponse.json(
      { ok: false, error: "Unlock the site and try again." },
      { status: 401 },
    );
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
