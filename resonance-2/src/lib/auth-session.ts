import "server-only";

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  PATH_HEADER,
  SESSION_COOKIE,
  isLoginConfigured,
  isLoginPage,
  readCookieValue,
  safeNextPath,
  type UserRole,
} from "@/lib/auth-core";
import {
  readLiveSession,
  readSessionPresentation,
  type AuthSession,
  type LiveSession,
} from "@/lib/auth-store";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export type SessionUser = {
  userId: string;
  username: string;
  role: UserRole;
};

export type { AuthSession };

async function redirectTo(path: string): Promise<never> {
  const { redirect } = await import("next/navigation");
  return redirect(path);
}

function sessionUser(session: AuthSession): SessionUser {
  return { userId: session.userId, username: session.username, role: session.role };
}

async function cookieToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

async function currentPath(): Promise<string> {
  const headerList = await headers();
  return safeNextPath(headerList.get(PATH_HEADER));
}

export async function getSession(): Promise<SessionUser | null> {
  const live = await readRequestSession();
  return live ? sessionUser(live.session) : null;
}

export async function readRequestSession(): Promise<LiveSession | null> {
  if (!isLoginConfigured()) return null;
  const token = await cookieToken();
  if (!token) return null;
  try {
    return await readLiveSession(token);
  } catch (error) {
    if (isStorageUnavailable(error)) return null;
    throw error;
  }
}

/** Database check for pages. Revoked rows redirect immediately. */
export async function requireSession(options?: { role?: UserRole }): Promise<SessionUser> {
  const next = await currentPath();
  if (isLoginPage(next)) return redirectTo("/login");
  if (!isLoginConfigured()) return redirectTo("/login?reason=unconfigured");
  let live: LiveSession | null = null;
  try {
    const token = await cookieToken();
    live = token ? await readLiveSession(token) : null;
  } catch (error) {
    if (isStorageUnavailable(error)) return redirectTo("/login?reason=unavailable");
    throw error;
  }
  if (!live) return redirectTo(`/login?next=${encodeURIComponent(next)}`);
  if (live.resetCookie) return redirectTo(`/api/auth/renew?next=${encodeURIComponent(next)}`);
  const user = sessionUser(live.session);
  if (options?.role && user.role !== options.role) return redirectTo("/");
  return user;
}

function denied(status: 401 | 403, error: string): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/** Finance pages call `requireRole(role)`. A route passes the request and gets 401 or 403. */
export async function requireRole(role: UserRole): Promise<SessionUser>;
export async function requireRole(role: UserRole, request: Request): Promise<SessionUser | NextResponse>;
export async function requireRole(
  role: UserRole,
  request?: Request,
): Promise<SessionUser | NextResponse> {
  if (!request) return requireSession({ role });
  if (!isLoginConfigured()) return denied(401, "Unauthorized.");
  const token = readCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!token) return denied(401, "Unauthorized.");
  let presented: Awaited<ReturnType<typeof readSessionPresentation>>;
  try {
    presented = await readSessionPresentation(token);
  } catch (error) {
    if (isStorageUnavailable(error)) return denied(401, "Unauthorized.");
    throw error;
  }
  if (presented.kind === "forbidden") return denied(403, "Forbidden.");
  if (presented.kind !== "live") return denied(401, "Unauthorized.");
  const user = sessionUser(presented.live.session);
  if (user.role !== role) return denied(403, "Forbidden.");
  return user;
}
