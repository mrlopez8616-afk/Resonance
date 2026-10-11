/**
 * Health of the Machine. Percents only. Dollar amounts never enter the result.
 *
 * Overall
 * The overall percent is the arithmetic mean of the sub-scores that have data,
 * rounded to the nearest percent. A sub-score with no data is "not connected"
 * and is left out of the mean. It is never stored as 0.
 * Tone, for a real overall: 80–100 steady, 50–79 watch, 0–49 down.
 * No overall stays watch, and the screen prints "not connected".
 *
 * 1. Allocation balance
 * The nine names are SUI, PWR, VRT, GEV, CEG, NVDA, TSM, TSLA, and SPCX.
 * Target weight is 1/9 each.
 * Actual weight is the public-view share: allocateTenths on the same current
 * values, painted as one-decimal percents that sum to 100.0%. A name with no
 * positive value is 0%. No positive value anywhere means not connected.
 * Let w_i be those shares as fractions, t = 1/9, and
 *   d = (1/2) * Σ |w_i − t|
 *   dMax = 1 − 1/9
 * d is 0 at equal weight and dMax when one name holds the whole book.
 * Score = round(100 * (1 − d / dMax)).
 *
 * 2. Growth
 * A name is up when the public % view shows a since-first-buy gain above zero.
 * Score = round(100 * up / known). Names with no gain line are left out of the
 * denominator and counted in the inputs as not connected. No known gain means
 * the sub-score is not connected. A missing price is not treated as a loss.
 *
 * 3. Feed freshness
 * The Control Room feed board. A feed is fresh only when its freshness is green.
 * Amber and red are not fresh. Score = round(100 * green / checked).
 * Public mode uses the public board, so the Finance feed is left out.
 * No checked feed, or no Control Room, means not connected.
 * A loaded board that is entirely red scores 0.
 *
 * 4. Build progress
 * The Build Tracker overall percent: the average of each item's step share,
 * rounded once. Items with no steps are left out. No items, or no steps,
 * means not connected.
 *
 * 5. Agent activity
 * The Control Room bots roster. A bot is heard when its latest signal is inside
 * the last 48 hours, the same age at which a daily Control Room feed turns red.
 * The exact cutoff still counts. Score = round(100 * heard / roster).
 * Public mode leaves out Finance Desk, matching the bots board.
 * No roster, or no Control Room, means not connected.
 * A loaded roster with no recent signal scores 0.
 */

import { averageStepPercent } from "@/lib/build-tracker";
import {
  ageMs,
  DAILY_FRESHNESS,
  presentControlRoom,
  type ControlRoom,
} from "@/lib/control-room";
import { PUBLIC_BOOK, type PublicFloorModel } from "@/lib/public-mode";

/** Same horizon the Control Room uses before a daily feed turns red. */
export const AGENT_ACTIVITY_WINDOW_MS = DAILY_FRESHNESS.redMs;

export const MACHINE_SCORE_COUNT = 5;

export type MachineScoreId = "allocation" | "growth" | "feeds" | "build" | "agents";

export type MachineScore = {
  id: MachineScoreId;
  label: string;
  /** Short name for the wall and the home card. */
  short: string;
  detail: string;
  /** Counts or percents. "not connected" when this score has no data. */
  inputs: string;
  /** Null means not connected. */
  percent: number | null;
};

export type MachineTone = "steady" | "watch" | "down";

export type MachineHealthReport = {
  /** Null when every sub-score is not connected. */
  percent: number | null;
  /** How many sub-scores entered the average. */
  ready: number;
  tone: MachineTone;
  scores: readonly MachineScore[];
};

export type MachineHealthInput = {
  floor: PublicFloorModel | null;
  buildItems: readonly { steps: readonly { done: boolean }[] }[] | null;
  control: ControlRoom | null;
  publicMode: boolean;
  now: Date;
};

const NOT_CONNECTED = "not connected";

const AGENT_HOURS = AGENT_ACTIVITY_WINDOW_MS / (60 * 60 * 1000);

type ScoreCopy = {
  id: MachineScoreId;
  label: string;
  short: string;
  detail: string;
};

const COPY: readonly ScoreCopy[] = [
  {
    id: "allocation",
    label: "Allocation",
    short: "Balance",
    detail: "100% minus the normalized gap from an equal one-ninth weight.",
  },
  {
    id: "growth",
    label: "Growth",
    short: "Growth",
    detail: "Names up since the first buy, out of the names with a gain.",
  },
  {
    id: "feeds",
    label: "Feeds",
    short: "Feeds",
    detail: "Control Room feeds that are still green, out of the feeds checked.",
  },
  {
    id: "build",
    label: "Build",
    short: "Build",
    detail: "Build Tracker overall percent.",
  },
  {
    id: "agents",
    label: "Agents",
    short: "Agents",
    detail: `Bots with a signal in the last ${AGENT_HOURS} hours, out of the roster.`,
  },
];

function roundPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function machineTone(percent: number | null): MachineTone {
  if (percent === null) return "watch";
  if (percent >= 80) return "steady";
  if (percent >= 50) return "watch";
  return "down";
}

function scoreOf(copy: ScoreCopy, percent: number | null, inputs: string): MachineScore {
  return {
    id: copy.id,
    label: copy.label,
    short: copy.short,
    detail: copy.detail,
    inputs: percent === null ? NOT_CONNECTED : inputs,
    percent,
  };
}

function copyFor(id: MachineScoreId): ScoreCopy {
  const found = COPY.find((row) => row.id === id);
  if (!found) throw new Error(`Missing machine score copy for ${id}.`);
  return found;
}

function tenthsFromLabel(label: string): number | null {
  const match = /^(\d+\.\d)%$/.exec(label.trim());
  if (!match) return null;
  const tenths = Math.round(Number(match[1]) * 10);
  if (!Number.isFinite(tenths) || tenths < 0) return null;
  return tenths;
}

function gainFromLabel(label: string): number | null {
  const match = /^([+-]?\d+\.\d)%$/.exec(label.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * 100 at equal weight, 0 when one of the nine holds the whole book.
 * `weights` are fractions in PUBLIC_BOOK order. An empty book returns null.
 */
export function allocationBalancePercent(weights: readonly number[]): number | null {
  if (weights.length !== PUBLIC_BOOK.length) return null;
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) return null;
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (!(sum > 0)) return null;
  const target = 1 / PUBLIC_BOOK.length;
  const halfL1 = 0.5 * weights.reduce((total, weight) => total + Math.abs(weight - target), 0);
  const max = 1 - target;
  return roundPercent(100 * (1 - halfL1 / max));
}

function allocationScore(floor: PublicFloorModel | null): MachineScore {
  const copy = copyFor("allocation");
  const holdings = floor ? [...floor.crypto.holdings, ...floor.aiStocks.holdings] : [];
  if (!floor || holdings.length === 0) return scoreOf(copy, null, NOT_CONNECTED);
  const byTicker = new Map(holdings.map((holding) => [holding.ticker, holding]));
  const weights: number[] = [];
  const labels: string[] = [];
  for (const row of PUBLIC_BOOK) {
    const holding = byTicker.get(row.ticker);
    if (!holding) {
      weights.push(0);
      labels.push(`${row.ticker} 0.0%`);
      continue;
    }
    const tenths = tenthsFromLabel(holding.weightLabel);
    if (tenths === null) return scoreOf(copy, null, NOT_CONNECTED);
    weights.push(tenths / 1000);
    labels.push(`${row.ticker} ${holding.weightLabel}`);
  }
  const percent = allocationBalancePercent(weights);
  return scoreOf(copy, percent, labels.join(" · "));
}

function growthScore(floor: PublicFloorModel | null): MachineScore {
  const copy = copyFor("growth");
  if (!floor) return scoreOf(copy, null, NOT_CONNECTED);
  const byTicker = new Map(
    [...floor.crypto.holdings, ...floor.aiStocks.holdings].map((holding) => [holding.ticker, holding]),
  );
  let known = 0;
  let up = 0;
  for (const row of PUBLIC_BOOK) {
    const label = byTicker.get(row.ticker)?.gainLabel ?? null;
    if (!label) continue;
    const gain = gainFromLabel(label);
    if (gain === null) continue;
    known += 1;
    if (gain > 0) up += 1;
  }
  if (known === 0) return scoreOf(copy, null, NOT_CONNECTED);
  const percent = roundPercent((100 * up) / known);
  const missing = PUBLIC_BOOK.length - known;
  const inputs = missing > 0 ? `${up} of ${known} up · ${missing} not connected` : `${up} of ${known} up`;
  return scoreOf(copy, percent, inputs);
}

function feedScore(control: ControlRoom | null, publicMode: boolean): MachineScore {
  const copy = copyFor("feeds");
  if (!control) return scoreOf(copy, null, NOT_CONNECTED);
  const feeds = presentControlRoom(control, publicMode).feeds;
  if (feeds.length === 0) return scoreOf(copy, null, NOT_CONNECTED);
  const fresh = feeds.filter((feed) => feed.freshness === "green").length;
  return scoreOf(copy, roundPercent((100 * fresh) / feeds.length), `${fresh} of ${feeds.length} fresh`);
}

function buildScore(items: MachineHealthInput["buildItems"]): MachineScore {
  const copy = copyFor("build");
  if (!items) return scoreOf(copy, null, NOT_CONNECTED);
  const percent = averageStepPercent(items);
  if (percent === null) return scoreOf(copy, null, NOT_CONNECTED);
  const counted = items.filter((item) => item.steps.length > 0).length;
  return scoreOf(copy, percent, `${counted} items`);
}

function agentHeard(at: string | null, now: Date): boolean {
  const age = ageMs(at, now);
  return age !== null && age <= AGENT_ACTIVITY_WINDOW_MS;
}

function agentScore(control: ControlRoom | null, publicMode: boolean, now: Date): MachineScore {
  const copy = copyFor("agents");
  if (!control) return scoreOf(copy, null, NOT_CONNECTED);
  const agents = presentControlRoom(control, publicMode).agents;
  if (agents.length === 0) return scoreOf(copy, null, NOT_CONNECTED);
  const heard = agents.filter((agent) => agentHeard(agent.at, now)).length;
  return scoreOf(copy, roundPercent((100 * heard) / agents.length), `${heard} of ${agents.length} heard`);
}

export function scoreMachineHealth(input: MachineHealthInput): MachineHealthReport {
  const scores = [
    allocationScore(input.floor),
    growthScore(input.floor),
    feedScore(input.control, input.publicMode),
    buildScore(input.buildItems),
    agentScore(input.control, input.publicMode, input.now),
  ];
  const readyScores = scores.filter((score) => score.percent !== null);
  const percent =
    readyScores.length === 0
      ? null
      : roundPercent(readyScores.reduce((total, score) => total + (score.percent ?? 0), 0) / readyScores.length);
  return {
    percent,
    ready: readyScores.length,
    tone: machineTone(percent),
    scores,
  };
}

/** Up to three home-card lines. Percents and the words "not connected" only. */
export function healthHomeLines(report: MachineHealthReport): string[] {
  const bits = report.scores.map((score) => {
    const value = score.percent === null ? NOT_CONNECTED : `${score.percent}%`;
    return `${score.short} ${value}`;
  });
  return [`${bits[0]} · ${bits[1]}`, `${bits[2]} · ${bits[3]}`, bits[4] ?? ""].filter((line) => line.length > 0);
}

export type MachineSlotPayload = {
  score: number | null;
  label: string;
  tone: MachineTone;
  parts: { label: string; score: number | null }[];
};

/** The /tv slot contract: overall percent, tone, and one part per sub-score. */
export function machineSlotPayload(report: MachineHealthReport): MachineSlotPayload {
  return {
    score: report.percent,
    label: report.percent === null ? NOT_CONNECTED : `${report.ready} of ${MACHINE_SCORE_COUNT}`,
    tone: report.tone,
    parts: report.scores.map((score) => ({
      label: score.short,
      score: score.percent,
    })),
  };
}
