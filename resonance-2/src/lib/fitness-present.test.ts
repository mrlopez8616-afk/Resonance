import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactNode } from "react";
import { describe, it } from "node:test";
import {
  STEP_GOAL,
  buildAnalytics,
  buildRunDetail,
  buildRunsView,
  buildStepsView,
  textHasHeartRate,
} from "@/lib/fitness-present";
import type { FitnessMetricWrite, FitnessWorkoutWrite } from "@/lib/fitness-types";

const TODAY = "2026-10-29";

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

async function mirrors() {
  return import("@/components/fitness-mirror");
}

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  const props = node.props as { children?: ReactNode; href?: string; className?: string };
  const attrs = [props.href ? ` href="${props.href}"` : "", props.className ? ` class="${props.className}"` : ""]
    .join("");
  const tag = typeof type === "string" ? type : "div";
  return `<${tag}${attrs}>${render(props.children)}</${tag}>`;
}

function step(day: string, qty: number): FitnessMetricWrite {
  return {
    source: "health-auto-export",
    externalId: `step_count:${day}:count`,
    metric: "step_count",
    day,
    recordedAt: `${day}T12:00:00.000Z`,
    qty: String(qty),
    units: "count",
    qtyMin: null,
    qtyMax: null,
    origin: "health-auto-export",
    payload: { dailyTotal: true },
  };
}

function resting(day: string, qty: number): FitnessMetricWrite {
  return {
    ...step(day, qty),
    externalId: `resting_heart_rate:${day}:bpm`,
    metric: "resting_heart_rate",
    units: "bpm",
  };
}

function run(input: {
  id: string;
  day: string;
  miles: number;
  seconds: number;
  kcal?: number;
  heart?: number;
  max?: number;
  splits?: { miles: string; durationSec: string }[];
}): FitnessWorkoutWrite {
  return {
    source: "health-auto-export",
    externalId: input.id,
    name: "Running",
    startedAt: `${input.day}T12:00:00.000Z`,
    endedAt: null,
    durationSec: String(input.seconds),
    distanceQty: String(input.miles),
    distanceUnits: "mi",
    energyKcal: input.kcal === undefined ? null : String(input.kcal),
    heartRateAvg: input.heart === undefined ? null : String(input.heart),
    heartRateMin: null,
    heartRateMax: input.max === undefined ? null : String(input.max),
    origin: "health-auto-export",
    payload: input.splits ? { splits: input.splits } : { name: "Running" },
  };
}

describe("steps mirror", () => {
  const metrics = [
    step("2026-10-26", 9000),
    step("2026-10-27", 7000),
    step("2026-10-28", 11000),
    step("2026-10-29", 8000),
    step("2026-09-15", 12000),
    step("2026-08-02", 6000),
  ];

  it("uses day bars for a week and a month, and skips hours", () => {
    const day = buildStepsView({ metrics, today: TODAY, span: "d" });
    assert.equal(day.hourlyNote, "Hourly steps are not in this export.");
    assert.deepEqual(day.bars, []);
    assert.equal(day.average, "8,000");
    assert.equal(day.averageLabel, "today");
    assert.match(day.trend ?? "", /from yesterday/);

    const week = buildStepsView({ metrics, today: TODAY, span: "w" });
    assert.equal(week.bars.length, 4);
    assert.equal(week.bars[0]?.label, "Mon");
    assert.equal(week.averageLabel, "daily average");
    assert.equal(week.days.length, 4);
    assert.equal(week.days[0]?.steps, "8,000");

    const month = buildStepsView({ metrics, today: TODAY, span: "m" });
    assert.equal(month.bars.length, 4);
    assert.equal(month.bars.every((bar) => /^\d+$/.test(bar.label)), true);
    assert.match(month.highlights.map((item) => item.text).join(" "), /more steps this month than last|fewer steps this month than last|highest day/);
  });

  it("averages weeks over six months and months over the year", () => {
    const half = buildStepsView({ metrics, today: TODAY, span: "6m" });
    assert.ok(half.bars.length >= 2);
    assert.match(half.bars[0]?.caption ?? "", /avg/);
    const year = buildStepsView({ metrics, today: TODAY, span: "y" });
    assert.deepEqual(
      year.bars.map((bar) => bar.label),
      ["Aug", "Sep", "Oct"],
    );
    assert.equal(year.bars.find((bar) => bar.label === "Oct")?.caption, "avg 8,750");
  });

  it("does not draw a missing day as zero", () => {
    const week = buildStepsView({ metrics: [step("2026-10-29", 1000)], today: TODAY, span: "w" });
    assert.equal(week.bars.length, 1);
    assert.equal(week.bars.some((bar) => bar.value === 0), false);
    const empty = buildStepsView({ metrics: [], today: TODAY, span: "w" });
    assert.equal(empty.empty, "No steps in this range yet.");
    assert.equal(empty.average, null);
  });
});

describe("runs mirror", () => {
  const workouts = [
    run({ id: "short", day: "2026-10-01", miles: 0.8, seconds: 480, kcal: 80, heart: 150 }),
    run({ id: "mile", day: "2026-10-08", miles: 1.2, seconds: 600, kcal: 140, heart: 148, max: 170 }),
    run({
      id: "five",
      day: "2026-10-20",
      miles: 3.2,
      seconds: 1680,
      kcal: 320,
      heart: 154,
      splits: [
        { miles: "1", durationSec: "520" },
        { miles: "1", durationSec: "540" },
      ],
    }),
  ];

  it("lists runs and keeps mile and 5K marks to runs at least that far", () => {
    const view = buildRunsView({ workouts, today: TODAY, publicMode: false });
    assert.equal(view.cards[0]?.distance, "3.2 mi");
    assert.equal(view.cards[0]?.energy, "320 kcal");
    assert.equal(view.cards[0]?.avgHeart, "154 bpm");
    assert.equal(view.months[0]?.label, "October 2026");
    assert.equal(view.months[0]?.runs, "3");
    assert.equal(view.prs.find((pr) => pr.id === "longest")?.value, "3.2 mi");
    assert.equal(view.prs.find((pr) => pr.id === "fastest-mile")?.when.includes("1.2 mi"), true);
    assert.equal(view.prs.find((pr) => pr.id === "fastest-5k")?.when.includes("3.2 mi"), true);
    assert.equal(view.prs.some((pr) => pr.when.includes("0.8 mi") && pr.id !== "fastest-pace"), false);
    const detail = buildRunDetail({ workouts, today: TODAY, id: "health-auto-export:five", publicMode: false });
    assert.equal(detail?.splits.length, 2);
    assert.equal(detail?.maxHeart, undefined);
    const bare = buildRunDetail({ workouts, today: TODAY, id: "health-auto-export:mile", publicMode: false });
    assert.deepEqual(bare?.splits, []);
    assert.equal(bare?.splitsNote, "No splits in this export.");
    assert.equal(bare?.maxHeart, "170 bpm");
    assert.equal(buildRunDetail({ workouts, today: TODAY, id: "missing", publicMode: false }), null);
  });

  it("drops heart rate from the public view", async () => {
    const view = buildRunsView({ workouts, today: TODAY, publicMode: true });
    const detail = buildRunDetail({ workouts, today: TODAY, id: "health-auto-export:five", publicMode: true });
    const { RunsMirror } = await mirrors();
    const html = render(createElement(RunsMirror, { view }));
    const text = `${JSON.stringify(view)}${JSON.stringify(detail)}${html}`;
    assert.equal(textHasHeartRate(text), false);
    assert.equal(text.includes("avgHeart"), false);
    assert.match(html, /3\.2 mi/);
    assert.match(html, /Records/);
  });

  it("states an empty list without inventing a run", () => {
    const view = buildRunsView({ workouts: [], today: TODAY, publicMode: true });
    assert.equal(view.empty, "No runs yet.");
    assert.deepEqual(view.prs, []);
    assert.deepEqual(view.cards, []);
  });
});

describe("resonance analytics", () => {
  it("scores the streak and the 30-day consistency from the goal", () => {
    assert.equal(STEP_GOAL, 8000);
    const metrics = [
      step("2026-10-27", 9000),
      step("2026-10-28", 8100),
      step("2026-10-29", 1000),
    ];
    const broken = buildAnalytics({ metrics, workouts: [], today: TODAY, publicMode: false });
    assert.equal(broken.find((metric) => metric.id === "step-streak")?.value, "0 days");
    const open = buildAnalytics({
      metrics: [step("2026-10-27", 9000), step("2026-10-28", 8100)],
      workouts: [],
      today: TODAY,
      publicMode: false,
    });
    assert.equal(open.find((metric) => metric.id === "step-streak")?.value, "2 days");
    const steady = Array.from({ length: 30 }, (_, index) => step(`2026-10-${String(index + 1).padStart(2, "0")}`, index < 15 ? 9000 : 1000)).filter(
      (row) => row.day <= TODAY,
    );
    const score = buildAnalytics({ metrics: steady, workouts: [], today: TODAY, publicMode: true });
    assert.match(score.find((metric) => metric.id === "step-consistency")?.how ?? "", /8,000/);
    assert.match(score.find((metric) => metric.id === "step-consistency")?.value ?? "", /%$/);
  });

  it("charts eight weeks of miles, pace, and the long-run share", () => {
    const workouts = [
      run({ id: "a", day: "2026-10-20", miles: 6, seconds: 3600 }),
      run({ id: "b", day: "2026-10-22", miles: 2, seconds: 1100 }),
      run({ id: "c", day: "2026-10-27", miles: 4, seconds: 2000 }),
      run({ id: "d", day: "2026-10-13", miles: 3, seconds: 1500 }),
      run({ id: "e", day: "2026-10-06", miles: 3, seconds: 1400 }),
      run({ id: "f", day: "2026-09-28", miles: 5, seconds: 2500 }),
    ];
    const metrics = buildAnalytics({ metrics: [], workouts, today: TODAY, publicMode: true });
    const miles = metrics.find((metric) => metric.id === "weekly-mileage");
    assert.equal(miles?.bars.length, 8);
    const pace = metrics.find((metric) => metric.id === "pace-progression");
    assert.match(pace?.value ?? "", /\/mi/);
    assert.match(pace?.how ?? "", /last 5 runs/);
    const share = metrics.find((metric) => metric.id === "long-run-share");
    assert.match(share?.value ?? "", /%$/);
    assert.match(share?.how ?? "", /longest run/);
    for (const metric of metrics) assert.match(metric.how, /\w/);
  });

  it("hides heart cards in public view and names the missing resting metric in private", async () => {
    const workouts = [run({ id: "hr", day: "2026-10-20", miles: 3, seconds: 1500, heart: 150 })];
    const pub = buildAnalytics({ metrics: [], workouts, today: TODAY, publicMode: true });
    assert.equal(pub.some((metric) => metric.id === "resting-heart" || metric.id === "average-heart"), false);
    const { AnalyticsMirror } = await mirrors();
    const html = render(createElement(AnalyticsMirror, { metrics: pub }));
    assert.equal(textHasHeartRate(html), false);
    assert.match(html, /How it(?:'|&#x27;)s calculated/);
    assert.match(html, /Resonance Analytics/);

    const priv = buildAnalytics({ metrics: [], workouts, today: TODAY, publicMode: false });
    const restingCard = priv.find((metric) => metric.id === "resting-heart");
    assert.equal(restingCard?.value, "Not connected yet");
    assert.match(restingCard?.detail ?? "", /resting_heart_rate/);
    const average = priv.find((metric) => metric.id === "average-heart");
    assert.match(average?.value ?? "", /bpm/);

    const connected = buildAnalytics({
      metrics: [resting("2026-10-01", 60), resting("2026-10-20", 64)],
      workouts,
      today: TODAY,
      publicMode: false,
    });
    assert.match(connected.find((metric) => metric.id === "resting-heart")?.value ?? "", /bpm/);
    assert.ok((connected.find((metric) => metric.id === "resting-heart")?.bars.length ?? 0) > 0);
  });
});

describe("steps page markup", () => {
  it("renders the range switch and a chart without heart rate", async () => {
    const view = buildStepsView({
      metrics: [step("2026-10-28", 9000), step("2026-10-29", 10000)],
      today: TODAY,
      span: "w",
      publicMode: true,
    });
    const { StepsMirror } = await mirrors();
    const html = render(createElement(StepsMirror, { view }));
    assert.match(html, /span=d/);
    assert.match(html, /span=6m/);
    assert.match(html, /<svg/);
    assert.match(html, /daily average/);
    assert.equal(textHasHeartRate(html), false);
  });
});
