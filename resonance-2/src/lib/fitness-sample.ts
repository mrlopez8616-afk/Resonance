/**
 * One Health Auto Export shaped body for the ingest test and
 * `scripts/post-fitness-sample.ts`. Metrics and workouts are the two
 * automations the phone sends; either object is a valid POST.
 */
export const sampleMetricsBody = {
  data: {
    metrics: [
      {
        name: "step_count",
        units: "count",
        data: [{ qty: 1200, date: "2026-10-06 00:00:00 -0500", source: "Andres's iPhone" }],
      },
      {
        name: "active_energy",
        units: "kcal",
        data: [{ qty: 450, date: "2026-10-06 00:00:00 -0500" }],
      },
      {
        name: "heart_rate",
        units: "bpm",
        data: [{ date: "2026-10-06 00:00:00 -0500", Min: 60, Avg: 72, Max: 110 }],
      },
      {
        name: "resting_heart_rate",
        units: "bpm",
        data: [{ qty: 58, date: "2026-10-06 00:00:00 -0500" }],
      },
      {
        name: "walking_running_distance",
        units: "mi",
        data: [{ qty: 1.2, date: "2026-10-06 00:00:00 -0500" }],
      },
    ],
  },
} as const;

export const sampleWorkoutsBody = {
  data: {
    workouts: [
      {
        id: "nrc-sample-1",
        name: "Running",
        start: "2026-10-06 07:00:00 -0500",
        end: "2026-10-06 07:20:00 -0500",
        duration: 1200,
        source: "Nike Run Club",
        distance: { qty: 2.1, units: "mi" },
        activeEnergyBurned: { qty: 220, units: "kcal" },
        heartRate: {
          avg: { qty: 154, units: "bpm" },
          min: { qty: 120, units: "bpm" },
          max: { qty: 172, units: "bpm" },
        },
        route: [{ latitude: 41.8, longitude: -87.6, timestamp: "2026-10-06 07:00:00 -0500" }],
        heartRateData: [{ date: "2026-10-06 07:01:00 -0500", Min: 120, Avg: 150, Max: 160 }],
      },
      {
        id: "strength-sample-1",
        name: "Traditional Strength Training",
        start: "2026-10-06 18:00:00 -0500",
        end: "2026-10-06 18:45:00 -0500",
        duration: 2700,
        activeEnergyBurned: { qty: 180, units: "kcal" },
        avgHeartRate: { qty: 112, units: "bpm" },
      },
    ],
  },
} as const;

/** Version 1 workout with no id. The idempotency key is name plus start and end. */
export const sampleLegacyWorkoutBody = {
  workouts: [
    {
      name: "Running",
      start: "2026-10-04 08:00:00 -0500",
      end: "2026-10-04 08:19:00 -0500",
      activeEnergy: { qty: 200, units: "kcal" },
      distance: { qty: 1.5, units: "mi" },
      heartRateData: [
        { date: "2026-10-04 08:05:00 -0500", qty: 140, units: "count" },
        { date: "2026-10-04 08:10:00 -0500", qty: 160, units: "count" },
      ],
    },
  ],
} as const;
