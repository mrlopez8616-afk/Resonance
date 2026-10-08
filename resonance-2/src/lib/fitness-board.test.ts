import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fitnessCards,
  fitnessHomeLine,
  fitnessLegacyHref,
  fitnessNode,
  metricSamples,
  workoutSamples,
} from "./fitness-board";
import { parseHealthExport } from "./fitness-parse";
import { parseFitnessIngest } from "./fitness-shortcuts";
import { sampleLegacyWorkoutBody, sampleMetricsBody, sampleWorkoutsBody } from "./fitness-sample";
import { manualFitnessSeed } from "./fitness-seed";

const TODAY = "2026-10-07";

describe("fitness board", () => {
  it("shows the manual 5 Oct day without calling it today", () => {
    const seed = manualFitnessSeed();
    const metrics = metricSamples(seed.metrics);
    const workouts = workoutSamples(seed.workouts);
    assert.equal(seed.workouts.reduce((sum, row) => sum + Number(row.energyKcal), 0), 617);
    assert.deepEqual(fitnessHomeLine(metrics, workouts, TODAY), {
      value: "3.9",
      unit: "mi this week",
    });
    assert.deepEqual(fitnessHomeLine(metrics, workouts, "2026-10-05"), {
      value: "21,608",
      unit: "steps",
    });

    const cards = Object.fromEntries(
      fitnessCards(metrics, workouts, TODAY).map((card) => [card.id, card]),
    );
    assert.equal(cards.steps?.title, "Steps");
    assert.equal(cards.steps?.href, "/n/fitness/steps");
    assert.equal(cards.steps?.headline, "21,608");
    assert.match(cards.steps?.detail ?? "", /5 Oct/);
    assert.match(cards.steps?.detail ?? "", /7-day avg 21,608/);
    assert.equal(fitnessLegacyHref("activity"), "/n/fitness/steps");
    assert.equal(fitnessNode("activity", metrics, workouts, TODAY), null);
    assert.equal(cards.runs?.headline, "3.9 mi");
    assert.match(cards.runs?.detail ?? "", /1\.9 mi · 19 min/);
    assert.match(cards.runs?.detail ?? "", /2\.0 mi · 16 min/);
    assert.equal(cards.lifting?.headline, null);
    assert.match(cards.lifting?.detail ?? "", /phone sync/);
    assert.equal(cards.heart?.headline, null);

    const runs = fitnessNode("runs", metrics, workouts, TODAY);
    assert.equal(runs?.rows.length, 2);
    assert.match(runs?.rows[0]?.primary ?? "", /1\.9 mi · 19 min/);
    assert.match(runs?.rows[0]?.secondary ?? "", /10:00 \/mi/);
    assert.match(runs?.rows[0]?.secondary ?? "", /304 kcal/);
    assert.match(runs?.rows[0]?.secondary ?? "", /Nike Run Club/);
    assert.match(runs?.rows[1]?.primary ?? "", /2\.0 mi · 16 min/);
    assert.match(runs?.rows[1]?.secondary ?? "", /8:00 \/mi/);
    assert.match(runs?.rows[1]?.secondary ?? "", /313 kcal/);
    assert.equal(fitnessNode("nope", metrics, workouts, TODAY), null);
    const steps = fitnessNode("steps", metrics, workouts, TODAY);
    assert.equal(steps?.title, "Steps");
    assert.equal(steps?.rows.some((row) => row.primary === "0 steps"), false);
  });

  it("prefers a shortcuts day over health auto export and hides a missing day", () => {
    const shortcuts = parseFitnessIngest({
      source: "shortcuts",
      metrics: [
        {
          metric: "steps",
          values: ["8000", 0],
          starts: ["Oct 8, 2026 at 9:00 AM", "Oct 6, 2026 at 9:00 AM"],
        },
        {
          metric: "active_energy",
          values: [520],
          starts: ["Oct 8, 2026 at 9:00 AM"],
        },
        {
          metric: "distance",
          values: [4.1],
          starts: ["Oct 8, 2026 at 9:00 AM"],
        },
        {
          metric: "workouts",
          values: [30, 15],
          starts: ["Oct 8, 2026 at 7:00 AM", "Oct 8, 2026 at 5:00 PM"],
          units: "min",
        },
      ],
    });
    const phone = parseHealthExport({
      data: {
        metrics: [
          {
            name: "step_count",
            units: "count",
            data: [{ qty: 9000, date: "2026-10-08 09:00:00 -0500" }],
          },
        ],
      },
    });
    const metrics = metricSamples([...shortcuts.metrics, ...phone.metrics]);
    assert.equal(metrics.filter((row) => row.day === "2026-10-08" && row.metric === "step_count").length, 1);
    assert.equal(metrics.find((row) => row.day === "2026-10-08" && row.metric === "step_count")?.qty, 8000);
    const detail = fitnessNode("steps", metrics, [], "2026-10-08");
    assert.equal(detail?.headline, "8,000");
    assert.equal(detail?.rows.some((row) => row.id === "2026-10-06"), false);
    assert.equal(detail?.rows.some((row) => row.primary === "0 steps"), false);
    assert.match(detail?.rows[0]?.secondary ?? "", /520 kcal/);
    assert.match(detail?.rows[0]?.secondary ?? "", /4\.1 mi/);
    assert.match(detail?.rows[0]?.secondary ?? "", /45 min/);
  });

  it("lets a phone day replace the manual rows for that day", () => {
    const seed = manualFitnessSeed();
    const phone = parseHealthExport({
      data: {
        metrics: [
          {
            name: "step_count",
            units: "count",
            data: [{ qty: 100, date: "2026-10-05 00:00:00 -0500" }],
          },
        ],
        workouts: [
          {
            id: "live-run",
            name: "Running",
            start: "2026-10-05 07:00:00 -0500",
            end: "2026-10-05 07:10:00 -0500",
            duration: 600,
            distance: { qty: 1, units: "mi" },
          },
        ],
      },
    });
    const metrics = metricSamples([...seed.metrics, ...phone.metrics]);
    const workouts = workoutSamples([...seed.workouts, ...phone.workouts]);
    assert.equal(metrics.find((row) => row.day === "2026-10-05")?.qty, 100);
    assert.equal(workouts.filter((row) => row.kind === "run").length, 1);
    assert.equal(workouts[0]?.origin, "health-auto-export");
  });

  it("parses metric and workout exports, including a version 1 workout", () => {
    const metrics = parseHealthExport(sampleMetricsBody);
    assert.deepEqual(
      metrics.metrics.map((row) => row.externalId).sort(),
      [
        "active_energy:2026-10-06:kcal",
        "heart_rate:2026-10-06:bpm",
        "resting_heart_rate:2026-10-06:bpm",
        "step_count:2026-10-06:count",
        "walking_running_distance:2026-10-06:mi",
      ],
    );
    const heart = metrics.metrics.find((row) => row.metric === "heart_rate");
    assert.equal(heart?.qty, "72");
    assert.equal(heart?.qtyMin, "60");
    assert.equal(heart?.qtyMax, "110");

    const workouts = parseHealthExport(sampleWorkoutsBody);
    const run = workouts.workouts.find((row) => row.externalId === "nrc-sample-1");
    assert.equal(run?.energyKcal, "220");
    assert.equal(run?.heartRateAvg, "154");
    assert.equal(JSON.stringify(run?.payload).includes("latitude"), false);
    assert.equal(JSON.stringify(run?.payload).includes("heartRateData"), false);

    const legacy = parseHealthExport(sampleLegacyWorkoutBody);
    assert.equal(legacy.workouts.length, 1);
    assert.equal(legacy.workouts[0]?.durationSec, "1140");
    assert.equal(legacy.workouts[0]?.heartRateAvg, "150");
    const again = parseHealthExport(sampleLegacyWorkoutBody);
    assert.equal(again.workouts[0]?.externalId, legacy.workouts[0]?.externalId);
  });
});
