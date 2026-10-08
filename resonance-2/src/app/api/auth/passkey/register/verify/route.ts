import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { clearPasskeyCookie } from "@/lib/auth-cookie";
import { finishRegistration, passkeyCookie } from "@/lib/auth-passkey";
import { browserSession, isSessionResponse } from "@/lib/auth-browser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await browserSession(request);
  if (isSessionResponse(session)) return session;
  let body: RegistrationResponseJSON;
  try {
    body = (await request.json()) as RegistrationResponseJSON;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }
  const result = await finishRegistration({
    response: body,
    sealed: passkeyCookie(request),
    userAgent: request.headers.get("user-agent"),
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: { "cache-control": "no-store" } },
    );
  }
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  clearPasskeyCookie(response);
  return response;
}
