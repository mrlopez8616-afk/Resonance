import { headlineIsEmpty, type NodePart } from "@/lib/node-layout";
import type { FitnessMetricWrite, FitnessWorkoutWrite, NrcRunWrite, ShortcutWorkoutWrite } from "@/lib/fitness-types";

/**
 * Latest real workout or sample time.
 * A manual noon placeholder, and any clock marked unknown, is not a timestamp.
 * No real stamp: null, so the header can omit Updated.
 */
export function latestFitnessUpdatedAt(input: {
  metrics?: readonly Pick<FitnessMetricWrite, "recordedAt" | "origin" | "payload">[];
  workouts?: readonly Pick<FitnessWorkoutWrite, "startedAt" | "endedAt" | "origin" | "payload">[];
  shortcutWorkouts?: readonly Pick<ShortcutWorkoutWrite, "startTime">[];
  nrcRuns?: readonly Pick<NrcRunWrite, "startTime">[];
}): string | null {
  let best = Number.NEGATIVE_INFINITY;
  let iso: string | null = null;
  const consider = (value: string | null | undefined, real: boolean) => {
    if (!real) return;
    if (value == null) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const time = Date.parse(trimmed);
    if (Number.isNaN(time) || time <= best) return;
    best = time;
    iso = new Date(time).toISOString();
  };
  for (const metric of input.metrics ?? []) {
    consider(metric.recordedAt, clockIsReal(metric.origin, metric.payload));
  }
  for (const workout of input.workouts ?? []) {
    const real = clockIsReal(workout.origin, workout.payload);
    consider(workout.startedAt, real);
    consider(workout.endedAt, real);
  }
  for (const row of input.shortcutWorkouts ?? []) consider(row.startTime, true);
  for (const row of input.nrcRuns ?? []) consider(row.startTime, Boolean(row.startTime));
  return iso;
}

export function workoutUpdatedAt(
  workout: Pick<FitnessWorkoutWrite, "startedAt" | "endedAt" | "origin" | "payload"> | null | undefined,
): string | null {
  if (!workout) return null;
  return latestFitnessUpdatedAt({ workouts: [workout] });
}

/** True when a headline is a placeholder, including "distance not recorded". */
export function fitnessMetricEmpty(value: string | null | undefined): boolean {
  if (headlineIsEmpty(value)) return true;
  const text = value?.trim() ?? "";
  if (!text) return true;
  return /not recorded|not connected/i.test(text);
}

export function fitnessPart(value: string | null | undefined): NodePart {
  return fitnessMetricEmpty(value) ? "missing" : "live";
}

function clockIsReal(origin: string, payload: unknown): boolean {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  if (record?.clockKnown === false) return false;
  if (record?.clockKnown === true) return true;
  return origin !== "manual";
}
