import { NextResponse } from "next/server";
import { browserSession, isSessionResponse } from "@/lib/auth-browser";
import { removePasskey } from "@/lib/auth-passkey";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await browserSession(request);
  if (isSessionResponse(session)) return session;
  let body: { id?: unknown } = {};
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const removed = await removePasskey(id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Passkey was not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
