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

export type ShortcutWorkoutType = "Running" | "Walking";

/** One Shortcuts running or walking row. Amounts are decimal strings. Pace is null until distance is known. */
export type ShortcutWorkoutWrite = {
  startTime: string;
  type: ShortcutWorkoutType;
  sourceName: string | null;
  durationSec: string;
  /** `workout` is a distance on the workout. `derived` was summed from samples in the same POST. */
  distanceSource: "workout" | "derived" | null;
  distanceM: string | null;
  energyKcal: string | null;
  paceSecPerKm: string | null;
  paceSecPerMi: string | null;
};

export type FitnessWrites = {
  metrics: FitnessMetricWrite[];
  workouts: FitnessWorkoutWrite[];
  /** Running and walking rows from the Shortcuts `workouts` array. */
  shortcutWorkouts?: ShortcutWorkoutWrite[];
};
