import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { describe, it } from "node:test";
import { HeartTrend, RunBars } from "@/components/fitness-charts";
import { FitnessDetail } from "@/components/fitness-detail";
import { fitnessCards, fitnessNode, metricSamples, workoutSamples } from "@/lib/fitness-board";
import { manualFitnessSeed } from "@/lib/fitness-seed";
import { readNightlyFitness } from "@/lib/fitness-nrc";
import { parseFitnessIngest } from "@/lib/fitness-shortcuts";
import { phoneTrail } from "@/lib/phone-nav";

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  if (typeof type !== "string") return render((node.props as { children?: ReactNode }).children);
  const props = node.props as Record<string, unknown>;
  const attrs: string[] = [];
  for (const key of Object.keys(props).sort()) {
    if (key === "children") continue;
    const value = props[key];
    if (value == null || value === false || typeof value === "function") continue;
    const name = key === "className" ? "class" : key === "htmlFor" ? "for" : key;
    if (value === true) {
      attrs.push(` ${name}`);
      continue;
    }
    attrs.push(` ${name}="${escapeText(String(value)).replace(/"/g, "&quot;")}"`);
  }
  const children = render(props.children as ReactNode);
  if (VOID_TAGS.has(type)) return `<${type}${attrs.join("")}>`;
  return `<${type}${attrs.join("")}>${children}</${type}>`;
}

describe("nightly runs and heart", () => {
  it("reads string numbers, comma decimals, units, and newline health lists", () => {
    const parsed = readNightlyFitness({
      source: "shortcuts",
      metric: "steps",
      values: "4200",
      starts: "Oct 11, 2026 at 9:00 AM",
      restingHr: "58\n60",
      restingStarts: "Oct 11, 2026 at 8:00 AM",
      avgHr: "72, 80",
      avgStarts: "Oct 11, 2026 at 8:00 AM",
      runs: [
        {
          date: "2026-10-11",
          start: "2026-10-11T07:12:00-05:00",
          distance: "3,1 mi",
          duration: "28,5 min",
          pace: "9:01 /mi",
          avgHr: "152 bpm",
        },
        {
          date: "2026-10-10",
          distance: "2.0",
          duration: "960",
          durationUnit: "s",
        },
      ],
    });
    assert.equal(parsed.heart.length, 2);
    assert.equal(parsed.heart.find((row) => row.metric === "resting_heart_rate")?.qty, "59");
    assert.equal(parsed.heart.find((row) => row.metric === "heart_rate")?.qty, "76");
    assert.equal(parsed.runs.length, 2);
    const timed = parsed.runs.find((run) => run.startKey);
    assert.equal(timed?.distanceMi, "3.1");
    assert.equal(timed?.durationSec, "1710");
    assert.equal(timed?.avgHr, "152");
    assert.equal(parsed.runs.find((run) => run.day === "2026-10-10")?.avgHr, null);
    assert.equal(parsed.runs.find((run) => run.day === "2026-10-10")?.durationSec, "960");
  });

  it("dedupes a run on date plus start, or on date plus distance and duration", () => {
    const first = readNightlyFitness({
      runs: "2026-10-11 3.1 mi 28 min\n2026-10-11 3.1 mi 28 min",
    });
    assert.equal(first.runs.length, 1);
    assert.equal(first.runs[0]?.startKey, null);

    const clock = "28:30";
    const second = readNightlyFitness({
      runs: [
        { date: "2026-10-11", distance: "3.10 mi", duration: clock },
        {
          date: "2026-10-11",
          start: "2026-10-11T07:12:00-05:00",
          distance: "5 km",
          duration: "1680",
        },
      ],
    });
    assert.equal(second.runs.length, 2);
    assert.equal(second.runs[1]?.distanceMi, "3.1069");
    const again = readNightlyFitness({
      runs: [
        { date: "2026-10-11", start: "2026-10-11T07:12:00-05:00", distance: "3.2 mi", duration: "1700" },
        { date: "2026-10-11", start: "2026-10-11T07:12:00-05:00", distance: "3.2 mi", duration: "1700", avgHr: "140" },
      ],
    });
    assert.equal(again.runs.length, 1);
    assert.equal(again.runs[0]?.avgHr, "140");
    assert.equal(again.runs[0]?.distanceMi, "3.2");
  });

  it("reads the Find Health Samples lists without a metric wrapper", () => {
    const steps = parseFitnessIngest({
      source: "shortcuts",
      steps: "8,432 steps\n1,200 steps",
      stepStarts: "Oct 11, 2026 at 9:00 PM\nOct 10, 2026 at 9:00 PM",
    });
    assert.equal(steps.metrics.length, 2);
    assert.equal(steps.metrics.find((row) => row.day === "2026-10-11")?.qty, "8432");
    const objects = parseFitnessIngest({
      steps: [{ value: "4,200 count", startDate: "Oct 11, 2026 at 9:00 AM" }],
    });
    assert.equal(objects.metrics[0]?.qty, "4200");
    const wrapped = parseFitnessIngest({
      source: "shortcuts",
      metric: "steps",
      values: ["1000"],
      starts: ["Oct 11, 2026 at 9:00 AM"],
      steps: "9999",
      stepStarts: "Oct 11, 2026 at 9:00 AM",
    });
    assert.equal(wrapped.metrics.length, 1);
    assert.equal(wrapped.metrics[0]?.qty, "1000");

    const heart = readNightlyFitness({
      resting: "58\n60",
      restingStarts: "Oct 11, 2026 at 8:00 AM",
      heart: [
        { value: "72 bpm", "Start Date": "Oct 11, 2026 at 8:00 AM" },
        { value: 80, startDate: "Oct 11, 2026 at 9:00 AM" },
      ],
      runs: [{ "Start Date": "Oct 11, 2026 at 7:12 AM", "Total Distance": "3.1 mi", Duration: "1680", durationUnit: "s", "Average Heart Rate": "152" }],
    });
    assert.equal(heart.heart.find((row) => row.metric === "resting_heart_rate")?.qty, "59");
    assert.equal(heart.heart.find((row) => row.metric === "heart_rate")?.qty, "76");
    assert.equal(heart.runs.length, 1);
    assert.equal(heart.runs[0]?.distanceMi, "3.1");
    assert.equal(heart.runs[0]?.avgHr, "152");
  });

  it("ignores an empty heart list and does not invent a day", () => {
    const parsed = readNightlyFitness({
      restingHr: "0\n",
      avgHr: "",
      runs: [],
    });
    assert.deepEqual(parsed, { heart: [], runs: [] });
    const undated = readNightlyFitness({ restingHr: "62", avgHr: "70" });
    assert.equal(undated.heart.length, 0);
  });

  it("shows run bars and a heart trend, and not recorded when empty", () => {
    const seed = manualFitnessSeed();
    const runs = fitnessNode("runs", metricSamples(seed.metrics), workoutSamples(seed.workouts), "2026-10-07");
    assert.equal(runs?.bars?.length, 2);
    assert.equal(runs?.bars?.some((bar) => bar.caption.includes("$")), false);
    const quiet = fitnessNode("runs", [], [], "2026-10-07");
    assert.equal(quiet?.detail, "not recorded");
    assert.equal(quiet?.bars?.length, 0);
    const heart = fitnessCards([], [], "2026-10-07").find((card) => card.id === "heart");
    assert.equal(heart?.headline, null);
    assert.equal(heart?.detail, "not recorded");

    const withHeart = readNightlyFitness({
      restingHr: "61",
      restingStarts: "2026-10-06",
      avgHr: "74",
      avgStarts: "2026-10-07",
    });
    const detail = fitnessNode("heart", metricSamples(withHeart.heart), [], "2026-10-07");
    assert.equal(detail?.heart?.length, 2);
    assert.equal(detail?.heart?.[0]?.resting !== null && detail?.heart?.[0]?.avg === null, true);
    const html = render(
      createElement(
        "div",
        null,
        createElement(FitnessDetail, { detail: runs! }),
        createElement(RunBars, { bars: runs?.bars ?? [] }),
        createElement(HeartTrend, { points: detail?.heart ?? [] }),
      ),
    );
    assert.equal(html.includes("$"), false);
    assert.equal(html.includes("<svg"), true);
    assert.equal(html.includes("not recorded"), false);
    const emptyHtml = render(createElement(FitnessDetail, { detail: quiet! }));
    assert.equal(emptyHtml.includes("not recorded"), true);
    assert.equal(emptyHtml.includes("$"), false);
  });

  it("keeps fitness owner-only and one level up on the phone", () => {
    const parent = readFileSync(new URL("../app/n/[parent]/page.tsx", import.meta.url), "utf8");
    const node = readFileSync(new URL("../app/n/[parent]/[node]/page.tsx", import.meta.url), "utf8");
    const parentFitness = parent.slice(parent.indexOf('parent.id === "fitness"'));
    const nodeFitness = node.slice(node.indexOf('parent?.id === "fitness"'));
    assert.ok(parentFitness.indexOf('await requireRole("owner")') < parentFitness.indexOf("loadFitnessCards"));
    assert.ok(nodeFitness.indexOf('await requireRole("owner")') < nodeFitness.indexOf("loadFitnessNode"));
    assert.equal(phoneTrail("/n/fitness").back?.href, "/");
    assert.equal(phoneTrail("/n/fitness/runs").back?.href, "/n/fitness");
    assert.equal(phoneTrail("/n/fitness/heart").back?.href, "/n/fitness");
    assert.equal(phoneTrail("/n/fitness/heart").crumbs.at(-1)?.label, "Heart");
    const page = readFileSync(new URL("../app/n/[parent]/page.tsx", import.meta.url), "utf8");
    const copy = readFileSync(new URL("../components/fitness-token-copy.tsx", import.meta.url), "utf8");
    const fitness = page.slice(page.indexOf('parent.id === "fitness"'));
    assert.ok(fitness.indexOf("publicMode ? null") < fitness.indexOf("<FitnessTokenCopy"));
    assert.match(fitness, /FITNESS_INGEST_TOKEN\?\.trim\(\)/);
    assert.match(copy, /Copy token/);
    assert.match(copy, /clipboard\.writeText/);
    assert.equal(copy.includes("FITNESS_INGEST_TOKEN"), false);
    assert.equal(copy.includes("process.env"), false);
    assert.equal(copy.includes("setToken"), false);
  });
});
