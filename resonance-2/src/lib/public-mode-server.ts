import "server-only";

import { cookies } from "next/headers";
import { SESSION_COOKIE, isSessionToken, readCookieValue } from "@/lib/auth-core";
import { getSession } from "@/lib/auth-session";
import { readLiveSession } from "@/lib/auth-store";
import { PUBLIC_MODE_COOKIE, publicModeEnabled } from "@/lib/public-mode";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

/** True only for an owner session that has turned the public cookie on. */
export async function isPublicMode(): Promise<boolean> {
  const jar = await cookies();
  if (!publicModeEnabled(jar.get(PUBLIC_MODE_COOKIE)?.value)) return false;
  const session = await getSession();
  return session?.role === "owner";
}

/** Same check for a route handler, using the request cookie rather than `cookies()`. */
export async function requestIsPublicMode(request: Request): Promise<boolean> {
  const header = request.headers.get("cookie");
  if (!publicModeEnabled(readCookieValue(header, PUBLIC_MODE_COOKIE))) return false;
  const token = readCookieValue(header, SESSION_COOKIE);
  if (!token || !isSessionToken(token)) return false;
  try {
    const live = await readLiveSession(token);
    return live?.session.role === "owner";
  } catch (error) {
    if (isStorageUnavailable(error)) return false;
    throw error;
  }
}

export function privateModeResponse(): Response {
  return Response.json(
    { ok: false, error: "Private." },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}
