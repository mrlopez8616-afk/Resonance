import { NextResponse } from "next/server";
import { SESSION_MAX_AGE_SEC, authNow, isSameOriginRequest } from "@/lib/auth-core";
import { requireRole } from "@/lib/auth-session";
import { coarseUserAgent, lockoutRemainingMs, type ModeDirection } from "@/lib/owner-pin";
import { appendModeLog, checkOwnerPin } from "@/lib/owner-pin-store";
import { PUBLIC_MODE_COOKIE } from "@/lib/public-mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function enabledFrom(value: unknown): boolean | null {
  if (value === true || value === "1" || value === "true") return true;
  if (value === false || value === "0" || value === "false") return false;
  return null;
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function lockPayload(lockedUntil: number | null, now: number) {
  return {
    ok: false,
    error: "Locked.",
    lockedUntil: lockedUntil === null ? null : new Date(lockedUntil).toISOString(),
    retryInSec: Math.ceil(lockoutRemainingMs(lockedUntil, now) / 1000),
  };
}

/**
 * Owner session plus the owner PIN, both directions.
 * A signed-out request is 401 and does not set the cookie.
 * The PIN is not logged and is not returned.
 */
export async function POST(request: Request) {
  const gate = await requireRole("owner", request);
  if (gate instanceof NextResponse) return gate;
  if (!isSameOriginRequest(request)) return json(403, { ok: false, error: "Forbidden." });

  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    return json(415, { ok: false, error: "Use the PIN form." });
  }
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; pin?: unknown } | null;
  const enabled = enabledFrom(body?.enabled);
  if (enabled === null) return json(422, { ok: false, error: "Choose public or private." });
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const direction: ModeDirection = enabled ? "public" : "private";
  const now = authNow();
  const userAgent = coarseUserAgent(request.headers.get("user-agent"));
  const attempt = await checkOwnerPin(pin, now);
  if (!attempt.ok) {
    await appendModeLog({ at: now, direction, outcome: "failure", userAgent });
    if (attempt.reason === "locked" || attempt.lock.lockedUntil !== null) {
      return json(423, lockPayload(attempt.lock.lockedUntil, now));
    }
    if (attempt.reason === "unset") return json(409, { ok: false, error: "Set a PIN first." });
    if (attempt.reason === "invalid") {
      return json(422, { ok: false, error: "Enter a 4 to 6 digit PIN." });
    }
    return json(403, { ok: false, error: "Wrong PIN." });
  }

  await appendModeLog({ at: now, direction, outcome: "success", userAgent });
  const response = json(200, { ok: true, public: enabled });
  response.cookies.set({
    name: PUBLIC_MODE_COOKIE,
    value: enabled ? "1" : "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: enabled ? SESSION_MAX_AGE_SEC : 0,
  });
  return response;
}
