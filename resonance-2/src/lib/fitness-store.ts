import "server-only";

import { chicagoToday } from "@/lib/calendar-time";
import {
  EMPTY_FITNESS_WEEK,
  fitnessCards,
  fitnessHomeLine,
  fitnessNode,
  fitnessWeekFacts,
  fitnessWeekStepDays,
  metricSamples,
  workoutSamples,
  type FitnessCard,
  type FitnessHomeLine,
  type FitnessNodeDetail,
  type FitnessStepDay,
  type FitnessWeekFacts,
} from "@/lib/fitness-board";
import { fitnessLocalFile, readLocalFitness, upsertLocalFitness } from "@/lib/fitness-local";
import { MANUAL_RUN_IDS, MANUAL_STEP_ID, manualFitnessSeed } from "@/lib/fitness-seed";
import type { FitnessMetricWrite, FitnessOrigin, FitnessWorkoutWrite, FitnessWrites } from "@/lib/fitness-types";
import { FITNESS_SCHEMA_SQL, FITNESS_WORKOUTS_SQL } from "@/lib/pg/embedded-migrations";
import {
  shortcutWorkoutsAsWrites,
  type ShortcutWorkoutWrite,
} from "@/lib/fitness-workouts";
import { postgresFailureReason, sqlQuery } from "@/lib/pg/client";
import { splitSqlStatements } from "@/lib/pg/migrate";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export type FitnessAvailability = "live" | "seed-only" | "unavailable";

export type FitnessRead = {
  availability: FitnessAvailability;
  metrics: FitnessMetricWrite[];
  workouts: FitnessWorkoutWrite[];
  shortcutWorkouts: ShortcutWorkoutWrite[];
  today: string;
};

let ready: Promise<void> | null = null;

export function resetFitnessStoreForTests(): void {
  ready = null;
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const rendered = value instanceof Date ? value.toISOString() : String(value);
  return rendered.length ? rendered : null;
}

function dayText(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? "").slice(0, 10);
}

function originOf(value: unknown): FitnessOrigin {
  if (value === "manual") return "manual";
  if (value === "shortcuts") return "shortcuts";
  return "health-auto-export";
}

function payloadOf(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
  return value ?? {};
}

function missingFitnessTable(error: unknown): boolean {
  const reason = isStorageUnavailable(error)
    ? error.reason
    : error instanceof Error
      ? error.message
      : "";
  return (
    /fitness_metrics|fitness_workouts|fitness_shortcut_workouts/i.test(reason) &&
    /does not exist|no such/i.test(reason)
  );
}

async function tablesPresent(): Promise<boolean> {
  try {
    await sqlQuery(`SELECT 1 AS ok FROM fitness_metrics LIMIT 1`);
    return true;
  } catch (error) {
    if (missingFitnessTable(error)) return false;
    throw error;
  }
}

async function manualSeedPresent(): Promise<boolean> {
  const metrics = await sqlQuery<{ external_id: string }>(
    `SELECT external_id FROM fitness_metrics WHERE source = 'manual' AND external_id = $1`,
    [MANUAL_STEP_ID],
  );
  const workouts = await sqlQuery<{ external_id: string }>(
    `SELECT external_id FROM fitness_workouts WHERE source = 'manual' AND external_id IN ($1, $2)`,
    [MANUAL_RUN_IDS[0], MANUAL_RUN_IDS[1]],
  );
  return metrics.length === 1 && workouts.length === 2;
}

async function ensureFitnessTables(): Promise<void> {
  for (const statement of splitSqlStatements(`${FITNESS_SCHEMA_SQL}\n${FITNESS_WORKOUTS_SQL}`)) {
    await sqlQuery(statement);
  }
}

async function shortcutTablePresent(): Promise<boolean> {
  try {
    await sqlQuery(`SELECT 1 AS ok FROM fitness_shortcut_workouts LIMIT 1`);
    return true;
  } catch (error) {
    if (missingFitnessTable(error)) return false;
    throw error;
  }
}

async function ensureFitnessStoreOnce(): Promise<void> {
  if (!(await tablesPresent()) || !(await shortcutTablePresent())) await ensureFitnessTables();
  if (!(await manualSeedPresent())) await upsertFitnessRows(manualFitnessSeed());
}

/** Create the fitness tables when they are missing, then upsert the manual day once. */
export async function ensureFitnessStore(): Promise<void> {
  if (fitnessLocalFile()) {
    readLocalFitness();
    return;
  }
  if (!ready) {
    ready = ensureFitnessStoreOnce().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  await ready;
}

export async function upsertFitnessRows(
  rows: FitnessWrites,
): Promise<{ metrics: number; workouts: number; runs: number }> {
  if (fitnessLocalFile()) return upsertLocalFitness(rows);
  for (const metric of rows.metrics) {
    await sqlQuery(
      `INSERT INTO fitness_metrics (
         source, external_id, metric, day, recorded_at, qty, units, qty_min, qty_max, origin, payload
       ) VALUES (
         $1, $2, $3, $4::date, $5::timestamptz, $6, $7, $8, $9, $10, $11::jsonb
       )
       ON CONFLICT (source, external_id) DO UPDATE SET
         metric = EXCLUDED.metric,
         day = EXCLUDED.day,
         recorded_at = EXCLUDED.recorded_at,
         -- Shortcuts keeps the larger quantity, the same rule as GREATEST(existing, new).
         qty = CASE
           WHEN EXCLUDED.source = 'shortcuts' AND fitness_metrics.qty > EXCLUDED.qty THEN fitness_metrics.qty
           ELSE EXCLUDED.qty
         END,
         units = EXCLUDED.units,
         qty_min = EXCLUDED.qty_min,
         qty_max = EXCLUDED.qty_max,
         origin = EXCLUDED.origin,
         payload = EXCLUDED.payload,
         updated_at = now()`,
      [
        metric.source,
        metric.externalId,
        metric.metric,
        metric.day,
        metric.recordedAt,
        metric.qty,
        metric.units,
        metric.qtyMin,
        metric.qtyMax,
        metric.origin,
        JSON.stringify(metric.payload),
      ],
    );
  }
  for (const workout of rows.workouts) {
    await sqlQuery(
      `INSERT INTO fitness_workouts (
         source, external_id, name, started_at, ended_at, duration_sec, distance_qty,
         distance_units, energy_kcal, heart_rate_avg, heart_rate_min, heart_rate_max, origin, payload
       ) VALUES (
         $1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
       )
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
      [
        workout.source,
        workout.externalId,
        workout.name,
        workout.startedAt,
        workout.endedAt,
        workout.durationSec,
        workout.distanceQty,
        workout.distanceUnits,
        workout.energyKcal,
        workout.heartRateAvg,
        workout.heartRateMin,
        workout.heartRateMax,
        workout.origin,
        JSON.stringify(workout.payload),
      ],
    );
  }
  for (const run of rows.shortcutWorkouts ?? []) {
    await sqlQuery(
      `INSERT INTO fitness_shortcut_workouts (
         start_time, type, source_name, duration_sec, distance_m, energy_kcal,
         pace_sec_per_km, pace_sec_per_mi
       ) VALUES (
         $1::timestamptz, $2, $3, $4, $5, $6, $7, $8
       )
       ON CONFLICT (start_time, type) DO UPDATE SET
         source_name = COALESCE(EXCLUDED.source_name, fitness_shortcut_workouts.source_name),
         duration_sec = EXCLUDED.duration_sec,
         distance_m = COALESCE(EXCLUDED.distance_m, fitness_shortcut_workouts.distance_m),
         energy_kcal = COALESCE(EXCLUDED.energy_kcal, fitness_shortcut_workouts.energy_kcal),
         pace_sec_per_km = CASE
           WHEN COALESCE(EXCLUDED.distance_m, fitness_shortcut_workouts.distance_m) > 0
             AND EXCLUDED.duration_sec > 0
           THEN EXCLUDED.duration_sec / (COALESCE(EXCLUDED.distance_m, fitness_shortcut_workouts.distance_m) / 1000.0)
           ELSE NULL
         END,
         pace_sec_per_mi = CASE
           WHEN COALESCE(EXCLUDED.distance_m, fitness_shortcut_workouts.distance_m) > 0
             AND EXCLUDED.duration_sec > 0
           THEN EXCLUDED.duration_sec / (COALESCE(EXCLUDED.distance_m, fitness_shortcut_workouts.distance_m) / 1609.344)
           ELSE NULL
         END,
         updated_at = now()`,
      [
        run.startTime,
        run.type,
        run.sourceName,
        run.durationSec,
        run.distanceM,
        run.energyKcal,
        run.paceSecPerKm,
        run.paceSecPerMi,
      ],
    );
  }
  return {
    metrics: rows.metrics.length,
    workouts: rows.workouts.length,
    runs: rows.shortcutWorkouts?.length ?? 0,
  };
}

async function readMetrics(): Promise<FitnessMetricWrite[]> {
  const rows = await sqlQuery<{
    source: string;
    external_id: string;
    metric: string;
    day: unknown;
    recorded_at: unknown;
    qty: unknown;
    units: string;
    qty_min: unknown;
    qty_max: unknown;
    origin: string;
    payload: unknown;
  }>(
    `SELECT source, external_id, metric, day, recorded_at, qty, units, qty_min, qty_max, origin, payload
     FROM fitness_metrics`,
  );
  return rows.map((row) => ({
    source: row.source,
    externalId: row.external_id,
    metric: row.metric,
    day: dayText(row.day),
    recordedAt: text(row.recorded_at),
    qty: text(row.qty) ?? "0",
    units: row.units,
    qtyMin: text(row.qty_min),
    qtyMax: text(row.qty_max),
    origin: originOf(row.origin),
    payload: payloadOf(row.payload),
  }));
}

async function readWorkouts(): Promise<FitnessWorkoutWrite[]> {
  const rows = await sqlQuery<{
    source: string;
    external_id: string;
    name: string;
    started_at: unknown;
    ended_at: unknown;
    duration_sec: unknown;
    distance_qty: unknown;
    distance_units: string | null;
    energy_kcal: unknown;
    heart_rate_avg: unknown;
    heart_rate_min: unknown;
    heart_rate_max: unknown;
    origin: string;
    payload: unknown;
  }>(
    `SELECT source, external_id, name, started_at, ended_at, duration_sec, distance_qty,
            distance_units, energy_kcal, heart_rate_avg, heart_rate_min, heart_rate_max, origin, payload
     FROM fitness_workouts`,
  );
  return rows.flatMap((row) => {
    const startedAt = text(row.started_at);
    if (!startedAt) return [];
    return [
      {
        source: row.source,
        externalId: row.external_id,
        name: row.name,
        startedAt,
        endedAt: text(row.ended_at),
        durationSec: text(row.duration_sec),
        distanceQty: text(row.distance_qty),
        distanceUnits: row.distance_units,
        energyKcal: text(row.energy_kcal),
        heartRateAvg: text(row.heart_rate_avg),
        heartRateMin: text(row.heart_rate_min),
        heartRateMax: text(row.heart_rate_max),
        origin: originOf(row.origin),
        payload: payloadOf(row.payload),
      },
    ];
  });
}

async function readShortcutWorkouts(): Promise<ShortcutWorkoutWrite[]> {
  const rows = await sqlQuery<{
    start_time: unknown;
    type: string;
    source_name: string | null;
    duration_sec: unknown;
    distance_m: unknown;
    energy_kcal: unknown;
    pace_sec_per_km: unknown;
    pace_sec_per_mi: unknown;
  }>(
    `SELECT start_time, type, source_name, duration_sec, distance_m, energy_kcal,
            pace_sec_per_km, pace_sec_per_mi
     FROM fitness_shortcut_workouts`,
  );
  return rows.flatMap((row) => {
    const startTime = text(row.start_time);
    if (!startTime) return [];
    if (row.type !== "Running" && row.type !== "Walking") return [];
    const durationSec = text(row.duration_sec);
    if (!durationSec) return [];
    return [
      {
        startTime,
        type: row.type === "Running" ? "Running" : "Walking",
        sourceName: row.source_name?.trim() || null,
        durationSec,
        distanceM: text(row.distance_m),
        energyKcal: text(row.energy_kcal),
        paceSecPerKm: text(row.pace_sec_per_km),
        paceSecPerMi: text(row.pace_sec_per_mi),
      },
    ];
  });
}

export async function readFitness(today = chicagoToday()): Promise<FitnessRead> {
  if (fitnessLocalFile()) {
    const rows = readLocalFitness();
    return {
      availability: "live",
      metrics: rows.metrics,
      workouts: rows.workouts,
      shortcutWorkouts: rows.shortcutWorkouts ?? [],
      today,
    };
  }
  if (!process.env.DATABASE_URL?.trim()) {
    const seed = manualFitnessSeed();
    return {
      availability: "seed-only",
      metrics: seed.metrics,
      workouts: seed.workouts,
      shortcutWorkouts: [],
      today,
    };
  }
  try {
    await ensureFitnessStore();
    const [metrics, workouts, shortcutWorkouts] = await Promise.all([
      readMetrics(),
      readWorkouts(),
      readShortcutWorkouts(),
    ]);
    return { availability: "live", metrics, workouts, shortcutWorkouts, today };
  } catch (error) {
    console.error("fitness read failed", fitnessFailureText(error));
    const seed = manualFitnessSeed();
    return {
      availability: "unavailable",
      metrics: seed.metrics,
      workouts: seed.workouts,
      shortcutWorkouts: [],
      today,
    };
  }
}

function present(read: FitnessRead) {
  return {
    availability: read.availability,
    metrics: metricSamples(read.metrics),
    workouts: workoutSamples([
      ...read.workouts,
      ...shortcutWorkoutsAsWrites(read.shortcutWorkouts),
    ]),
    today: read.today,
  };
}

function fitnessFailureText(error: unknown): string {
  if (isStorageUnavailable(error)) return error.reason;
  return postgresFailureReason(error);
}

function unavailableFitness(today: string): {
  line: null;
  cards: FitnessCard[];
  detail: null;
  availability: FitnessAvailability;
} {
  return {
    line: null,
    cards: fitnessCards([], [], today),
    detail: null,
    availability: "unavailable",
  };
}

export async function loadFitnessHome(today = chicagoToday()): Promise<{
  line: FitnessHomeLine | null;
  week: FitnessWeekFacts;
  stepDays: FitnessStepDay[];
  availability: FitnessAvailability;
}> {
  try {
    const read = present(await readFitness(today));
    return {
      line: fitnessHomeLine(read.metrics, read.workouts, read.today),
      week: fitnessWeekFacts(read.metrics, read.workouts, read.today),
      stepDays: fitnessWeekStepDays(read.metrics, read.today),
      availability: read.availability,
    };
  } catch (error) {
    console.error("fitness read failed", fitnessFailureText(error));
    const empty = unavailableFitness(today);
    return {
      line: empty.line,
      week: EMPTY_FITNESS_WEEK,
      stepDays: [],
      availability: empty.availability,
    };
  }
}

export async function loadFitnessCards(today = chicagoToday()): Promise<{
  cards: FitnessCard[];
  availability: FitnessAvailability;
}> {
  try {
    const read = present(await readFitness(today));
    return {
      cards: fitnessCards(read.metrics, read.workouts, read.today),
      availability: read.availability,
    };
  } catch (error) {
    console.error("fitness read failed", fitnessFailureText(error));
    const empty = unavailableFitness(today);
    return { cards: empty.cards, availability: empty.availability };
  }
}

export async function loadFitnessNode(
  id: string,
  today = chicagoToday(),
): Promise<{ detail: FitnessNodeDetail | null; availability: FitnessAvailability }> {
  try {
    const read = present(await readFitness(today));
    return {
      detail: fitnessNode(id, read.metrics, read.workouts, read.today),
      availability: read.availability,
    };
  } catch (error) {
    console.error("fitness read failed", fitnessFailureText(error));
    return { detail: fitnessNode(id, [], [], today), availability: "unavailable" };
  }
}
