import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { buildFitnessStory, type FitnessStory, type StoryFigure } from "@/lib/fitness-story";
import { manualFitnessSeed } from "@/lib/fitness-seed";
import type { ManualSummary } from "@/lib/fitness-manual";
import type { FitnessMetricWrite, FitnessOrigin, FitnessWorkoutWrite } from "@/lib/fitness-types";

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (normalized === "next/link" || normalized.includes("next/dist/client/link")) {
    return {
      __esModule: true,
      default: function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string }) {
        return createElement("a", { href: props.href ?? "", className: props.className }, props.children);
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  const props = node.props as {
    children?: ReactNode;
    href?: string;
    className?: string;
    "data-node-face"?: string;
    "data-node-face-grid"?: boolean;
  };
  const href = typeof props.href === "string" ? props.href : "";
  const face = props["data-node-face"] ? ` data-node-face="${props["data-node-face"]}"` : "";
  const grid = props["data-node-face-grid"] ? " data-node-face-grid" : "";
  const className = props.className ? ` ${props.className}` : "";
  return `${href}${face}${grid}${className}${render(props.children)}`;
}

function figure(story: FitnessStory, period: "week" | "month", id: string): StoryFigure {
  const found = story.periods.find((item) => item.id === period)?.figures.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${period} ${id}`);
  return found;
}

function manual(partial: Partial<ManualSummary> & Pick<ManualSummary, "id" | "metric" | "value" | "unit">): ManualSummary {
  return {
    entryDate: partial.periodEnd ?? "2026-10-08",
    periodStart: "2026-10-05",
    periodEnd: "2026-10-08",
    app: "Notes",
    approx: false,
    note: null,
    source: "manual-import",
    createdAt: "2026-10-08T18:00:00.000Z",
    ...partial,
  };
}

function steps(day: string, qty: string, origin: FitnessOrigin): FitnessMetricWrite {
  return {
    source: origin === "manual" ? "manual" : "health",
    externalId: `steps:${day}:${origin}`,
    metric: "step_count",
    day,
    recordedAt: origin === "manual" ? null : `${day}T15:04:00.000Z`,
    qty,
    units: "count",
    qtyMin: null,
    qtyMax: null,
    origin,
    payload: origin === "health-auto-export" ? { source: "Apple Health" } : {},
  };
}

function resting(day: string, qty: string): FitnessMetricWrite {
  return {
    source: "health",
    externalId: `rest:${day}`,
    metric: "resting_heart_rate",
    day,
    recordedAt: `${day}T12:00:00.000Z`,
    qty,
    units: "count/min",
    qtyMin: null,
    qtyMax: null,
    origin: "health-auto-export",
    payload: {},
  };
}

function run(partial: Partial<FitnessWorkoutWrite> & Pick<FitnessWorkoutWrite, "externalId" | "startedAt">): FitnessWorkoutWrite {
  return {
    source: "health",
    name: "Running",
    endedAt: null,
    durationSec: "1800",
    distanceQty: "3",
    distanceUnits: "mi",
    energyKcal: null,
    heartRateAvg: null,
    heartRateMin: null,
    heartRateMax: null,
    origin: "health-auto-export",
    payload: {},
    ...partial,
  };
}

describe("fitness story", () => {
  it("reads the known 5 Oct day as this week and this month", () => {
    const seed = manualFitnessSeed();
    const story = buildFitnessStory({
      metrics: seed.metrics,
      workouts: seed.workouts,
      manuals: [],
      today: "2026-10-08",
    });
    const text = JSON.stringify(story);
    assert.equal(text.includes("streak"), false);
    assert.equal(text.includes("$"), false);
    assert.equal(figure(story, "week", "average-steps").value, "21,608");
    assert.match(figure(story, "week", "average-steps").meta ?? "", /from Manual import/);
    assert.match(figure(story, "week", "average-steps").meta ?? "", /across 1 day/);
    assert.match(figure(story, "week", "average-steps").meta ?? "", /updated 5 Oct 2026/);
    assert.equal(figure(story, "week", "runs").value, "2");
    assert.match(figure(story, "week", "runs").meta ?? "", /from Nike Run Club/);
    assert.equal(figure(story, "week", "miles").value, "3.9 mi");
    assert.equal(figure(story, "week", "pace").value, "8:58 /mi");
    assert.equal(figure(story, "week", "active-days").value, "1/7");
    assert.equal(figure(story, "week", "longest-run").value, "2.0 mi");
    assert.equal(figure(story, "week", "versus-last-week").value, "no runs last week");
    assert.equal(figure(story, "month", "miles").value, "3.9 mi");
    assert.equal(figure(story, "month", "active-days").value, "1/8");
    assert.equal(story.periods[0]?.notes.some((note) => note === "35 min on runs"), true);
    assert.equal(story.periods[0]?.notes.some((note) => /heart/i.test(note)), false);
    assert.equal(story.lifting.value, "not connected yet");
    assert.equal(story.manual.text, "not recorded");
    assert.equal(story.steps.bars.length, 1);
    assert.equal(story.runs.bars.length, 1);
    assert.equal(story.recent.length, 2);
    assert.equal(story.recent[0]?.date, "5 Oct 2026");
    assert.match(story.recent[0]?.miles ?? "", /mi/);
    assert.match(story.recent[0]?.pace ?? "", /\/mi/);
    assert.equal(story.recent[0]?.source, "Nike Run Club");
  });

  it("leaves this week empty when the only day is earlier in the month", () => {
    const seed = manualFitnessSeed();
    const story = buildFitnessStory({
      metrics: seed.metrics,
      workouts: seed.workouts,
      manuals: [],
      today: "2026-10-17",
      stepsRange: "m",
      runsRange: "m",
    });
    assert.equal(figure(story, "week", "average-steps").value, "not recorded");
    assert.equal(figure(story, "week", "runs").value, "not recorded");
    assert.equal(figure(story, "week", "miles").value, "not recorded");
    assert.equal(figure(story, "week", "pace").value, "not recorded");
    assert.equal(figure(story, "week", "longest-run").value, "not recorded");
    assert.equal(figure(story, "week", "active-days").value, "0/7");
    assert.equal(figure(story, "month", "average-steps").value, "21,608");
    assert.equal(figure(story, "month", "runs").value, "2");
    assert.deepEqual(story.steps.bars.map((bar) => bar.id), ["2026-10-05"]);
    assert.deepEqual(story.runs.bars.map((bar) => bar.id), ["2026-10-05"]);

    const written = buildFitnessStory({
      metrics: seed.metrics,
      workouts: seed.workouts,
      manuals: [
        manual({
          id: "this-week",
          metric: "steps",
          value: "70000",
          unit: "steps",
          periodStart: "2026-10-12",
          periodEnd: "2026-10-18",
          approx: true,
        }),
      ],
      today: "2026-10-17",
      stepsRange: "w",
    });
    assert.equal(figure(written, "week", "average-steps").value, "~10,000");
    assert.match(figure(written, "week", "average-steps").meta ?? "", /Manual import/);
    assert.equal(written.steps.bars.length, 0);
    assert.equal(figure(written, "month", "average-steps").value, "~11,451");
    assert.match(figure(written, "month", "average-steps").meta ?? "", /approx/);
    assert.match(figure(written, "month", "average-steps").meta ?? "", /Apple Health|Manual import/);
  });

  it("prefers the day-by-day record and keeps a manual summary off the charts", () => {
    const story = buildFitnessStory({
      metrics: [steps("2026-10-05", "10000", "health-auto-export"), resting("2026-10-06", "61")],
      workouts: [
        run({
          externalId: "run-1",
          startedAt: "2026-10-05T14:00:00.000Z",
          distanceQty: "4",
          durationSec: "2400",
          heartRateAvg: "150",
          origin: "health-auto-export",
        }),
      ],
      manuals: [
        manual({
          id: "steps",
          metric: "steps",
          value: "70000",
          unit: "steps",
          periodStart: "2026-10-05",
          periodEnd: "2026-10-08",
          app: "Notes",
        }),
        manual({
          id: "miles",
          metric: "distance",
          value: "100",
          unit: "mi",
          approx: true,
          periodStart: "2026-10-05",
          periodEnd: "2026-10-08",
          app: "Nike Run Club",
          note: "dues $20",
        }),
      ],
      today: "2026-10-08",
      stepsRange: "m",
      runsRange: "m",
    });
    assert.equal(figure(story, "week", "average-steps").value, "10,000");
    assert.match(figure(story, "week", "average-steps").meta ?? "", /from Apple Health/);
    assert.equal(figure(story, "week", "miles").value, "4.0 mi");
    assert.match(story.periods[0]?.aside ?? "", /Apple Health kept/);
    assert.match(story.periods[0]?.aside ?? "", /not added again/);
    assert.deepEqual(story.steps.bars.map((bar) => bar.value), [10000]);
    assert.deepEqual(story.runs.bars.map((bar) => bar.value), [4]);
    assert.equal(story.manual.text.includes("70000"), false);
    assert.equal(story.manual.text.includes("100"), false);
    assert.match(story.periods[0]?.notes.join(" ") ?? "", /Resting heart/,);
    assert.equal(story.periods[0]?.notes.some((note) => /Average heart on runs 150 bpm/.test(note)), true);

    const quiet = buildFitnessStory({
      metrics: [resting("2026-10-05", "0")],
      workouts: [run({ externalId: "zero-hr", startedAt: "2026-10-05T14:00:00.000Z", heartRateAvg: "0" })],
      manuals: [],
      today: "2026-10-08",
    });
    assert.equal(quiet.periods[0]?.notes.some((note) => /heart/i.test(note)), false);
    assert.equal(JSON.stringify(quiet).includes("0 bpm"), false);
  });

  it("uses a manual summary only for days the day-by-day record does not cover", async () => {
    const story = buildFitnessStory({
      metrics: [steps("2026-10-05", "10000", "health-auto-export")],
      workouts: [],
      manuals: [
        manual({
          id: "later-steps",
          metric: "steps",
          value: "12000",
          unit: "steps",
          periodStart: "2026-10-06",
          periodEnd: "2026-10-07",
          approx: true,
          app: "Notes $9",
        }),
        manual({
          id: "later-miles",
          metric: "distance",
          value: "6",
          unit: "mi",
          periodStart: "2026-10-06",
          periodEnd: "2026-10-06",
          approx: true,
        }),
        manual({
          id: "later-pace",
          metric: "pace",
          value: "9",
          unit: "min/mi",
          periodStart: "2026-10-06",
          periodEnd: "2026-10-06",
          approx: true,
        }),
        manual({
          id: "sessions",
          metric: "sessions",
          value: "4",
          unit: "count",
          app: "Strong",
          periodStart: "2026-10-05",
          periodEnd: "2026-10-08",
        }),
      ],
      today: "2026-10-08",
      publicMode: true,
      stepsRange: "w",
      runsRange: "w",
    });
    assert.equal(figure(story, "week", "average-steps").value, "7,333");
    assert.match(figure(story, "week", "average-steps").meta ?? "", /Apple Health and Manual import/);
    assert.match(figure(story, "week", "average-steps").meta ?? "", /approx/);
    assert.equal(figure(story, "week", "miles").value, "~6.0 mi");
    assert.match(figure(story, "week", "miles").meta ?? "", /from Manual import/);
    assert.equal(figure(story, "week", "pace").value, "~9:00 /mi");
    assert.equal(figure(story, "week", "active-days").value, "1/7");
    assert.deepEqual(story.steps.bars.map((bar) => bar.id), ["2026-10-05"]);
    assert.equal(story.runs.bars.length, 0);
    assert.equal(story.recent[0]?.miles, "~6.0 mi");
    assert.equal(story.recent[0]?.pace, "9:00 /mi");
    assert.match(story.recent[0]?.source ?? "", /Manual import/);
    assert.match(story.recent[0]?.source ?? "", /approx/);
    assert.match(story.manual.text, /Strong/);
    assert.match(story.manual.text, /4 count/);
    assert.equal(JSON.stringify(story).includes("$"), false);
    assert.equal(story.lifting.value, "not connected yet");

    const { FitnessStoryView } = await import("@/components/fitness-story");
    const html = render(
      createElement(FitnessStoryView, { story, stepsRange: "w", runsRange: "w" }),
    );
    assert.match(html, /This week/);
    assert.match(html, /This month/);
    assert.match(html, /\/n\/fitness\?steps=m&runs=w/);
    assert.match(html, /\/n\/fitness\?steps=w&runs=y/);
    assert.match(html, /\/n\/fitness\/steps/);
    assert.match(html, /\/n\/fitness\/runs/);
    assert.match(html, /\/n\/fitness\/lifting/);
    assert.match(html, /\/n\/fitness\/manual/);
    assert.match(html, /not connected yet/);
    assert.match(html, /data-node-face-grid/);
    assert.match(html, /data-node-face="week-average-steps"/);
    assert.match(html, /data-node-face="month-miles"/);
    assert.match(html, /data-node-face="lifting"/);
    assert.match(html, /data-node-face="manual"/);
    assert.match(html, /node-face-glyph/);
    assert.match(html, /Apple Health/);
    assert.match(html, /Manual import/);
    assert.match(html, /7 Oct|6 Oct/);
    assert.equal(html.includes("fitness-figure"), false);
    assert.equal(html.includes("$"), false);
    assert.equal(html.includes("streak"), false);
  });

  it("shows a real lifting session and a week-over-week change", () => {
    const story = buildFitnessStory({
      metrics: [],
      workouts: [
        run({
          externalId: "last",
          startedAt: "2026-09-30T15:00:00.000Z",
          distanceQty: "2",
          durationSec: "1200",
        }),
        run({
          externalId: "this",
          startedAt: "2026-10-06T15:00:00.000Z",
          distanceQty: "4",
          durationSec: "2400",
        }),
        run({
          externalId: "lift",
          name: "Strength",
          startedAt: "2026-10-06T18:00:00.000Z",
          distanceQty: null,
          distanceUnits: null,
          durationSec: "2400",
        }),
      ],
      manuals: [],
      today: "2026-10-08",
    });
    assert.equal(figure(story, "week", "miles").value, "4.0 mi");
    assert.equal(figure(story, "week", "versus-last-week").value, "+100%");
    assert.match(figure(story, "week", "versus-last-week").meta ?? "", /from Apple Health/);
    assert.match(figure(story, "week", "versus-last-week").meta ?? "", /updated/);
    assert.equal(figure(story, "week", "active-days").value, "1/7");
    assert.equal(story.lifting.value, "1 this week");
    assert.match(story.lifting.meta ?? "", /Strength/);
    assert.equal(story.lifting.value.includes("Mon"), false);
  });
});
