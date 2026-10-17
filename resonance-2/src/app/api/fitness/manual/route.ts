import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-session";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { manualEntryJson, parseManualImport } from "@/lib/fitness-manual";
import { loadFitnessManual, upsertManualSummaries } from "@/lib/fitness-manual-store";
import { requestIsPublicMode } from "@/lib/public-mode-server";
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
  console.error("fitness manual failed", error instanceof Error ? error.message : "unknown");
  return json(500, { ok: false, error: "Fitness manual import is unavailable." });
}

/**
 * Manual summaries. Owner session or hub Bearer.
 * Public mode strips dollar text. The rows do not feed daily or run totals.
 */
export async function GET(request: Request) {
  const bearer = authorizeSyncRequest(request);
  let access: Awaited<ReturnType<typeof authorizeReadRequest>> | null = null;
  if (!bearer.ok) {
    const user = await requireRole("owner", request);
    if (user instanceof NextResponse) return user;
    access = await authorizeReadRequest(request);
    if (!access.ok) return access.response;
  }
  const publicMode = bearer.ok ? false : await requestIsPublicMode(request);
  try {
    const loaded = await loadFitnessManual();
    if (loaded.availability === "unconfigured") {
      return json(503, { ok: false, error: "Postgres is not configured." });
    }
    if (loaded.availability !== "live") {
      return json(503, { ok: false, error: "Fitness manual import is unavailable." });
    }
    const body = {
      ok: true,
      count: loaded.entries.length,
      entries: loaded.entries.map((entry) => manualEntryJson(entry, publicMode)),
    };
    const response = json(200, body);
    return access ? finishAuthorizedRead(response, access) : response;
  } catch (error) {
    return storedError(error);
  }
}

/** Add or replace summaries. Sync Bearer only. The same period, app, and metric updates that row. */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });
  if (!process.env.DATABASE_URL?.trim()) {
    return json(503, { ok: false, error: "Postgres is not configured." });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  const parsed = parseManualImport(body);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
  try {
    const written = await upsertManualSummaries(parsed.entries);
    return json(200, {
      ok: true,
      upserted: written.length,
      entries: written.map((entry) => manualEntryJson(entry, false)),
    });
  } catch (error) {
    return storedError(error);
  }
}
