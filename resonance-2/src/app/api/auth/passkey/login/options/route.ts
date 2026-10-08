import { NextResponse } from "next/server";
import { attachPasskeyCookie } from "@/lib/auth-cookie";
import { beginAuthentication } from "@/lib/auth-passkey";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const begun = await beginAuthentication();
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
