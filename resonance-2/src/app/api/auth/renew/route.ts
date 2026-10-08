import { NextResponse } from "next/server";
import { attachSessionCookie, clearSessionCookie } from "@/lib/auth-cookie";
import { SESSION_COOKIE, isSessionToken, readCookieValue, requestOrigin, safeNextPath } from "@/lib/auth-core";
import { readLiveSession } from "@/lib/auth-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Resets the 30-day cookie after the layout extends the row. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get("next"));
  const origin = requestOrigin(request);
  const token = readCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  const live = token && isSessionToken(token) ? await readLiveSession(token).catch(() => null) : null;
  if (!live || !token) {
    const response = NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(next)}`, origin),
      303,
    );
    clearSessionCookie(response);
    return response;
  }
  const response = NextResponse.redirect(new URL(next, origin), 303);
  attachSessionCookie(response, token);
  return response;
}
