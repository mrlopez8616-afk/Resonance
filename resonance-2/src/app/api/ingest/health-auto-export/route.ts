import { NextResponse } from "next/server";
import { writeHealthAutoExport, readHealthAutoExportTokenHash } from "@/lib/health-auto-export-store";
import {
  HEALTH_AUTO_EXPORT_BODY_LIMIT,
  HEALTH_AUTO_EXPORT_HEADER,
  healthAutoExportTokenMatches,
  parseHealthAutoExport,
} from "@/lib/health-auto-export";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Health Auto Export REST API automation, JSON export version 2.
 * Header: `X-Resonance-Token`. The value is compared with the sha256 digest
 * stored for the owner. The sync secret and the Shortcuts token are not accepted.
 * An unset digest fails closed.
 *
 * Vercel drops a request body over about 4.5 MB. This route rejects anything
 * over {@link HEALTH_AUTO_EXPORT_BODY_LIMIT} before it parses. Turn on Batch
 * Requests in the app. A full Apple Health history should be exported as daily
 * step totals, and as workout summaries without routes. If one range is still
 * too large, export a shorter range that starts and ends on a calendar day.
 * Posting September and then October leaves September in place. A Chicago day
 * or a workout id that appears again replaces that row.
 */

function json(status: number, body: { ok: boolean; error?: string; steps?: number; workouts?: number }) {
  return NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > HEALTH_AUTO_EXPORT_BODY_LIMIT) {
    return json(413, {
      ok: false,
      error: "Body is too large. Turn on Batch Requests, or export a shorter date range. The limit is 4.5 MB.",
    });
  }

  let stored: string | null;
  try {
    stored = await readHealthAutoExportTokenHash();
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "token lookup failed";
    console.error("health auto export auth failed", reason);
    return json(503, { ok: false, error: "Health Auto Export is not configured." });
  }
  if (!stored) return json(503, { ok: false, error: "Health Auto Export is not configured." });

  const presented = request.headers.get(HEALTH_AUTO_EXPORT_HEADER)?.trim() ?? "";
  if (!presented || !healthAutoExportTokenMatches(presented, stored)) {
    return json(401, { ok: false, error: "Unauthorized." });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  if (raw.length > HEALTH_AUTO_EXPORT_BODY_LIMIT) {
    return json(413, {
      ok: false,
      error: "Body is too large. Turn on Batch Requests, or export a shorter date range. The limit is 4.5 MB.",
    });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }

  const parsed = parseHealthAutoExport(body);
  if (parsed.metrics.length === 0 && parsed.workouts.length === 0) {
    return json(400, { ok: false, error: "No steps or workouts in the body." });
  }

  try {
    const written = await writeHealthAutoExport(parsed);
    return json(200, { ok: true, steps: written.steps, workouts: written.workouts });
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "Health Auto Export ingest failed.";
    console.error("health auto export ingest failed", reason);
    return NextResponse.json(
      storageErrorJson({
        message: isStorageUnavailable(error) ? error.message : "Health Auto Export ingest failed.",
        reason,
      }),
      { status: isStorageUnavailable(error) ? 503 : 500, headers: { "cache-control": "no-store" } },
    );
  }
}
