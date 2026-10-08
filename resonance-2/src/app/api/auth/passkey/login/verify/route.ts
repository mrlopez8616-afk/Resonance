import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { attachSessionCookie, clearPasskeyCookie } from "@/lib/auth-cookie";
import { finishAuthentication, passkeyCookie, requestIp } from "@/lib/auth-passkey";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: AuthenticationResponseJSON;
  try {
    body = (await request.json()) as AuthenticationResponseJSON;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }
  const result = await finishAuthentication({
    response: body,
    sealed: passkeyCookie(request),
    ip: requestIp(request),
    userAgent: request.headers.get("user-agent"),
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: { "cache-control": "no-store" } },
    );
  }
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  attachSessionCookie(response, result.token);
  clearPasskeyCookie(response);
  return response;
}
