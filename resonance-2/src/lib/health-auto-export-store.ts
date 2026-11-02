import "server-only";

import { fitnessLocalFile } from "@/lib/fitness-local";
import { HEALTH_AUTO_EXPORT_DB_BATCH } from "@/lib/health-auto-export";
import type { FitnessMetricWrite, FitnessWorkoutWrite, FitnessWrites } from "@/lib/fitness-types";
import { ensureFitnessStore, upsertFitnessRows } from "@/lib/fitness-store";
import { sqlQuery } from "@/lib/pg/client";

function chunks<T>(rows: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    batches.push(rows.slice(index, index + size));
  }
  return batches;
}

function dedupeMetrics(rows: readonly FitnessMetricWrite[]): FitnessMetricWrite[] {
  const map = new Map<string, FitnessMetricWrite>();
  for (const row of rows) map.set(`${row.source}:${row.externalId}`, row);
  return [...map.values()];
}

function dedupeWorkouts(rows: readonly FitnessWorkoutWrite[]): FitnessWorkoutWrite[] {
  const map = new Map<string, FitnessWorkoutWrite>();
  for (const row of rows) map.set(`${row.source}:${row.externalId}`, row);
  return [...map.values()];
}

async function upsertMetricBatch(rows: readonly FitnessMetricWrite[]): Promise<void> {
  if (rows.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [];
  rows.forEach((row, index) => {
    const base = index * 11;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::date, $${base + 5}::timestamptz, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}::jsonb)`,
    );
    params.push(
      row.source,
      row.externalId,
      row.metric,
      row.day,
      row.recordedAt,
      row.qty,
      row.units,
      row.qtyMin,
      row.qtyMax,
      row.origin,
      JSON.stringify(row.payload),
    );
  });
  await sqlQuery(
    `INSERT INTO fitness_metrics (
       source, external_id, metric, day, recorded_at, qty, units, qty_min, qty_max, origin, payload
     ) VALUES ${values.join(", ")}
     ON CONFLICT (source, external_id) DO UPDATE SET
       metric = EXCLUDED.metric,
       day = EXCLUDED.day,
       recorded_at = EXCLUDED.recorded_at,
       qty = EXCLUDED.qty,
       units = EXCLUDED.units,
       qty_min = EXCLUDED.qty_min,
       qty_max = EXCLUDED.qty_max,
       origin = EXCLUDED.origin,
       payload = EXCLUDED.payload,
       updated_at = now()`,
    params,
  );
}

/**
 * Workout jsonb written by the Health Auto Export parser.
 * Elevation, one heart rate per minute, the distance series, the energy series,
 * and any splits live here. Route coordinates are not part of the payload.
 */
function workoutPayloadJson(row: FitnessWorkoutWrite): string {
  return JSON.stringify(row.payload ?? {});
}

async function upsertWorkoutBatch(rows: readonly FitnessWorkoutWrite[]): Promise<void> {
  if (rows.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [];
  rows.forEach((row, index) => {
    const base = index * 14;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::timestamptz, $${base + 5}::timestamptz, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}::jsonb)`,
    );
    params.push(
      row.source,
      row.externalId,
      row.name,
      row.startedAt,
      row.endedAt,
      row.durationSec,
      row.distanceQty,
      row.distanceUnits,
      row.energyKcal,
      row.heartRateAvg,
      row.heartRateMin,
      row.heartRateMax,
      row.origin,
      workoutPayloadJson(row),
    );
  });
  await sqlQuery(
    `INSERT INTO fitness_workouts (
       source, external_id, name, started_at, ended_at, duration_sec, distance_qty,
       distance_units, energy_kcal, heart_rate_avg, heart_rate_min, heart_rate_max, origin, payload
     ) VALUES ${values.join(", ")}
     ON CONFLICT (source, external_id) DO UPDATE SET
       name = EXCLUDED.name,
       started_at = EXCLUDED.started_at,
       ended_at = EXCLUDED.ended_at,
       duration_sec = EXCLUDED.duration_sec,
       distance_qty = EXCLUDED.distance_qty,
       distance_units = EXCLUDED.distance_units,
       energy_kcal = EXCLUDED.energy_kcal,
       heart_rate_avg = EXCLUDED.heart_rate_avg,
       heart_rate_min = EXCLUDED.heart_rate_min,
       heart_rate_max = EXCLUDED.heart_rate_max,
       origin = EXCLUDED.origin,
       payload = EXCLUDED.payload,
       updated_at = now()`,
    params,
  );
}

/** Replace the days and workouts in this export. Other days stay. */
export async function writeHealthAutoExport(
  rows: FitnessWrites,
): Promise<{ steps: number; workouts: number }> {
  const metrics = dedupeMetrics(rows.metrics);
  const workouts = dedupeWorkouts(rows.workouts);
  if (fitnessLocalFile()) {
    for (const slice of chunks(metrics, HEALTH_AUTO_EXPORT_DB_BATCH)) {
      await upsertFitnessRows({ metrics: slice, workouts: [] });
    }
    for (const slice of chunks(workouts, HEALTH_AUTO_EXPORT_DB_BATCH)) {
      await upsertFitnessRows({ metrics: [], workouts: slice });
    }
    return {
    steps: metrics.filter((row) => row.metric === "step_count").length,
    workouts: workouts.length,
  };
  }
  await ensureFitnessStore();
  for (const slice of chunks(metrics, HEALTH_AUTO_EXPORT_DB_BATCH)) {
    await upsertMetricBatch(slice);
  }
  for (const slice of chunks(workouts, HEALTH_AUTO_EXPORT_DB_BATCH)) {
    await upsertWorkoutBatch(slice);
  }
  return {
    steps: metrics.filter((row) => row.metric === "step_count").length,
    workouts: workouts.length,
  };
}

export async function readHealthAutoExportTokenHash(): Promise<string | null> {
  const rows = await sqlQuery<{ token_hash: string }>(
    `SELECT token_hash FROM health_auto_export_tokens WHERE id = 1`,
  );
  const hash = rows[0]?.token_hash?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

export async function healthAutoExportTokenConfigured(): Promise<boolean> {
  return (await readHealthAutoExportTokenHash()) !== null;
}

/** Stores the digest only. The caller shows the plaintext once and does not log it. */
export async function saveHealthAutoExportTokenHash(tokenHash: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error("token hash must be 64 hex characters");
  await sqlQuery(
    `INSERT INTO health_auto_export_tokens (id, token_hash, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET
       token_hash = EXCLUDED.token_hash,
       updated_at = now()`,
    [tokenHash],
  );
}
