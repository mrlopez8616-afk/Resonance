import { NextResponse } from "next/server";
import { attachSessionCookie, clearPasskeyCookie } from "@/lib/auth-cookie";
import { authenticatePassword, loginInputFromRequest } from "@/lib/auth-login";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const record =
    body && typeof body === "object"
      ? (body as { password?: unknown; code?: unknown; username?: unknown })
      : {};
  const result = await authenticatePassword(loginInputFromRequest(request, record));
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: { "cache-control": "no-store" } },
    );
  }
  const response = NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
  attachSessionCookie(response, result.token);
  clearPasskeyCookie(response);
  return response;
}
