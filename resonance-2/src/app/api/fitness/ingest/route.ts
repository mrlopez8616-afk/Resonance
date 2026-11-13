import { NextResponse } from "next/server";
import { fitnessLocalFile } from "@/lib/fitness-local";
import { sanitizeFitnessSource } from "@/lib/fitness-parse";
import { readNightlyFitness } from "@/lib/fitness-nrc";
import { acceptsShortcutWorkouts, parseFitnessIngest } from "@/lib/fitness-shortcuts";
import { readShortcutWorkouts } from "@/lib/fitness-workouts";
import { ensureFitnessStore, upsertFitnessRows } from "@/lib/fitness-store";
import {
  beginIngestAttempt,
  FITNESS_INGEST_ROUTE,
  markIngestAttempt,
  noteIngestBodyLength,
  recordIngestAttempt,
  type IngestAttemptReason,
} from "@/lib/ingest-attempts";
import { authorizeFitnessRequest, FITNESS_TOKEN_HEADER, readBearerToken } from "@/lib/sync-auth";
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
 * Optional `runs`, `resting` or `restingHr`, and `heart` or `avgHr` ride in the same body.
 * `steps` plus `stepStarts` is the Find Health Samples list. `metric` plus `values` and `starts` still works.
 * `{"source":"shortcuts","date":"yyyy-MM-dd","steps":12345}` is one Chicago day's total and replaces that day.
 * Optional `restingHr` and `avgHr` on that body are plain numbers for the same date.
 * A steps-only post stays valid. Heart rate for a day is replaced, not kept as the larger number.
 * A run posted again with the same day and start, or the same day, distance, and duration, updates that run.
 * Each request writes one attempt row: status, a short reason, and counts.
 * That row does not include the token, the header value, or the body.
 */

function fitnessAuthReason(request: Request, status: number): IngestAttemptReason {
  if (status === 503) return "no token configured";
  const bearer = readBearerToken(request.headers.get("authorization"));
  const header = request.headers.get(FITNESS_TOKEN_HEADER)?.trim() ?? "";
  return bearer || header ? "bad token" : "missing header";
}

async function handleFitnessIngest(request: Request, draft: ReturnType<typeof beginIngestAttempt>) {
  const auth = authorizeFitnessRequest(request);
  if (!auth.ok) {
    markIngestAttempt(draft, auth.status, false, fitnessAuthReason(request, auth.status));
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  draft.authOk = true;
  if (!process.env.DATABASE_URL?.trim() && !fitnessLocalFile()) {
    markIngestAttempt(draft, 503, true, "storage unavailable");
    return NextResponse.json(
      { ok: false, error: "Postgres is not configured." },
      { status: 503 },
    );
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    markIngestAttempt(draft, 400, true, "bad body");
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }
  noteIngestBodyLength(draft, raw);
  if (raw.length > FITNESS_INGEST_BODY_LIMIT) {
    markIngestAttempt(draft, 413, true, "body too large");
    return NextResponse.json(
      { ok: false, error: "Body is too large. Post a shorter date range." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    markIngestAttempt(draft, 400, true, "bad body");
    return NextResponse.json({ ok: false, error: "JSON body is required." }, { status: 400 });
  }

  const parsed = parseFitnessIngest(body, {
    source: sanitizeFitnessSource(request.headers.get("automation-name")),
  });
  const nightly = readNightlyFitness(body);
  const metrics = [...parsed.metrics, ...nightly.heart];
  const runs = readShortcutWorkouts(body, acceptsShortcutWorkouts(body));
  if (!runs.ok) {
    markIngestAttempt(draft, 400, true, "bad body");
    return NextResponse.json({ ok: false, error: runs.error }, { status: 400 });
  }
  if (metrics.length === 0 && parsed.workouts.length === 0 && runs.workouts.length === 0 && nightly.runs.length === 0) {
    markIngestAttempt(draft, 400, true, "bad body");
    return NextResponse.json(
      { ok: false, error: "No metrics or workouts in the body." },
      { status: 400 },
    );
  }

  try {
    await ensureFitnessStore();
    const written = await upsertFitnessRows({
      ...parsed,
      metrics,
      shortcutWorkouts: runs.workouts,
      nrcRuns: nightly.runs,
    });
    markIngestAttempt(draft, 200, true, "ok", written.metrics + written.workouts + written.runs);
    return NextResponse.json({
      ok: true,
      metrics: written.metrics,
      workouts: written.workouts,
      runs: written.runs,
      heart: nightly.heart.length,
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
    const status = isStorageUnavailable(error) ? 503 : 500;
    markIngestAttempt(draft, status, true, status === 503 ? "storage unavailable" : "write failed");
    return NextResponse.json(
      storageErrorJson({
        message: isStorageUnavailable(error) ? error.message : "Fitness ingest failed.",
        reason,
      }),
      { status },
    );
  }
}

export async function POST(request: Request) {
  const draft = beginIngestAttempt(FITNESS_INGEST_ROUTE, request);
  try {
    return await handleFitnessIngest(request, draft);
  } finally {
    await recordIngestAttempt(draft, request);
  }
}
