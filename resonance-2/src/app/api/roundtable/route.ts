import { NextResponse } from "next/server";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { parseAgentPost, toMessageJson, toThreadJson, toThreadSummaryJson } from "@/lib/roundtable";
import { postAgentMessage, readFounderThreads } from "@/lib/roundtable-store";
import { privateModeResponse, requestIsPublicMode } from "@/lib/public-mode-server";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

function storedError(error: unknown) {
  if (isStorageUnavailable(error)) {
    return NextResponse.json(storageErrorJson(error), {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  console.error("roundtable failed", error instanceof Error ? error.message : "unknown");
  return json(500, { ok: false, error: "Roundtable is unavailable." });
}

/**
 * Founder threads. Owner session or hub Bearer.
 * Public mode returns Private and does not send titles or bodies.
 * Youtube threads stay out of this list.
 */
export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  if (await requestIsPublicMode(request)) return privateModeResponse();
  try {
    const threads = (await readFounderThreads()).map((thread) => toThreadSummaryJson(thread));
    return finishAuthorizedRead(
      json(200, { ok: true, count: threads.length, threads }),
      access,
    );
  } catch (error) {
    return storedError(error);
  }
}

/** Open a thread or add a message. Sync Bearer only. A session cookie cannot write. */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  const parsed = parseAgentPost(body);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
  try {
    const written = await postAgentMessage(parsed.post);
    if (!written.ok) return json(written.status, { ok: false, error: written.error });
    return json(written.created ? 201 : 200, {
      ok: true,
      thread: toThreadJson(written.thread),
      message: toMessageJson(written.message),
    });
  } catch (error) {
    return storedError(error);
  }
}
