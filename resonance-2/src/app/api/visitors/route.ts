import { NextResponse } from "next/server";
import { clientIp, isLoginLandingPath, isSessionToken, readCookieValue, SESSION_COOKIE } from "@/lib/auth-core";
import { recordVisitorHit } from "@/lib/visitors-store";
import {
  allowVisitorHit,
  isBot,
  safeVisitPath,
  trackingDeclined,
  utcDay,
  visitorHash,
  visitorSecret,
} from "@/lib/visitors";

export const dynamic = "force-dynamic";

function done(status = 204): Response {
  return new NextResponse(null, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Write-only counter. The body is ignored except for a same-site path check.
 * The response is empty. It does not read or change any other table.
 * A crawler, a declined tracking header, a bad path, or a fast repeat is a no-op.
 * Without a session, only the login screen and the landing page are counted.
 * A signed-in visit, including Public view, can count the page it is on.
 */
export async function POST(request: Request) {
  if (trackingDeclined(request.headers) || isBot(request.headers.get("user-agent"))) return done();
  const secret = visitorSecret();
  if (!secret) return done();

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return done();
  }
  const path =
    body && typeof body === "object" && "path" in body
      ? safeVisitPath((body as { path?: unknown }).path)
      : null;
  if (!path) return done();
  const signedIn = isSessionToken(readCookieValue(request.headers.get("cookie"), SESSION_COOKIE));
  if (!signedIn && !isLoginLandingPath(path)) return done();

  const day = utcDay();
  const hash = visitorHash(clientIp(request), request.headers.get("user-agent") ?? "", day, secret);
  if (!allowVisitorHit(hash, Date.now())) return done();
  try {
    await recordVisitorHit(day, hash);
  } catch {
    return done();
  }
  return done();
}
