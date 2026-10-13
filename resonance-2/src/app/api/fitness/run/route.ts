import { NextResponse } from "next/server";
import { isSameOriginRequest } from "@/lib/auth-core";
import { requireRole } from "@/lib/auth-session";
import { resonanceNrcRun } from "@/lib/fitness-nrc";
import { ensureFitnessStore, upsertFitnessRows } from "@/lib/fitness-store";
import { parseRunSave } from "@/lib/run-track";
import { privateModeResponse, requestIsPublicMode } from "@/lib/public-mode-server";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Save one phone run into fitness_nrc_runs.
 * Owner session, same origin. Public mode is a 404.
 * Source is resonance. Average heart rate is null.
 */
export async function POST(request: Request) {
  if (request.headers.get("authorization")) {
    return json(401, { ok: false, error: "Unauthorized." });
  }
  const gate = await requireRole("owner", request);
  if (gate instanceof NextResponse) return gate;
  if (!isSameOriginRequest(request)) return json(403, { ok: false, error: "Forbidden." });
  if (await requestIsPublicMode(request)) return privateModeResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON body is required." });
  }
  const parsed = parseRunSave(body);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error });
  const built = resonanceNrcRun(parsed);
  if (!built.ok) return json(400, { ok: false, error: built.error });

  try {
    await ensureFitnessStore();
    await upsertFitnessRows({ metrics: [], workouts: [], nrcRuns: [built.run] });
    return json(200, {
      ok: true,
      day: built.run.day,
      distanceMi: built.run.distanceMi,
      durationSec: built.run.durationSec,
      source: built.run.source,
      avgHr: null,
    });
  } catch (error) {
    if (isStorageUnavailable(error)) {
      return NextResponse.json(storageErrorJson(error), {
        status: 503,
        headers: { "cache-control": "no-store" },
      });
    }
    console.error("run save failed", error instanceof Error ? error.message : "unknown");
    return json(500, { ok: false, error: "Save failed." });
  }
}
