import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACKFILL_STEPS, NIGHTLY_STEPS, WORKOUTS_NOTE } from "@/components/fitness-shortcut-setup";
import { fitnessCards, fitnessNode, workoutSamples } from "@/lib/fitness-board";
import { MILE_METERS, paceFrom, readShortcutWorkouts, shortcutWorkoutsAsWrites } from "@/lib/fitness-workouts";

describe("shortcut workout parsing", () => {
  it("converts miles, kilometers, seconds, minutes, and kcal", () => {
    const parsed = readShortcutWorkouts(
      {
        source: "shortcuts",
        workouts: [
          {
            type: "running",
            start: "2026-10-06T18:00:00-05:00",
            duration: 10,
            durationUnit: "min",
            distance: 1,
            distanceUnit: "mi",
            energy: 100,
            energyUnit: "kcal",
          },
          {
            type: "Walking",
            start: "2026-10-06T19:00:00Z",
            duration: 90,
            durationUnit: "s",
            distance: "2 km",
            activeEnergy: { qty: 40, units: "cal" },
          },
        ],
      },
      true,
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const run = parsed.workouts.find((row) => row.type === "Running");
    const walk = parsed.workouts.find((row) => row.type === "Walking");
    assert.equal(Number(run?.durationSec), 600);
    assert.equal(Number(run?.distanceM), MILE_METERS);
    assert.equal(Number(run?.energyKcal), 100);
    assert.equal(run?.paceSecPerMi, paceFrom(600, MILE_METERS)?.perMi);
    assert.equal(run?.paceSecPerKm, paceFrom(600, MILE_METERS)?.perKm);
    assert.equal(Number(walk?.durationSec), 90);
    assert.equal(Number(walk?.distanceM), 2000);
    assert.equal(Number(walk?.energyKcal), 40);
    assert.equal(walk?.paceSecPerKm, "45");
    assert.equal(paceFrom(90, 0), null);
  });

  it("skips other types and rejects a missing offset, a bad unit, and an oversized array", () => {
    const skipped = readShortcutWorkouts(
      {
        workouts: [
          { type: "Cycling", start: "2026-10-06T18:00:00Z", duration: "10 min" },
          { type: "Running", start: "2026-10-06T18:00:00Z", duration: "10 min" },
        ],
      },
      true,
    );
    assert.equal(skipped.ok, true);
    if (!skipped.ok) return;
    assert.equal(skipped.workouts.length, 1);

    const offset = readShortcutWorkouts(
      { workouts: [{ type: "Running", start: "2026-10-06T18:00:00", duration: "10 min" }] },
      true,
    );
    assert.equal(offset.ok, false);

    const unit = readShortcutWorkouts(
      {
        workouts: [
          {
            type: "Running",
            start: "2026-10-06T18:00:00Z",
            duration: 10,
            durationUnit: "min",
            distance: 1,
            distanceUnit: "meters",
          },
        ],
      },
      true,
    );
    assert.equal(unit.ok, false);

    const huge = readShortcutWorkouts(
      { workouts: Array.from({ length: 401 }, () => ({ type: "Running" })) },
      true,
    );
    assert.equal(huge.ok, false);
  });

  it("leaves a non-shortcuts body alone, including one with no workouts array", () => {
    const health = readShortcutWorkouts(
      { data: { workouts: [{ name: "Running", start: "2026-10-06 18:00:00 -0500" }] } },
      false,
    );
    assert.deepEqual(health, { ok: true, workouts: [] });
    const daily = readShortcutWorkouts({ source: "shortcuts", metric: "steps", values: [1], starts: ["Oct 6, 2026 at 8:00 AM"] }, true);
    assert.deepEqual(daily, { ok: true, workouts: [] });
  });

  it("buckets miles by the Chicago week and month and draws pace oldest first", () => {
    const parsed = readShortcutWorkouts(
      {
        source: "shortcuts",
        workouts: [
          {
            type: "Running",
            source: "Nike Run Club",
            start: "2026-10-04T22:00:00-05:00",
            duration: 20,
            durationUnit: "min",
            distance: 2,
            distanceUnit: "mi",
          },
          {
            type: "Walking",
            source: "Nike Run Club",
            start: "2026-10-05T00:30:00-05:00",
            duration: 30,
            durationUnit: "min",
            distance: 1.5,
            distanceUnit: "mi",
          },
          {
            type: "Running",
            start: "2026-09-30T23:00:00-05:00",
            duration: 10,
            durationUnit: "min",
            distance: 1,
            distanceUnit: "km",
          },
          {
            type: "Running",
            source: "Nike Run Club",
            start: "2026-10-01T00:30:00-05:00",
            duration: 15,
            durationUnit: "min",
          },
        ],
      },
      true,
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const samples = workoutSamples(shortcutWorkoutsAsWrites(parsed.workouts));
    const detail = fitnessNode("runs", [], samples, "2026-10-08");
    assert.equal(detail?.weeks.some((week) => week.distance === "0.0 mi"), false);
    const septemberWeek = detail?.weeks.find((week) => week.id === "2026-09-28");
    const octoberWeek = detail?.weeks.find((week) => week.id === "2026-10-05");
    assert.equal(septemberWeek?.distance, "2.6 mi");
    assert.equal(octoberWeek?.distance, "1.5 mi");
    assert.equal(detail?.months.find((month) => month.id === "2026-09")?.label, "September 2026");
    assert.equal(detail?.months.find((month) => month.id === "2026-10")?.distance, "3.5 mi");
    assert.equal(detail?.pace[0]?.label, "30 Sep");
    assert.equal(detail?.pace.at(-1)?.secPerMile, (30 * 60) / 1.5);
    assert.equal(detail?.rows[0]?.secondary?.includes("Walking"), true);
    assert.equal(detail?.rows.some((row) => row.secondary?.includes("Nike Run Club")), true);
    assert.equal(detail?.rows.some((row) => row.primary.includes("0.0 mi")), false);
    const cards = fitnessCards([], samples, "2026-10-08");
    assert.equal(cards.find((card) => card.id === "runs")?.headline, "1.5 mi");
    const quiet = fitnessCards([], samples, "2026-08-01");
    assert.equal(quiet.find((card) => card.id === "runs")?.headline, null);
    assert.equal(fitnessNode("runs", [], samples, "2026-08-01")?.detail, "No runs yet.");
  });
});

describe("sample distance and energy", () => {
  const start = "2026-10-07T06:30:00-05:00";

  it("sums samples inside the workout, including an end that falls inside", () => {
    const parsed = readShortcutWorkouts(
      {
        source: "shortcuts",
        metrics: [
          {
            metric: "distance",
            units: "mi",
            values: [1, 0.25, 5, 0.4],
            starts: [
              "2026-10-07T06:40:00-05:00",
              "2026-10-07T06:20:00-05:00",
              "2026-10-07T07:05:00-05:00",
              "2026-10-07T06:00:00-05:00",
            ],
            ends: ["", "2026-10-07T06:31:00-05:00", "2026-10-07T07:10:00-05:00", "2026-10-07T06:10:00-05:00"],
          },
          {
            metric: "active_energy",
            units: "kcal",
            values: [120, 400],
            starts: ["2026-10-07T06:45:00-05:00", "2026-10-07T08:00:00-05:00"],
          },
        ],
        workouts: [{ type: "Running", source: "Nike Run Club", start, duration: 30, durationUnit: "min" }],
      },
      true,
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const run = parsed.workouts[0];
    assert.equal(run?.distanceSource, "derived");
    assert.ok(Math.abs(Number(run?.distanceM) - 1.25 * MILE_METERS) < 0.01);
    assert.equal(Number(run?.energyKcal), 120);
    assert.equal(run?.paceSecPerKm, paceFrom(1800, 1.25 * MILE_METERS)?.perKm);
    assert.notEqual(run?.distanceM, "0");
  });

  it("keeps one source when the iPhone and the Watch both recorded the window", () => {
    const metrics = [
      {
        metric: "distance",
        units: "mi",
        values: [2, 1],
        starts: ["2026-10-07T06:40:00-05:00", "2026-10-07T06:41:00-05:00"],
        sources: ["Andres’s iPhone", "Nike Run Club"],
      },
    ];
    const matched = readShortcutWorkouts(
      {
        source: "shortcuts",
        metrics,
        workouts: [{ type: "Running", source: "nike run club", start, duration: 30, durationUnit: "min" }],
      },
      true,
    );
    assert.equal(matched.ok, true);
    if (!matched.ok) return;
    assert.ok(Math.abs(Number(matched.workouts[0]?.distanceM) - MILE_METERS) < 0.01);

    const largest = readShortcutWorkouts(
      {
        source: "shortcuts",
        metrics,
        workouts: [{ type: "Running", source: "Apple Watch", start, duration: 30, durationUnit: "min" }],
      },
      true,
    );
    assert.equal(largest.ok, true);
    if (!largest.ok) return;
    assert.ok(Math.abs(Number(largest.workouts[0]?.distanceM) - 2 * MILE_METERS) < 0.01);
    assert.ok(Math.abs(Number(largest.workouts[0]?.distanceM) - 3 * MILE_METERS) > 1);
  });

  it("sums the window when the payload has no per-sample source", () => {
    const parsed = readShortcutWorkouts(
      {
        source: "shortcuts",
        metrics: [
          {
            metric: "distance",
            units: "km",
            values: [0.4, 0.6, 9],
            starts: [
              "2026-10-07T06:35:00-05:00",
              "2026-10-07T06:50:00-05:00",
              "2026-10-07T08:00:00-05:00",
            ],
          },
        ],
        workouts: [{ type: "Walking", start, duration: 30, durationUnit: "min" }],
      },
      true,
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.workouts[0]?.distanceSource, "derived");
    assert.equal(Number(parsed.workouts[0]?.distanceM), 1000);
  });

  it("keeps an explicit workout distance ahead of the samples", () => {
    const parsed = readShortcutWorkouts(
      {
        source: "shortcuts",
        metrics: [
          {
            metric: "distance",
            units: "mi",
            values: [5],
            starts: ["2026-10-07T06:40:00-05:00"],
          },
          {
            metric: "active_energy",
            units: "kcal",
            values: [80],
            starts: ["2026-10-07T06:40:00-05:00"],
          },
        ],
        workouts: [
          {
            type: "Running",
            start,
            duration: 30,
            durationUnit: "min",
            distance: 3,
            distanceUnit: "km",
          },
        ],
      },
      true,
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.workouts[0]?.distanceSource, "workout");
    assert.equal(Number(parsed.workouts[0]?.distanceM), 3000);
    assert.equal(Number(parsed.workouts[0]?.energyKcal), 80);
  });

  it("leaves distance empty when no sample falls inside the workout", () => {
    const parsed = readShortcutWorkouts(
      {
        source: "shortcuts",
        metrics: [
          {
            metric: "distance",
            units: "mi",
            values: [2],
            starts: ["2026-10-07T09:00:00-05:00"],
          },
        ],
        workouts: [{ type: "Running", start, duration: 10, durationUnit: "min" }],
      },
      true,
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.workouts[0]?.distanceM, null);
    assert.equal(parsed.workouts[0]?.distanceSource, null);
    assert.equal(parsed.workouts[0]?.paceSecPerKm, null);
    assert.equal(parsed.workouts[0]?.energyKcal, null);
  });
});

describe("shortcut setup steps", () => {
  it("adds workouts to the same Nightly post", () => {
    const steps = NIGHTLY_STEPS.join("\n");
    const backfill = BACKFILL_STEPS.join("\n");
    assert.match(steps, /Find Workout/);
    assert.match(steps, /Workout Rows/);
    assert.match(steps, /`workouts`/);
    assert.match(steps, /Resonance Nightly/);
    assert.match(steps, /48-hour window/);
    assert.match(steps, /Leave distance and energy off/);
    assert.match(steps, /Distance Ends/);
    assert.equal(steps.includes("not part of Nightly"), false);
    assert.match(backfill, /same range/);
    assert.match(WORKOUTS_NOTE, /Find Health Samples/);
    assert.match(WORKOUTS_NOTE, /only the workout list/);
    assert.match(WORKOUTS_NOTE, /sums every sample/);
    assert.match(WORKOUTS_NOTE, /Actions/);
    assert.match(WORKOUTS_NOTE, /Premium/);
    assert.match(WORKOUTS_NOTE, /larger shortcuts total/);
  });
});
