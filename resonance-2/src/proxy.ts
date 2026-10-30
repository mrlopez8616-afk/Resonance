import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { attachSessionCookie } from "@/lib/auth-cookie";
import {
  PATH_HEADER,
  SESSION_COOKIE,
  isLoggedOutVisitorHit,
  isLoginConfigured,
  planAccess,
  safeNextPath,
} from "@/lib/auth-core";
import { safeVisitPath } from "@/lib/visitors";
import { authorizePresentedCredentials } from "@/lib/auth-store";
import { bearerMatchesBackupSecret, bearerMatchesSyncSecret } from "@/lib/sync-auth-core";

async function loginVisitorHit(request: NextRequest): Promise<boolean> {
  if (request.method !== "POST" || request.nextUrl.pathname !== "/api/visitors") return false;
  let bodyPath: string | null = null;
  try {
    const body = await request.clone().json();
    const raw = body && typeof body === "object" && "path" in body ? (body as { path?: unknown }).path : null;
    bodyPath = safeVisitPath(raw);
  } catch {
    bodyPath = null;
  }
  return isLoggedOutVisitorHit({
    bodyPath,
    referer: request.headers.get("referer"),
    origin: request.nextUrl.origin,
  });
}

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
 * routes added later (GET /api/fights/breakdown). GET /api/finance is the
 * exception: the sync Bearer does not open it. GET /api/health/full is the
 * other exception: the route checks RESONANCE_HEALTH_TOKEN itself.
 * Logged-out POST /api/visitors is allowed only for the login screen and the
 * landing page, and it is not a login redirect. A signed-in beacon, including
 * Public view, still needs its session. Other writes keep their own checks.
 * Pages stay behind login.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  const authorization = request.headers.get("authorization");
  const cronRoute = pathname === "/api/cron/backup" || pathname === "/api/cron/youtube";
  const plan = planAccess({
    pathname,
    method: request.method,
    sessionToken: token,
    bearerOk: cronRoute ? bearerMatchesBackupSecret(authorization) : bearerMatchesSyncSecret(authorization),
    loginConfigured: isLoginConfigured(),
    nextPath: `${pathname}${search}`,
    loginVisitorHit: await loginVisitorHit(request),
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
