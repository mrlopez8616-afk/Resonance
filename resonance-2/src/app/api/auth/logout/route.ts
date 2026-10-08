import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth-cookie";
import { SESSION_COOKIE, readCookieValue, requestOrigin } from "@/lib/auth-core";
import { deleteSession } from "@/lib/auth-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = readCookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  await deleteSession(token).catch(() => undefined);
  const response = NextResponse.redirect(new URL("/login", requestOrigin(request)), 303);
  clearSessionCookie(response);
  return response;
}
