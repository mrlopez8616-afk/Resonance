import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth-core";
import { requireRole } from "@/lib/auth-session";
import { parseFounderReply, toMessageJson } from "@/lib/roundtable";
import { postFounderReply } from "@/lib/roundtable-store";
import { privateModeResponse, requestIsPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Founder reply. Owner session, same origin.
 * The sync Bearer cannot reply. Public mode does not write and does not return the thread.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("authorization")) {
    return json(401, { ok: false, error: "Unauthorized." });
  }
  const gate = await requireRole("owner", request);
  if (gate instanceof NextResponse) return gate;
  if (!isSameOriginRequest(request)) return json(403, { ok: false, error: "Forbidden." });
  if (await requestIsPublicMode(request)) return privateModeResponse();

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  const parsed = parseFounderReply(body);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
  try {
    const written = await postFounderReply(id, parsed.reply, gate.username);
    if (!written.ok) return json(written.status, { ok: false, error: written.error });
    return json(written.created ? 201 : 200, {
      ok: true,
      message: toMessageJson(written.message),
    });
  } catch (error) {
    if (isStorageUnavailable(error)) {
      return NextResponse.json(storageErrorJson(error), {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
    }
    console.error("roundtable reply failed", error instanceof Error ? error.message : "unknown");
    return json(500, { ok: false, error: "Roundtable is unavailable." });
  }
}
