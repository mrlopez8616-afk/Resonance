import { NextResponse } from "next/server";
import { authNow, isSameOriginRequest } from "@/lib/auth-core";
import { requireRole } from "@/lib/auth-session";
import { totpMatches } from "@/lib/auth-totp";
import { isPinShape, lockoutRemainingMs } from "@/lib/owner-pin";
import {
  checkOwnerPin,
  readLockout,
  readOwnerPinHash,
  saveNewOwnerPin,
} from "@/lib/owner-pin-store";
import { requestIsPublicMode } from "@/lib/public-mode-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function locked(lockedUntil: number | null, now: number) {
  return json(423, {
    ok: false,
    error: "Locked.",
    lockedUntil: lockedUntil === null ? null : new Date(lockedUntil).toISOString(),
    retryInSec: Math.ceil(lockoutRemainingMs(lockedUntil, now) / 1000),
  });
}

/**
 * Sets or changes the owner PIN.
 * First PIN: the signed-in session plus a fresh authenticator code.
 * A later change: the current PIN. Public mode cannot call this.
 * The PIN is not logged and is not returned.
 */
export async function POST(request: Request) {
  const gate = await requireRole("owner", request);
  if (gate instanceof NextResponse) return gate;
  if (!isSameOriginRequest(request)) return json(403, { ok: false, error: "Forbidden." });
  if (await requestIsPublicMode(request)) return json(404, { ok: false, error: "Private." });

  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return json(415, { ok: false, error: "Use the PIN form." });
  const body = (await request.json().catch(() => null)) as {
    pin?: unknown;
    confirm?: unknown;
    current?: unknown;
    totp?: unknown;
  } | null;
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const confirm = typeof body?.confirm === "string" ? body.confirm : "";
  const now = authNow();
  const existing = await readOwnerPinHash();
  const lock = await readLockout(now);
  if (lock.lockedUntil !== null) return locked(lock.lockedUntil, now);
  if (!isPinShape(pin) || pin !== confirm) {
    return json(422, { ok: false, error: "Enter the same 4 to 6 digit PIN twice." });
  }

  if (existing) {
    const current = typeof body?.current === "string" ? body.current : "";
    const attempt = await checkOwnerPin(current, now);
    if (!attempt.ok) {
      if (attempt.reason === "locked" || attempt.lock.lockedUntil !== null) {
        return locked(attempt.lock.lockedUntil, now);
      }
      if (attempt.reason === "invalid") {
        return json(422, { ok: false, error: "Enter the current PIN." });
      }
      return json(403, { ok: false, error: "Wrong PIN." });
    }
  } else {
    const secret = process.env.AUTH_TOTP_SECRET?.trim() ?? "";
    const totp = typeof body?.totp === "string" ? body.totp : "";
    if (!secret || !totpMatches(secret, totp, now)) {
      return json(403, { ok: false, error: "Wrong code." });
    }
  }

  await saveNewOwnerPin(pin, now);
  return json(200, { ok: true, pinSet: true });
}
