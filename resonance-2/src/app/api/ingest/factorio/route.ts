import { NextResponse } from "next/server";
import {
  FACTORIO_BODY_LIMIT,
  FACTORIO_HEADER,
  factorioTokenMatches,
  parseFactorioSnapshot,
} from "@/lib/factorio";
import { readFactorioTokenHash, writeFactorioSnapshot } from "@/lib/factorio-store";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * resonance-bridge posts one JSON snapshot about every five minutes.
 * Header: `X-Factorio-Token`. The value is compared with the sha256 digest
 * stored for the owner. The sync secret and the Health Auto Export token
 * are not accepted. A missing or wrong token is 401. An unreadable store is 503.
 * The same tick replaces that snapshot. A new tick is kept.
 */

function json(status: number, body: { ok: boolean; error?: string; tick?: number }) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > FACTORIO_BODY_LIMIT) {
    return json(413, { ok: false, error: "Body is too large." });
  }

  let stored: string | null;
  try {
    stored = await readFactorioTokenHash();
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "token lookup failed";
    console.error("factorio auth failed", reason);
    return json(503, { ok: false, error: "Factorio ingest is not available." });
  }

  const presented = request.headers.get(FACTORIO_HEADER)?.trim() ?? "";
  if (!presented || !stored || !factorioTokenMatches(presented, stored)) {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  if (raw.length > FACTORIO_BODY_LIMIT) {
    return json(413, { ok: false, error: "Body is too large." });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }

  const snapshot = parseFactorioSnapshot(body);
  if (!snapshot) {
    return json(400, { ok: false, error: "A Factorio snapshot with a tick is required." });
  }

  try {
    await writeFactorioSnapshot(snapshot, body);
    return json(200, { ok: true, tick: snapshot.tick });
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "Factorio ingest failed.";
    console.error("factorio ingest failed", reason);
    return NextResponse.json(
      storageErrorJson({
        message: isStorageUnavailable(error) ? error.message : "Factorio ingest failed.",
        reason,
      }),
      { status: isStorageUnavailable(error) ? 503 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
