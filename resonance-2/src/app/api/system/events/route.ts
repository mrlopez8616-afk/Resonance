import { NextResponse } from "next/server";
import { loadSystemEvents } from "@/lib/system-events";
import { parseSince, toSystemEventResponse } from "@/lib/system-live";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

/** Test hook. `undefined` reads the session cookie. */
let sessionForTests: { role: string } | null | undefined;

export function setSystemEventsSessionForTests(session: { role: string } | null | undefined) {
  sessionForTests = session;
}

function json(body: { ok: boolean; error?: string; events?: unknown }, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Recent real events for the live map.
 * Owner session only. A bearer token is rejected.
 * The body is type, node ids, edge ids, and a timestamp.
 */
export async function GET(request: Request) {
  if (request.headers.get("authorization")) return json({ ok: false, error: "Unauthorized." }, 401);

  let session: { role: string } | null = null;
  if (sessionForTests !== undefined) {
    session = sessionForTests;
  } else {
    try {
      const { getSession } = await import("@/lib/auth-session");
      session = await getSession();
    } catch {
      session = null;
    }
  }
  if (!session || session.role !== "owner") return json({ ok: false, error: "Unauthorized." }, 401);

  const parsed = parseSince(new URL(request.url).searchParams.get("since"));
  if (!parsed.ok) return json({ ok: false, error: "since must be a timestamp." }, 400);

  try {
    const events = await loadSystemEvents(parsed.since);
    return json(toSystemEventResponse(events), 200);
  } catch (error) {
    if (isStorageUnavailable(error)) {
      return json({ ok: false, error: "Events are unavailable." }, 503);
    }
    console.error("system events failed", error instanceof Error ? error.message : "unknown");
    return json({ ok: false, error: "Events are unavailable." }, 503);
  }
}
