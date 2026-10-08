import { NextResponse } from "next/server";
import { SESSION_COOKIE, isLoginConfigured, isSessionToken, readCookieValue } from "@/lib/auth-core";
import { readLiveSession, type LiveSession } from "@/lib/auth-store";

export async function browserSession(request: Request): Promise<LiveSession | NextResponse> {
  if (!isLoginConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Login is not configured." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const token = readCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  if (!isSessionToken(token)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const live = await readLiveSession(token).catch(() => null);
  if (!live) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  return live;
}

export function isSessionResponse(value: LiveSession | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}
