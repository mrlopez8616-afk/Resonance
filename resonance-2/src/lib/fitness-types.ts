export type FitnessOrigin = "manual" | "health-auto-export" | "shortcuts";

/** One daily metric row. `qty` is a decimal string. */
export type FitnessMetricWrite = {
  source: string;
  externalId: string;
  metric: string;
  day: string;
  recordedAt: string | null;
  qty: string;
  units: string;
  qtyMin: string | null;
  qtyMax: string | null;
  origin: FitnessOrigin;
  payload: unknown;
};

/** One workout row. Amounts are decimal strings. */
export type FitnessWorkoutWrite = {
  source: string;
  externalId: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: string | null;
  distanceQty: string | null;
  distanceUnits: string | null;
  energyKcal: string | null;
  heartRateAvg: string | null;
  heartRateMin: string | null;
  heartRateMax: string | null;
  origin: FitnessOrigin;
  payload: unknown;
};

export type FitnessWrites = {
  metrics: FitnessMetricWrite[];
  workouts: FitnessWorkoutWrite[];
};
