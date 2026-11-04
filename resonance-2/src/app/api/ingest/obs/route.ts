import { NextResponse } from "next/server";
import { OBS_BODY_LIMIT, OBS_HEADER, obsPayloadForStore, obsTokenMatches, parseObsRecording } from "@/lib/obs";
import { readObsTokenHash, writeObsRecording } from "@/lib/obs-store";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The PC posts one OBS recording when a file is saved.
 * Header: `X-Obs-Token`. The value is compared with the sha256 digest
 * stored for the owner. The sync secret and the other bridge tokens are not
 * accepted. A missing or wrong token is 401. An unreadable store is 503.
 * The same folder, file name, and created time updates that row.
 */

function json(status: number, body: { ok: boolean; error?: string }) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > OBS_BODY_LIMIT) {
    return json(413, { ok: false, error: "Body is too large." });
  }

  let stored: string | null;
  try {
    stored = await readObsTokenHash();
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "token lookup failed";
    console.error("obs auth failed", reason);
    return json(503, { ok: false, error: "OBS ingest is not available." });
  }

  const presented = request.headers.get(OBS_HEADER)?.trim() ?? "";
  if (!presented || !stored || !obsTokenMatches(presented, stored)) {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  if (raw.length > OBS_BODY_LIMIT) {
    return json(413, { ok: false, error: "Body is too large." });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }

  const recording = parseObsRecording(body);
  if (!recording) {
    return json(400, { ok: false, error: "An OBS recording with a file name, size, folder, and time is required." });
  }

  try {
    await writeObsRecording(recording, obsPayloadForStore(body));
    return json(200, { ok: true });
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "OBS ingest failed.";
    console.error("obs ingest failed", reason);
    return NextResponse.json(
      storageErrorJson({
        message: isStorageUnavailable(error) ? error.message : "OBS ingest failed.",
        reason,
      }),
      { status: isStorageUnavailable(error) ? 503 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
