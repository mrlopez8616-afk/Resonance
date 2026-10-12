import { NextResponse } from "next/server";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { isRoundtableId, toThreadJson } from "@/lib/roundtable";
import { readFounderThread } from "@/lib/roundtable-store";
import { privateModeResponse, requestIsPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * One founder thread, with messages. Owner session or hub Bearer.
 * Public mode and a youtube thread both answer Not found, with no body text.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  if (await requestIsPublicMode(request)) return privateModeResponse();
  const { id } = await context.params;
  if (!isRoundtableId(id)) return json(404, { ok: false, error: "Not found." });
  try {
    const thread = await readFounderThread(id);
    if (!thread) return json(404, { ok: false, error: "Not found." });
    return finishAuthorizedRead(json(200, { ok: true, thread: toThreadJson(thread) }), access);
  } catch (error) {
    if (isStorageUnavailable(error)) {
      return NextResponse.json(storageErrorJson(error), {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
    }
    console.error("roundtable failed", error instanceof Error ? error.message : "unknown");
    return json(500, { ok: false, error: "Roundtable is unavailable." });
  }
}
