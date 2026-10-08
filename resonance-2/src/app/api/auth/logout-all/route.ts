import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth-cookie";
import { requestOrigin } from "@/lib/auth-core";
import { deleteAllSessions } from "@/lib/auth-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  await deleteAllSessions().catch(() => undefined);
  const response = NextResponse.redirect(new URL("/login", requestOrigin(request)), 303);
  clearSessionCookie(response);
  return response;
}
