import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-session";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { exposureWatches, parseIncidentWrite, toIncidentJson } from "@/lib/chain-security";
import { readIncidents, upsertIncident } from "@/lib/chain-security-store";
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
  console.error("chain security failed", error instanceof Error ? error.message : "unknown");
  return json(500, { ok: false, error: "Chain Security is unavailable." });
}

/**
 * Incident feed. Owner session or hub Bearer.
 * Public mode returns loss as "hidden" and omits the dollar fields.
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
    const incidents = await readIncidents();
    const body = {
      ok: true,
      count: incidents.length,
      exposure: exposureWatches(incidents, publicMode).map((watch) => ({
        id: watch.id,
        label: watch.label,
        incidents: watch.incidents.map((incident) => incident.id),
      })),
      incidents: incidents.map((incident) => toIncidentJson(incident, publicMode)),
    };
    const response = json(200, body);
    return access ? finishAuthorizedRead(response, access) : response;
  } catch (error) {
    return storedError(error);
  }
}

/** Add or replace an incident. Sync Bearer only. The same id updates the row. */
export async function POST(request: Request) {
  const auth = authorizeSyncRequest(request);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  const parsed = parseIncidentWrite(body);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
  try {
    const written = await upsertIncident(parsed.incident);
    return json(written.created ? 201 : 200, {
      ok: true,
      created: written.created,
      incident: toIncidentJson(written.incident, false),
    });
  } catch (error) {
    return storedError(error);
  }
}
