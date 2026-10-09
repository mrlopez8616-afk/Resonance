import { NextResponse } from "next/server";
import { parseApprovalBody, parseApprovalFilter, toApprovalJson } from "@/lib/approvals";
import { insertApproval, listApprovals } from "@/lib/approvals-store";
import { authorizeReadRequest, finishAuthorizedRead } from "@/lib/auth-read";
import { privateModeResponse, requestIsPublicMode } from "@/lib/public-mode-server";
import { getSyncSecret, readBearerToken } from "@/lib/sync-auth";
import { authorizeSyncAccess } from "@/lib/sync-auth-core";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function storedError(error: unknown) {
  if (isStorageUnavailable(error)) {
    return NextResponse.json(storageErrorJson(error), {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
  console.error("approvals failed", error instanceof Error ? error.message : "unknown");
  return json(500, { ok: false, error: "Approvals are unavailable." });
}

/** Bearer only. An unset sync secret stays closed. A session cookie cannot submit. */
function authorizeSubmit(request: Request) {
  const syncSecret = getSyncSecret();
  if (!syncSecret) {
    return { ok: false as const, error: "Send Authorization: Bearer <RESONANCE_SYNC_SECRET>." };
  }
  return authorizeSyncAccess({
    syncSecret,
    bearer: readBearerToken(request.headers.get("authorization")),
  });
}

/** Pending and decided requests. Owner session or the sync Bearer. Public mode hides the queue. */
export async function GET(request: Request) {
  const access = await authorizeReadRequest(request);
  if (!access.ok) return access.response;
  if (await requestIsPublicMode(request)) return privateModeResponse();
  const filter = parseApprovalFilter(new URL(request.url).searchParams.get("status"));
  if (!filter) return json(400, { ok: false, error: "status is not a queue filter." });
  try {
    const approvals = await listApprovals(filter);
    return finishAuthorizedRead(
      NextResponse.json(
        { ok: true, approvals: approvals.map(toApprovalJson) },
        { headers: { "cache-control": "no-store" } },
      ),
      access,
    );
  } catch (error) {
    return storedError(error);
  }
}

/** Create one pending request. The same idempotency_key returns the original row. */
export async function POST(request: Request) {
  const auth = authorizeSubmit(request);
  if (!auth.ok) return json(401, { ok: false, error: auth.error });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  const parsed = parseApprovalBody(body);
  if (!parsed.ok) return json(parsed.status, { ok: false, error: parsed.error });
  try {
    const written = await insertApproval(parsed.draft);
    return json(200, {
      ok: true,
      replay: written.replay,
      approval: toApprovalJson(written.approval),
    });
  } catch (error) {
    return storedError(error);
  }
}
