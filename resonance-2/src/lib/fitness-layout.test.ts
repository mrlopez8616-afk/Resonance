import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { manualFitnessSeed } from "@/lib/fitness-seed";
import { latestFitnessUpdatedAt, workoutUpdatedAt, fitnessMetricEmpty } from "@/lib/fitness-layout";
import { buildAnalytics, buildRunDetail, buildRunsView, buildStepsView } from "@/lib/fitness-present";
import { EMPTY_CARD_NOTE } from "@/lib/node-layout";

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string; title?: string }) {
  return createElement("a", { href: props.href ?? "", className: props.className, title: props.title }, props.children);
}

const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (
    normalized === "next/link" ||
    normalized.endsWith("/link.js") ||
    normalized.endsWith("/link.react-server.js") ||
    normalized.includes("/app-dir/link") ||
    normalized.includes("next/dist/client/link")
  ) {
    return { __esModule: true, default: LinkStandIn };
  }
  return originalLoad(request, parent, isMain);
};

type FloorUi = typeof import("@/components/fitness-floor");
type DetailUi = typeof import("@/components/fitness-detail");
type GridUi = typeof import("@/components/fitness-grid");

let floor: FloorUi;
let detailUi: DetailUi;
let grid: GridUi;

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  if (typeof type !== "string") return render((node.props as { children?: ReactNode }).children);
  const props = node.props as Record<string, unknown>;
  const attrs: string[] = [];
  for (const key of Object.keys(props)) {
    if (key === "children") continue;
    const value = props[key];
    if (value == null || value === false || typeof value === "function") continue;
    const name = key === "className" ? "class" : key;
    if (value === true) {
      attrs.push(` ${name}`);
      continue;
    }
    attrs.push(` ${name}="${String(value).replace(/"/g, "&quot;")}"`);
  }
  const children = render(props.children as ReactNode);
  return `<${type}${attrs.join("")}>${children}</${type}>`;
}

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

before(async () => {
  floor = await import("@/components/fitness-floor");
  detailUi = await import("@/components/fitness-detail");
  grid = await import("@/components/fitness-grid");
});

describe("fitness layout stamps", () => {
  it("uses the latest real workout or sample and hides a placeholder clock", () => {
    assert.equal(latestFitnessUpdatedAt({}), null);
    assert.equal(latestFitnessUpdatedAt({ metrics: [], workouts: [] }), null);
    const seed = manualFitnessSeed();
    assert.equal(latestFitnessUpdatedAt(seed), null);
    assert.equal(workoutUpdatedAt(seed.workouts[0]), null);
    assert.equal(
      latestFitnessUpdatedAt({
        metrics: [
          {
            recordedAt: "2026-11-02T18:00:00.000Z",
            origin: "health-auto-export",
            payload: {},
          },
        ],
        workouts: [
          {
            startedAt: "2026-11-02T20:04:00.000Z",
            endedAt: "2026-11-02T20:30:00.000Z",
            origin: "health-auto-export",
            payload: { clockKnown: true },
          },
        ],
        nrcRuns: [{ startTime: null }],
      }),
      "2026-11-02T20:30:00.000Z",
    );
    assert.equal(fitnessMetricEmpty("not recorded"), true);
    assert.equal(fitnessMetricEmpty("distance not recorded"), true);
    assert.equal(fitnessMetricEmpty("Not connected yet"), true);
    assert.equal(fitnessMetricEmpty("—"), true);
    assert.equal(fitnessMetricEmpty("3.2 mi"), false);
  });
});

describe("fitness on the shared layout", () => {
  const metric = (day: string, qty: number, recordedAt: string) => ({
    source: "health-auto-export",
    externalId: `step_count:${day}:count`,
    metric: "step_count",
    day,
    recordedAt,
    qty: String(qty),
    units: "count",
    qtyMin: null,
    qtyMax: null,
    origin: "health-auto-export" as const,
    payload: { dailyTotal: true },
  });
  const run = {
    source: "health-auto-export",
    externalId: "layout-run",
    name: "Running",
    startedAt: "2026-11-02T20:04:00.000Z",
    endedAt: "2026-11-02T20:32:00.000Z",
    durationSec: "1680",
    distanceQty: "3.2",
    distanceUnits: "mi",
    energyKcal: "320",
    heartRateAvg: "154",
    heartRateMin: null,
    heartRateMax: "176",
    origin: "health-auto-export" as const,
    payload: { name: "Running", clockKnown: true },
  };

  it("keeps the parent screen, equal cards, and Updated from a real stamp", () => {
    const steps = buildStepsView({ metrics: [metric("2026-11-01", 9000, run.startedAt), metric("2026-11-02", 10000, run.endedAt!)], today: "2026-11-02" });
    const runs = buildRunsView({ workouts: [run], today: "2026-11-02" });
    const analytics = buildAnalytics({ metrics: [metric("2026-11-02", 10000, run.endedAt!)], workouts: [run], today: "2026-11-02" });
    const html = render(
      createElement(floor.FitnessFloor, {
        steps,
        runs,
        analytics,
        updatedAt: latestFitnessUpdatedAt({ metrics: [metric("2026-11-02", 10000, run.endedAt!)], workouts: [run] }),
      }),
    );
    assert.match(html, /node-layout/);
    assert.match(html, /data-node-status=/);
    assert.match(html, /Updated 2:32 PM CT/);
    assert.match(html, /href="\/"/);
    assert.match(html, />Back</);
    assert.match(html, /id="steps"/);
    assert.match(html, /id="analytics"/);
    assert.match(html, /Steps/);
    assert.match(html, /aria-label="Activity"/);
    assert.match(html, /tab=runs/);
    assert.match(html, /Resonance Analytics/);
    assert.match(html, /span=d/);
    assert.match(html, /node-card node-card-equal/);
    assert.match(html, /154 bpm/);
    assert.equal(html.includes('id="runs"'), false);
    assert.equal(html.includes("not recorded"), false);

    const runsHtml = render(
      createElement(floor.FitnessFloor, {
        tab: "runs",
        steps,
        runs,
        analytics,
        updatedAt: latestFitnessUpdatedAt({ metrics: [metric("2026-11-02", 10000, run.endedAt!)], workouts: [run] }),
      }),
    );
    assert.match(runsHtml, /id="runs"/);
    assert.match(runsHtml, /tab=runs/);
    assert.match(runsHtml, /History/);
    assert.match(runsHtml, /Records/);
    assert.match(runsHtml, /3\.2 mi/);
    assert.match(runsHtml, /154 bpm/);
    assert.equal(runsHtml.includes('id="steps"'), false);
  });

  it("locks heart cards in Public view and keeps their box", () => {
    const steps = buildStepsView({
      metrics: [metric("2026-11-02", 10000, run.startedAt)],
      today: "2026-11-02",
      publicMode: true,
    });
    const runs = buildRunsView({ workouts: [run], today: "2026-11-02", publicMode: true });
    const analytics = buildAnalytics({
      metrics: [metric("2026-11-02", 10000, run.startedAt)],
      workouts: [run],
      today: "2026-11-02",
      publicMode: true,
    });
    const html = render(
      createElement(floor.FitnessFloor, { steps, runs, analytics, publicMode: true, updatedAt: run.startedAt }),
    );
    assert.match(html, /data-lock-badge/);
    assert.match(html, /node-card-equal/);
    assert.match(html, /Resting heart rate/);
    assert.match(html, /Average heart rate/);
    assert.match(html, /Updated 2:04 PM CT/);
    assert.equal(/bpm|heartRate|resting_heart/i.test(html), false);
    assert.equal(html.includes("154"), false);
    assert.equal(html.includes("176"), false);
    assert.match(html, /Steps/);
    assert.match(html, /<svg/);

    const sharedRuns = render(
      createElement(floor.FitnessFloor, { tab: "runs", steps, runs, analytics, publicMode: true, updatedAt: run.startedAt }),
    );
    assert.match(sharedRuns, /id="runs"/);
    assert.match(sharedRuns, /3\.2 mi/);
    assert.match(sharedRuns, /data-lock-badge/);
    assert.equal(/bpm|heartRate|resting_heart/i.test(sharedRuns), false);
    assert.equal(sharedRuns.includes("154"), false);
    assert.equal(sharedRuns.includes("176"), false);

    const quiet = render(
      createElement(floor.FitnessFloor, {
        steps: buildStepsView({ metrics: [], today: "2026-11-02" }),
        runs: buildRunsView({ workouts: [], today: "2026-11-02" }),
        analytics: buildAnalytics({ metrics: [], workouts: [], today: "2026-11-02" }),
      }),
    );
    assert.match(quiet, new RegExp(EMPTY_CARD_NOTE));
    assert.match(quiet, /data-card="empty"/);
    assert.match(quiet, /data-node-status="not-connected"/);
    assert.equal(quiet.includes("Updated"), false);
    assert.equal(quiet.includes("not recorded"), false);
    assert.equal(quiet.includes("No steps"), false);

    const quietRuns = render(
      createElement(floor.FitnessFloor, {
        tab: "runs",
        steps: buildStepsView({ metrics: [], today: "2026-11-02" }),
        runs: buildRunsView({ workouts: [], today: "2026-11-02" }),
        analytics: buildAnalytics({ metrics: [], workouts: [], today: "2026-11-02" }),
      }),
    );
    assert.match(quietRuns, /id="runs"/);
    assert.match(quietRuns, new RegExp(EMPTY_CARD_NOTE));
    assert.equal(quietRuns.includes("No runs yet"), false);
    assert.equal(quietRuns.includes("not recorded"), false);
  });

  it("boxes a run and locks heart rate without printing it in Public view", () => {
    const owner = buildRunDetail({ workouts: [run], today: "2026-11-02", id: "health-auto-export:layout-run" });
    assert.ok(owner);
    const ownerHtml = render(
      createElement(floor.RunDetailMirror, { detail: owner!, updatedAt: run.startedAt }),
    );
    assert.match(ownerHtml, /href="\/n\/fitness\?tab=runs"/);
    assert.match(ownerHtml, /3\.2 mi/);
    assert.match(ownerHtml, /154 bpm/);
    assert.match(ownerHtml, /Updated 2:04 PM CT/);
    assert.match(ownerHtml, /node-card-equal/);
    assert.match(ownerHtml, new RegExp(EMPTY_CARD_NOTE));

    const shared = buildRunDetail({
      workouts: [run],
      today: "2026-11-02",
      id: "health-auto-export:layout-run",
      publicMode: true,
    });
    assert.ok(shared);
    const html = render(createElement(floor.RunDetailMirror, { detail: shared!, publicMode: true, updatedAt: run.startedAt }));
    assert.match(html, /data-lock-badge/);
    assert.match(html, /node-card node-card-equal/);
    assert.match(html, /3\.2 mi/);
    assert.match(html, /Splits/);
    assert.equal(/bpm|heartRate|resting_heart/i.test(html), false);
    assert.equal(html.includes("154"), false);
    assert.equal(html.includes("176"), false);
  });

  it("replaces an empty detail and an empty child card with the connect box", () => {
    const empty = render(
      createElement(detailUi.FitnessDetail, {
        detail: {
          id: "lifting",
          title: "Lifting",
          headline: null,
          detail: "not recorded",
          rows: [],
          weeks: [],
          months: [],
          pace: [],
        },
      }),
    );
    assert.match(empty, /Lifting/);
    assert.match(empty, new RegExp(EMPTY_CARD_NOTE));
    assert.match(empty, /node-card-equal/);
    assert.match(empty, /href="\/n\/fitness"/);
    assert.equal(empty.includes("Updated"), false);
    assert.equal(empty.includes("not recorded"), false);

    const heart = render(
      createElement(detailUi.FitnessDetail, {
        publicMode: true,
        detail: {
          id: "heart",
          title: "Heart",
          headline: "61",
          detail: "154 bpm",
          rows: [{ id: "d", primary: "154 bpm", secondary: "resting" }],
          weeks: [],
          months: [],
          pace: [],
          heart: [{ id: "d", label: "Nov 2", resting: 61, avg: 154 }],
        },
      }),
    );
    assert.match(heart, /data-lock-badge/);
    assert.match(heart, /node-card-equal/);
    assert.equal(heart.includes("154"), false);
    assert.equal(heart.includes("61"), false);
    assert.equal(/bpm|heartRate/i.test(heart), false);

    const cards = render(
      createElement(grid.FitnessGrid, {
        publicMode: true,
        cards: [
          { id: "heart", title: "Heart", href: "/n/fitness/heart", headline: "61", detail: "154 bpm" },
          { id: "lifting", title: "Lifting", href: "/n/fitness/lifting", headline: null, detail: "not recorded" },
        ],
      }),
    );
    assert.match(cards, /data-lock-badge/);
    assert.match(cards, new RegExp(EMPTY_CARD_NOTE));
    assert.match(cards, /href="\/n\/fitness\/lifting"/);
    assert.equal(cards.includes("154"), false);
    assert.equal(cards.includes("61"), false);
    assert.equal(cards.includes("not recorded"), false);
  });

  it("keeps fitness on its floor while market parents use the shared layout", () => {
    const page = readFileSync(path.join(root, "src/app/n/[parent]/page.tsx"), "utf8");
    const node = readFileSync(path.join(root, "src/app/n/[parent]/[node]/page.tsx"), "utf8");
    assert.match(page, /NodeLayout/);
    assert.match(node, /NodeLayout/);
    assert.match(page, /latestTimestamp/);
    assert.match(node, /latestTimestamp/);
    const fitness = page.slice(page.indexOf('parent.id === "fitness"'), page.indexOf('const childParent'));
    assert.match(fitness, /latestFitnessUpdatedAt/);
    assert.match(fitness, /FitnessFloor/);
    assert.ok(fitness.indexOf('await requireRole("owner")') < fitness.indexOf("loadFitnessBundle"));
    const finance = page.slice(page.indexOf('parent.id === "finance"'), page.indexOf('parent.id === "fitness"'));
    assert.match(finance, /FinanceFloor/);
    assert.equal(finance.includes("FitnessFloor"), false);
  });
});
