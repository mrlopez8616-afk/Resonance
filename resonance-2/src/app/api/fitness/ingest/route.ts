import { NextResponse } from "next/server";
import { fitnessLocalFile } from "@/lib/fitness-local";
import { sanitizeFitnessSource } from "@/lib/fitness-parse";
import { acceptsShortcutWorkouts, parseFitnessIngest } from "@/lib/fitness-shortcuts";
import { readShortcutWorkouts } from "@/lib/fitness-workouts";
import { ensureFitnessStore, upsertFitnessRows } from "@/lib/fitness-store";
import { authorizeFitnessRequest } from "@/lib/sync-auth";
import { isStorageUnavailable, storageErrorJson } from "@/lib/storage-unavailable";

export const dynamic = "force-dynamic";

/** Sept 1 backfill of minute-level samples, plus room for a proxy buffer. */
export const FITNESS_INGEST_BODY_LIMIT = 32 * 1024 * 1024;

export const maxDuration = 60;

/**
 * Health Auto Export and Apple Shortcuts target.
 * Header: `Authorization: Bearer <FITNESS_INGEST_TOKEN>`
 * or `X-Fitness-Token: <FITNESS_INGEST_TOKEN>`.
 * Unset token fails closed. The hub sync secret is not accepted.
 * A Shortcuts day keeps the larger total, so a partial nightly window
 * cannot shrink a full day. Post the same window again and the totals stay the same.
 * A later post with a higher total replaces the stored one.
 * Health Auto Export still replaces the day.
 */
export async function POST(request: Request) {
  const auth = authorizeFitnessRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!process.env.DATABASE_URL?.trim() && !fitnessLocalFile()) {
    return NextResponse.json(
      { ok: false, error: "Postgres is not configured." },
      { status: 503 },
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }
  if (raw.length > FITNESS_INGEST_BODY_LIMIT) {
    return NextResponse.json(
      { ok: false, error: "Body is too large. Post a shorter date range." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }

  const parsed = parseFitnessIngest(body, {
    source: sanitizeFitnessSource(request.headers.get("automation-name")),
  });
  const runs = readShortcutWorkouts(body, acceptsShortcutWorkouts(body));
  if (!runs.ok) {
    return NextResponse.json({ ok: false, error: runs.error }, { status: 400 });
  }
  if (parsed.metrics.length === 0 && parsed.workouts.length === 0 && runs.workouts.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No metrics or workouts in the body." },
      { status: 400 },
    );
  }

  try {
    await ensureFitnessStore();
    const written = await upsertFitnessRows({ ...parsed, shortcutWorkouts: runs.workouts });
    return NextResponse.json({
      ok: true,
      metrics: written.metrics,
      workouts: written.workouts,
      runs: written.runs,
      totals: parsed.metrics.map((row) => ({
        metric: row.metric,
        day: row.day,
        qty: row.qty,
        units: row.units,
      })),
    });
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
