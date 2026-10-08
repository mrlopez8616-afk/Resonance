import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  PATH_HEADER,
  SESSION_COOKIE,
  isLoginConfigured,
  isLoginPage,
  safeNextPath,
  type UserRole,
} from "@/lib/auth-core";
import { readLiveSession, type AuthSession, type LiveSession } from "@/lib/auth-store";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export type SessionUser = {
  userId: string;
  username: string;
  role: UserRole;
};

export type { AuthSession };

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
  if (isLoginPage(next)) redirect("/login");
  if (!isLoginConfigured()) redirect("/login?reason=unconfigured");
  let live: LiveSession | null = null;
  try {
    const token = await cookieToken();
    live = token ? await readLiveSession(token) : null;
  } catch (error) {
    if (isStorageUnavailable(error)) redirect("/login?reason=unavailable");
    throw error;
  }
  if (!live) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (live.resetCookie) redirect(`/api/auth/renew?next=${encodeURIComponent(next)}`);
  const user = sessionUser(live.session);
  if (options?.role && user.role !== options.role) redirect("/");
  return user;
}

/** Owner-only gate. Finance pages call this. */
export async function requireRole(role: UserRole): Promise<SessionUser> {
  return requireSession({ role });
}
