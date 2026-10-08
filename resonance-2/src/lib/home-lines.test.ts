import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "@/data/calendar";
import { fitnessWeekFacts, metricSamples, workoutSamples } from "@/lib/fitness-board";
import { manualFitnessSeed } from "@/lib/fitness-seed";
import { formatSpotPrice } from "@/lib/live-face";
import type { FitnessMetricWrite } from "@/lib/fitness-types";
import {
  FINANCE_HOME_HINT,
  HOME_QUOTE_MAX_AGE_MS,
  XRP_DAILY_CLOSE_USD,
  aiStockSecondaryLines,
  cryptoSecondaryLines,
  financeSecondaryLines,
  fitnessSecondaryLines,
  formatHomePct,
  homeQuoteFresh,
  nextAiCatalystLine,
  predictionsHeadline,
  predictionsSecondaryLines,
  topMoverLine,
  visibleHomeMoves,
  type HomeMove,
  type HomeQuote,
} from "./home-lines";

const NOW = new Date("2026-10-08T15:00:00.000Z");

function quote(partial: Partial<HomeQuote> = {}): HomeQuote {
  return {
    usd: 1.4,
    change24hPct: 1.24,
    fetchedAt: new Date(NOW.getTime() - 30_000).toISOString(),
    ...partial,
  };
}

function move(partial: Partial<HomeMove> & Pick<HomeMove, "ticker" | "changePct">): HomeMove {
  return {
    id: partial.ticker.toLowerCase(),
    fetchedAt: new Date(NOW.getTime() - 30_000).toISOString(),
    ...partial,
  };
}

function catalyst(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "start" | "title">): CalendarEvent {
  return {
    kind: "catalyst",
    node: "VRT",
    status: "confirmed",
    writer: "agent",
    ...partial,
  };
}

function metric(name: string, day: string, qty: number, units: string): FitnessMetricWrite {
  return {
    source: "test",
    externalId: `${name}:${day}`,
    metric: name,
    day,
    recordedAt: null,
    qty: String(qty),
    units,
    qtyMin: null,
    qtyMax: null,
    origin: "health-auto-export",
    payload: {},
  };
}

describe("home quote freshness", () => {
  it("accepts a quote inside the window and rejects a missing, future, or old one", () => {
    assert.equal(homeQuoteFresh(quote().fetchedAt, NOW), true);
    assert.equal(homeQuoteFresh(new Date(NOW.getTime() - HOME_QUOTE_MAX_AGE_MS).toISOString(), NOW), true);
    assert.equal(homeQuoteFresh(new Date(NOW.getTime() - HOME_QUOTE_MAX_AGE_MS - 1).toISOString(), NOW), false);
    assert.equal(homeQuoteFresh(new Date(NOW.getTime() + 120_000).toISOString(), NOW), false);
    assert.equal(homeQuoteFresh(null, NOW), false);
    assert.equal(homeQuoteFresh("not-a-date", NOW), false);
  });
});

describe("crypto home lines", () => {
  it("prints the live XRP price, 24h change, and progress to the $1.55 close", () => {
    const lines = cryptoSecondaryLines(quote({ usd: 1.4, change24hPct: 1.26 }), NOW);
    assert.deepEqual(lines, [
      `XRP ${formatSpotPrice(1.4)}, +1.3% 24h`,
      "$1.55 close: 90.3% there",
    ]);
    assert.equal(XRP_DAILY_CLOSE_USD, 1.55);
    assert.ok(lines.every((line) => !line.includes("$0.00") && !line.includes("NaN") && !line.includes("undefined")));
  });

  it("hides the price line when the 24h change is missing and keeps the close line", () => {
    assert.deepEqual(cryptoSecondaryLines(quote({ change24hPct: null }), NOW), ["$1.55 close: 90.3% there"]);
    assert.deepEqual(cryptoSecondaryLines(quote({ change24hPct: Number.NaN }), NOW), ["$1.55 close: 90.3% there"]);
  });

  it("hides both lines when the price is missing, not positive, or the quote is stale", () => {
    assert.deepEqual(cryptoSecondaryLines(null, NOW), []);
    assert.deepEqual(cryptoSecondaryLines(quote({ usd: null }), NOW), []);
    assert.deepEqual(cryptoSecondaryLines(quote({ usd: 0 }), NOW), []);
    assert.deepEqual(cryptoSecondaryLines(quote({ usd: Number.NaN }), NOW), []);
    assert.deepEqual(
      cryptoSecondaryLines(quote({ fetchedAt: new Date(NOW.getTime() - HOME_QUOTE_MAX_AGE_MS - 5).toISOString() }), NOW),
      [],
    );
    assert.deepEqual(cryptoSecondaryLines(quote({ fetchedAt: null }), NOW), []);
  });

  it("prints a real zero change and a close that is already there without $0.00", () => {
    const flat = cryptoSecondaryLines(quote({ usd: 1.55, change24hPct: 0 }), NOW);
    assert.equal(flat[0], `XRP ${formatSpotPrice(1.55)}, 0.0% 24h`);
    assert.equal(flat[1], "$1.55 close: 100.0% there");
    assert.equal(formatHomePct(-2.04), "-2.0%");
    const down = cryptoSecondaryLines(quote({ change24hPct: -2.04 }), NOW);
    assert.match(down[0] ?? "", /^-|,-2\.0% 24h|\-2\.0% 24h/);
    assert.equal(down[0], `XRP ${formatSpotPrice(1.4)}, -2.0% 24h`);
  });
});

describe("AI stock home lines", () => {
  it("picks the largest absolute mover and the next earnings date", () => {
    const lines = aiStockSecondaryLines({
      moves: [
        move({ ticker: "VRT", changePct: 1.2 }),
        move({ ticker: "ETN", changePct: -3.41 }),
        move({ ticker: "PWR", changePct: null }),
        move({ ticker: "GEV", changePct: Number.NaN }),
      ],
      events: [
        catalyst({ id: "old", start: "2026-10-01T00:00:00-05:00", title: "Vertiv old earnings", node: "VRT" }),
        catalyst({
          id: "vrt",
          start: "2026-10-21T00:00:00-05:00",
          title: "Vertiv Q3 2026 earnings (before market open)",
          node: "VRT",
          allDay: true,
        }),
        catalyst({
          id: "pwr",
          start: "2026-10-29T00:00:00-05:00",
          title: "Quanta Services Q3 2026 earnings",
          node: "PWR",
        }),
        catalyst({ id: "xrp", start: "2026-10-11T00:00:00-05:00", title: "XRP event", node: "XRP" }),
        catalyst({ id: "flr", start: "2026-10-09T00:00:00-05:00", title: "Flare night", node: "FLR" }),
      ],
      now: NOW,
    });
    assert.deepEqual(lines, ["ETN -3.4%", "VRT earnings · 21 Oct"]);
  });

  it("breaks a tie toward the higher signed change, then the ticker", () => {
    assert.equal(
      topMoverLine(
        [
          move({ ticker: "HUBB", changePct: -2 }),
          move({ ticker: "CEG", changePct: 2 }),
        ],
        NOW,
      ),
      "CEG +2.0%",
    );
    assert.equal(
      topMoverLine(
        [
          move({ ticker: "VRT", changePct: 1.5 }),
          move({ ticker: "ETN", changePct: 1.5 }),
        ],
        NOW,
      ),
      "ETN +1.5%",
    );
  });

  it("hides a stale mover and a missing catalyst", () => {
    const lines = aiStockSecondaryLines({
      moves: [
        move({
          ticker: "ETN",
          changePct: -9,
          fetchedAt: new Date(NOW.getTime() - HOME_QUOTE_MAX_AGE_MS - 10).toISOString(),
        }),
        move({ ticker: "VRT", changePct: 0.4 }),
      ],
      events: [],
      now: NOW,
    });
    assert.deepEqual(lines, ["VRT +0.4%"]);
    assert.equal(nextAiCatalystLine([], NOW), null);
    assert.deepEqual(aiStockSecondaryLines({ moves: [move({ ticker: "PWR", changePct: null })], now: NOW }), []);
  });

  it("skips hidden nodes before choosing the mover and names a month-only catalyst as a month", () => {
    const moves = [
      move({ ticker: "ETN", changePct: -4 }),
      move({ ticker: "VRT", changePct: 1 }),
    ];
    const visible = visibleHomeMoves(moves, ["etn"]);
    assert.deepEqual(
      visible.map((item) => item.ticker),
      ["VRT"],
    );
    const lines = aiStockSecondaryLines({
      moves: visible,
      events: [
        catalyst({
          id: "gev-month",
          start: "2026-12-01T00:00:00-06:00",
          title: "GE Vernova annual Investor Update",
          node: "GEV",
          datePrecision: "month",
          allDay: true,
        }),
      ],
      now: NOW,
    });
    assert.deepEqual(lines, ["VRT +1.0%", "GEV · December 2026"]);
  });

  it("uses a precomputed catalyst line and does not invent one", () => {
    assert.deepEqual(
      aiStockSecondaryLines({
        moves: [],
        catalystLine: "VRT earnings · 21 Oct",
        now: NOW,
      }),
      ["VRT earnings · 21 Oct"],
    );
    assert.deepEqual(
      aiStockSecondaryLines({
        moves: [move({ ticker: "VRT", changePct: 1 })],
        catalystLine: null,
        events: [catalyst({ id: "vrt", start: "2026-10-21T00:00:00-05:00", title: "Vertiv earnings", node: "VRT" })],
        now: NOW,
      }),
      ["VRT +1.0%"],
    );
  });
});

describe("fitness home lines", () => {
  it("sums steps, active calories, and resting HR for this week", () => {
    const metrics = metricSamples([
      metric("step_count", "2026-10-05", 1000, "count"),
      metric("step_count", "2026-10-08", 500, "count"),
      metric("step_count", "2026-09-30", 9000, "count"),
      metric("active_energy", "2026-10-05", 200, "kcal"),
      metric("active_energy", "2026-10-08", 20, "kcal"),
      metric("resting_heart_rate", "2026-10-06", 60, "count"),
      metric("resting_heart_rate", "2026-10-08", 62, "count"),
    ]);
    const week = fitnessWeekFacts(metrics, [], "2026-10-08");
    assert.deepEqual(week, { steps: 1500, activeKcal: 220, restingHr: 61, miles: null });
    assert.deepEqual(fitnessSecondaryLines(week, null), [
      "1,500 steps this week",
      "220 kcal this week",
      "61 bpm resting",
    ]);
  });

  it("hides an empty series and falls back to miles only when all three are missing", () => {
    assert.deepEqual(
      fitnessSecondaryLines({ steps: 21608, activeKcal: null, restingHr: null, miles: 3.9 }, null),
      ["21,608 steps this week"],
    );
    assert.deepEqual(
      fitnessSecondaryLines({ steps: null, activeKcal: null, restingHr: null, miles: 4 }, { value: "12,000", unit: "steps" }),
      ["4.0 mi this week"],
    );
    assert.deepEqual(
      fitnessSecondaryLines(
        { steps: null, activeKcal: null, restingHr: null, miles: 3.9 },
        { value: "3.9", unit: "mi this week" },
      ),
      [],
    );
    assert.deepEqual(fitnessSecondaryLines({ steps: null, activeKcal: null, restingHr: null, miles: null }, null), []);
    assert.deepEqual(fitnessSecondaryLines(null, null), []);
    assert.deepEqual(
      fitnessSecondaryLines({ steps: null, activeKcal: null, restingHr: Number.NaN, miles: Number.NaN }, null),
      [],
    );
  });

  it("reads the manual week as steps, with no active calories or resting HR to invent", () => {
    const seed = manualFitnessSeed();
    const week = fitnessWeekFacts(metricSamples(seed.metrics), workoutSamples(seed.workouts), "2026-10-08");
    assert.equal(week.steps, 21608);
    assert.equal(week.activeKcal, null);
    assert.equal(week.restingHr, null);
    assert.equal(week.miles, 3.9);
    assert.deepEqual(
      fitnessSecondaryLines(week, { value: "3.9", unit: "mi this week" }),
      ["21,608 steps this week"],
    );
  });
});

describe("finance and predictions home lines", () => {
  it("keeps the finance hint and no dollar figure", () => {
    const lines = financeSecondaryLines();
    assert.deepEqual(lines, [FINANCE_HOME_HINT]);
    assert.equal(lines.some((line) => /\$\d|NaN|undefined/.test(line)), false);
  });

  it("prints at risk, open count, and record, and hides a zero dollar amount", () => {
    assert.deepEqual(
      predictionsSecondaryLines({
        atRisk: "12.50",
        atRiskLabel: "$12.50",
        open: 3,
        recordLabel: "2-1 · 0 sold · 0 void",
      }),
      ["$12.50 at risk", "3 open", "2-1 · 0 sold · 0 void"],
    );
    assert.deepEqual(
      predictionsSecondaryLines({
        atRisk: "0.00",
        atRiskLabel: "$0.00",
        open: 1,
        recordLabel: "0-0 · 0 sold · 0 void",
      }),
      ["1 open", "0-0 · 0 sold · 0 void"],
    );
    assert.deepEqual(predictionsSecondaryLines(null), []);
    assert.equal(predictionsHeadline("$17.06"), "$17.06");
    assert.equal(predictionsHeadline("$0.00"), null);
    assert.equal(predictionsHeadline("NaN"), null);
    assert.equal(predictionsHeadline(undefined), null);
  });
});
