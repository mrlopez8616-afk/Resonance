import { NextResponse } from "next/server";
import { parseHealthExport, sanitizeFitnessSource } from "@/lib/fitness-parse";
import { ensureFitnessStore, upsertFitnessRows } from "@/lib/fitness-store";
import { authorizeFitnessRequest } from "@/lib/sync-auth";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

/**
 * Health Auto Export REST API target.
 * Header: `Authorization: Bearer <FITNESS_INGEST_TOKEN>`
 * or `X-Fitness-Token: <FITNESS_INGEST_TOKEN>`.
 * Unset token fails closed. The hub sync secret is not accepted.
 */
export async function POST(request: Request) {
  const auth = authorizeFitnessRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!process.env.DATABASE_URL?.trim()) {
    return NextResponse.json(
      { ok: false, error: "Postgres is not configured." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }

  const parsed = parseHealthExport(body, {
    source: sanitizeFitnessSource(request.headers.get("automation-name")),
  });
  if (parsed.metrics.length === 0 && parsed.workouts.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No metrics or workouts in the body." },
      { status: 400 },
    );
  }

  try {
    await ensureFitnessStore();
    const written = await upsertFitnessRows(parsed);
    return NextResponse.json({ ok: true, ...written });
  } catch (error) {
    const reason = isStorageUnavailable(error) ? error.reason : "Fitness ingest failed.";
    console.error("fitness ingest failed", reason);
    return NextResponse.json(
      storageErrorJson({
        message: isStorageUnavailable(error) ? error.message : "Fitness ingest failed.",
        reason,
      }),
      { status: isStorageUnavailable(error) ? 503 : 500 },
    );
  }
}
