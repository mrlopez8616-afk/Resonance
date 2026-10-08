import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { attachSessionCookie } from "@/lib/auth-cookie";
import {
  PATH_HEADER,
  SESSION_COOKIE,
  isLoginConfigured,
  planAccess,
  safeNextPath,
} from "@/lib/auth-core";
import { authorizePresentedCredentials } from "@/lib/auth-store";
import { bearerMatchesSyncSecret } from "@/lib/sync-auth-core";

function continueWithPath(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

function unauthorized() {
  return NextResponse.json(
    { ok: false, error: "Unauthorized." },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Cookie shape is checked here. Pages with a well-formed cookie continue so
 * the root layout can validate the row. GET /api is session-or-Bearer, including
 * routes added later (GET /api/fights/breakdown). Writes keep their own checks.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  const authorization = request.headers.get("authorization");
  const plan = planAccess({
    pathname,
    method: request.method,
    sessionToken: token,
    bearerOk: bearerMatchesSyncSecret(authorization),
    loginConfigured: isLoginConfigured(),
    nextPath: `${pathname}${search}`,
  });

  if (plan.kind === "deny") return unauthorized();

  if (plan.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", safeNextPath(plan.next));
    return NextResponse.redirect(url);
  }

  if (plan.kind === "allow-session") {
    const access = await authorizePresentedCredentials({
      cookieToken: token,
      authorization,
    });
    if (!access.ok) return unauthorized();
    const response = continueWithPath(request);
    if (access.resetCookie && access.token) attachSessionCookie(response, access.token);
    return response;
  }

  return continueWithPath(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
