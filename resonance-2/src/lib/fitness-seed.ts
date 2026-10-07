import { chicagoInstant } from "@/lib/calendar-time";
import type { FitnessWrites } from "@/lib/fitness-types";

/**
 * The one known day, 2026-10-05 America/Chicago.
 * 21,608 steps. Two Nike Run Club runs: 1.9 mi in 19 min (304 kcal)
 * and 2.0 mi in 16 min (313 kcal). Workout calories 617.
 * Clock times were not recorded. Noon keeps the Chicago day stable
 * and is not shown.
 */
export const MANUAL_FITNESS_SOURCE = "manual";
export const MANUAL_FITNESS_DAY = "2026-10-05";
export const MANUAL_STEP_ID = "step_count:2026-10-05:count";
export const MANUAL_RUN_IDS = ["running:2026-10-05:1", "running:2026-10-05:2"] as const;

const NOON = chicagoInstant(MANUAL_FITNESS_DAY, "12:00").toISOString();

export function manualFitnessSeed(): FitnessWrites {
  return {
    metrics: [
      {
        source: MANUAL_FITNESS_SOURCE,
        externalId: MANUAL_STEP_ID,
        metric: "step_count",
        day: MANUAL_FITNESS_DAY,
        recordedAt: NOON,
        qty: "21608",
        units: "count",
        qtyMin: null,
        qtyMax: null,
        origin: "manual",
        payload: {
          metric: "step_count",
          day: MANUAL_FITNESS_DAY,
          note: "Manual entry for 2026-10-05.",
        },
      },
    ],
    workouts: [
      {
        source: MANUAL_FITNESS_SOURCE,
        externalId: MANUAL_RUN_IDS[0],
        name: "Running",
        startedAt: NOON,
        endedAt: null,
        durationSec: "1140",
        distanceQty: "1.9",
        distanceUnits: "mi",
        energyKcal: "304",
        heartRateAvg: null,
        heartRateMin: null,
        heartRateMax: null,
        origin: "manual",
        payload: {
          name: "Running",
          source: "Nike Run Club",
          clockKnown: false,
          note: "Manual entry. Clock time was not recorded.",
        },
      },
      {
        source: MANUAL_FITNESS_SOURCE,
        externalId: MANUAL_RUN_IDS[1],
        name: "Running",
        startedAt: NOON,
        endedAt: null,
        durationSec: "960",
        distanceQty: "2",
        distanceUnits: "mi",
        energyKcal: "313",
        heartRateAvg: null,
        heartRateMin: null,
        heartRateMax: null,
        origin: "manual",
        payload: {
          name: "Running",
          source: "Nike Run Club",
          clockKnown: false,
          note: "Manual entry. Clock time was not recorded.",
        },
      },
    ],
  };
}
