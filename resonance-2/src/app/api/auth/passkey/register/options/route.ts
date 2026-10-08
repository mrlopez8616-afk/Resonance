import { NextResponse } from "next/server";
import { attachPasskeyCookie } from "@/lib/auth-cookie";
import { beginRegistration } from "@/lib/auth-passkey";
import { browserSession, isSessionResponse } from "@/lib/auth-browser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await browserSession(request);
  if (isSessionResponse(session)) return session;
  const begun = await beginRegistration(request.headers.get("user-agent"));
  if (!begun.ok) {
    return NextResponse.json(
      { ok: false, error: begun.error },
      { status: begun.status, headers: { "cache-control": "no-store" } },
    );
  }
  const response = NextResponse.json(begun.options, { headers: { "cache-control": "no-store" } });
  attachPasskeyCookie(response, begun.sealed);
  return response;
}
