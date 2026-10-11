import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  scoreAgents,
  scoreApprovals,
  scoreFeeds,
  CONTROL_FEEDS,
  type ControlFeedId,
  type ControlRoom,
} from "@/lib/control-room";
import {
  AGENT_ACTIVITY_WINDOW_MS,
  allocationBalancePercent,
  healthHomeLines,
  machineSlotPayload,
  machineTone,
  scoreMachineHealth,
  type MachineHealthReport,
} from "@/lib/machine-health";
import { PUBLIC_BOOK, toPublicFloor, type PublicHoldingInput } from "@/lib/public-mode";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = new Date("2026-10-11T18:00:00.000Z");

function holding(
  ticker: string,
  value: number | null,
  firstBuyPrice: number | null = 10,
  livePrice: number | null = 12,
): PublicHoldingInput {
  return { ticker, value, firstBuyPrice, livePrice, daily: [] };
}

function book(rows: readonly PublicHoldingInput[]) {
  return toPublicFloor(rows);
}

function checkedFeeds(
  fresh: readonly ControlFeedId[],
): { stamps: Partial<Record<ControlFeedId, string | null>>; checked: Partial<Record<ControlFeedId, boolean>> } {
  const stamps: Partial<Record<ControlFeedId, string | null>> = {};
  const checked: Partial<Record<ControlFeedId, boolean>> = {};
  for (const feed of CONTROL_FEEDS) {
    checked[feed.id] = true;
    stamps[feed.id] = fresh.includes(feed.id) ? "2026-10-11T17:59:00.000Z" : null;
  }
  return { stamps, checked };
}

function room(fresh: readonly ControlFeedId[], signals: { source: string; at: string }[] = []): ControlRoom {
  const feeds = checkedFeeds(fresh);
  return {
    approvals: scoreApprovals([], NOW),
    agents: scoreAgents(signals),
    feeds: scoreFeeds(feeds.stamps, feeds.checked, NOW),
  };
}

function textOf(report: MachineHealthReport): string {
  return [
    report.percent === null ? "not connected" : `${report.percent}%`,
    report.tone,
    ...report.scores.flatMap((score) => [score.label, score.short, score.detail, score.inputs]),
    ...healthHomeLines(report),
    JSON.stringify(machineSlotPayload(report)),
  ].join("\n");
}

describe("allocation balance", () => {
  it("scores equal weight at 100 and a single name at 0", () => {
    assert.equal(allocationBalancePercent(Array.from({ length: 9 }, () => 1 / 9)), 100);
    assert.equal(allocationBalancePercent([1, 0, 0, 0, 0, 0, 0, 0, 0]), 0);
    assert.equal(allocationBalancePercent(Array.from({ length: 9 }, () => 0)), null);
    assert.equal(allocationBalancePercent([1, 0]), null);
  });

  it("uses the public-view weights and the normalized half-L1 gap", () => {
    const values = [100, 80, 70, 60, 50, 40, 30, 20, 10];
    const floor = book(PUBLIC_BOOK.map((row, index) => holding(row.ticker, values[index] ?? 0)));
    const report = scoreMachineHealth({
      floor,
      buildItems: null,
      control: null,
      publicMode: false,
      now: NOW,
    });
    const byTicker = new Map(
      [...floor.crypto.holdings, ...floor.aiStocks.holdings].map((row) => [row.ticker, row.weightLabel]),
    );
    const weights = PUBLIC_BOOK.map((row) => Number(byTicker.get(row.ticker)?.replace("%", "")) / 100);
    const target = 1 / 9;
    const halfL1 = 0.5 * weights.reduce((total, weight) => total + Math.abs(weight - target), 0);
    const expected = Math.round(100 * (1 - halfL1 / (1 - target)));
    const allocation = report.scores.find((score) => score.id === "allocation");
    assert.equal(allocation?.percent, expected);
    assert.match(allocation?.inputs ?? "", /SUI \d+\.\d%/);
    assert.equal(allocation?.inputs.includes("$"), false);
    assert.equal(weights.reduce((total, weight) => total + Math.round(weight * 1000), 0), 1000);
  });

  it("scores a one-name book at 0 and leaves an empty book unconnected", () => {
    const onlySui = scoreMachineHealth({
      floor: book([holding("SUI", 100), ...PUBLIC_BOOK.slice(1).map((row) => holding(row.ticker, null))]),
      buildItems: null,
      control: null,
      publicMode: true,
      now: NOW,
    });
    assert.equal(onlySui.scores.find((score) => score.id === "allocation")?.percent, 0);
    assert.match(onlySui.scores.find((score) => score.id === "allocation")?.inputs ?? "", /SUI 100\.0%/);
    const empty = scoreMachineHealth({
      floor: book(PUBLIC_BOOK.map((row) => holding(row.ticker, null))),
      buildItems: null,
      control: null,
      publicMode: false,
      now: NOW,
    });
    assert.equal(empty.scores.find((score) => score.id === "allocation")?.percent, null);
    assert.equal(empty.scores.find((score) => score.id === "allocation")?.inputs, "not connected");
  });
});

describe("growth", () => {
  it("counts names with a positive since-first-buy gain and leaves the rest out", () => {
    const rows = PUBLIC_BOOK.map((row, index) => {
      if (index < 6) return holding(row.ticker, 10, 10, 12);
      if (index < 8) return holding(row.ticker, 10, 12, 10);
      return holding(row.ticker, 10, null, 12);
    });
    const growth = scoreMachineHealth({
      floor: book(rows),
      buildItems: null,
      control: null,
      publicMode: false,
      now: NOW,
    }).scores.find((score) => score.id === "growth");
    assert.equal(growth?.percent, Math.round((100 * 6) / 8));
    assert.equal(growth?.inputs, "6 of 8 up · 1 not connected");
  });

  it("is not connected when no name has a gain line", () => {
    const growth = scoreMachineHealth({
      floor: book(PUBLIC_BOOK.map((row) => holding(row.ticker, 10, null, null))),
      buildItems: null,
      control: null,
      publicMode: false,
      now: NOW,
    }).scores.find((score) => score.id === "growth");
    assert.equal(growth?.percent, null);
    assert.equal(growth?.inputs, "not connected");
  });
});

describe("feeds, build, and agents", () => {
  it("scores green feeds only and drops Finance on the public board", () => {
    const control = room(["coingecko", "yahoo", "health"]);
    const privateScore = scoreMachineHealth({
      floor: null,
      buildItems: null,
      control,
      publicMode: false,
      now: NOW,
    }).scores.find((score) => score.id === "feeds");
    const publicScore = scoreMachineHealth({
      floor: null,
      buildItems: null,
      control,
      publicMode: true,
      now: NOW,
    }).scores.find((score) => score.id === "feeds");
    assert.equal(privateScore?.percent, Math.round((100 * 3) / 9));
    assert.equal(privateScore?.inputs, "3 of 9 fresh");
    assert.equal(publicScore?.percent, Math.round((100 * 3) / 8));
    assert.equal(publicScore?.inputs, "3 of 8 fresh");
  });

  it("scores a fully red board at 0 and an unchecked board as not connected", () => {
    const red = scoreMachineHealth({
      floor: null,
      buildItems: null,
      control: room([]),
      publicMode: false,
      now: NOW,
    }).scores.find((score) => score.id === "feeds");
    assert.equal(red?.percent, 0);
    assert.equal(red?.inputs, "0 of 9 fresh");
    const unchecked = scoreFeeds({}, {}, NOW);
    const quiet = scoreMachineHealth({
      floor: null,
      buildItems: null,
      control: {
        approvals: scoreApprovals([], NOW),
        agents: scoreAgents([]),
        feeds: unchecked,
      },
      publicMode: false,
      now: NOW,
    }).scores.find((score) => score.id === "feeds");
    assert.equal(quiet?.percent, null);
    assert.equal(quiet?.inputs, "not connected");
  });

  it("uses the Build Tracker overall percent", () => {
    const buildItems = [
      { title: "Wire $40", steps: [{ done: true }, { done: false }] },
      { title: "Ship", steps: [{ done: true }, { done: true }] },
      { title: "Empty", steps: [] },
    ];
    const build = scoreMachineHealth({
      floor: null,
      buildItems,
      control: null,
      publicMode: false,
      now: NOW,
    }).scores.find((score) => score.id === "build");
    assert.equal(build?.percent, 75);
    assert.equal(build?.inputs, "2 items");
    assert.equal(build?.inputs.includes("$"), false);
    const missing = scoreMachineHealth({
      floor: null,
      buildItems: [],
      control: null,
      publicMode: false,
      now: NOW,
    }).scores.find((score) => score.id === "build");
    assert.equal(missing?.percent, null);
  });

  it("counts bots heard inside 48 hours and keeps the exact cutoff", () => {
    const recent = scoreMachineHealth({
      floor: null,
      buildItems: null,
      control: room([], [{ source: "fills:robinhood", at: "2026-10-11T17:00:00.000Z" }]),
      publicMode: false,
      now: NOW,
    }).scores.find((score) => score.id === "agents");
    assert.equal(recent?.percent, Math.round(100 / 9));
    assert.equal(recent?.inputs, "1 of 9 heard");
    const publicAgents = scoreMachineHealth({
      floor: null,
      buildItems: null,
      control: room([], [{ source: "fills:robinhood", at: "2026-10-11T17:00:00.000Z" }]),
      publicMode: true,
      now: NOW,
    }).scores.find((score) => score.id === "agents");
    assert.equal(publicAgents?.percent, Math.round(100 / 8));
    assert.equal(publicAgents?.inputs, "1 of 8 heard");

    const edge = new Date("2026-10-09T18:00:00.000Z");
    const onCutoff = new Date(edge.getTime() + AGENT_ACTIVITY_WINDOW_MS);
    const pastCutoff = new Date(edge.getTime() + AGENT_ACTIVITY_WINDOW_MS + 1);
    const heard = (now: Date) =>
      scoreMachineHealth({
        floor: null,
        buildItems: null,
        control: {
          approvals: scoreApprovals([], now),
          agents: scoreAgents([{ source: "build_items", at: edge.toISOString() }]),
          feeds: scoreFeeds({}, {}, now),
        },
        publicMode: false,
        now,
      }).scores.find((score) => score.id === "agents")?.percent;
    assert.equal(heard(onCutoff), Math.round(100 / 9));
    assert.equal(heard(pastCutoff), 0);
  });

  it("scores a quiet roster at 0", () => {
    const agents = scoreMachineHealth({
      floor: null,
      buildItems: null,
      control: room([]),
      publicMode: false,
      now: NOW,
    }).scores.find((score) => score.id === "agents");
    assert.equal(agents?.percent, 0);
    assert.equal(agents?.inputs, "0 of 9 heard");
  });
});

describe("overall", () => {
  it("averages only the sub-scores that have data", () => {
    const floor = book(PUBLIC_BOOK.map((row) => holding(row.ticker, 100)));
    const report = scoreMachineHealth({
      floor,
      buildItems: [{ steps: [{ done: true }, { done: true }] }],
      control: null,
      publicMode: false,
      now: NOW,
    });
    assert.equal(report.scores.find((score) => score.id === "allocation")?.percent, 100);
    assert.equal(report.scores.find((score) => score.id === "growth")?.percent, 100);
    assert.equal(report.scores.find((score) => score.id === "feeds")?.percent, null);
    assert.equal(report.scores.find((score) => score.id === "build")?.percent, 100);
    assert.equal(report.scores.find((score) => score.id === "agents")?.percent, null);
    assert.equal(report.ready, 3);
    assert.equal(report.percent, 100);
    assert.equal(report.tone, "steady");
  });

  it("leaves a report with no data unconnected and never prints a dollar", () => {
    const report = scoreMachineHealth({
      floor: null,
      buildItems: null,
      control: null,
      publicMode: true,
      now: NOW,
    });
    assert.equal(report.percent, null);
    assert.equal(report.ready, 0);
    assert.equal(report.tone, "watch");
    assert.equal(report.scores.length, 5);
    assert.equal(report.scores.every((score) => score.percent === null), true);
    assert.equal(report.scores.every((score) => score.inputs === "not connected"), true);
    const poisonedItems = [{ title: "Wire $40 USD", steps: [{ done: true }, { done: false }] }];
    const poisoned = scoreMachineHealth({
      floor: book([
        holding("SUI", 12345.67, 0.5, 2),
        holding("XRP", 9999, 1, 3),
        ...PUBLIC_BOOK.slice(1).map((row) => holding(row.ticker, 10)),
      ]),
      buildItems: poisonedItems,
      control: room(["coingecko"]),
      publicMode: false,
      now: NOW,
    });
    const blob = textOf(poisoned);
    assert.equal(blob.includes("$"), false);
    assert.equal(/\bUSD\b/.test(blob), false);
    assert.equal(blob.includes("12345.67"), false);
    assert.equal(blob.includes("Wire"), false);
    assert.equal(blob.includes("XRP"), false);
    assert.equal(healthHomeLines(poisoned).length, 3);
    assert.equal(machineSlotPayload(poisoned).parts.length, 5);
    assert.equal(machineTone(80), "steady");
    assert.equal(machineTone(79), "watch");
    assert.equal(machineTone(50), "watch");
    assert.equal(machineTone(49), "down");
    assert.equal(machineTone(null), "watch");
  });
});

describe("health page auth", () => {
  it("requires the owner before the score loads", () => {
    const source = readFileSync(join(root, "src/app/n/health/page.tsx"), "utf8");
    assert.match(source, /requireRole\("owner"\)/);
    assert.ok(source.indexOf('await requireRole("owner")') < source.indexOf("await loadMachineHealth"));
  });
});
