import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BANKROLL_FIRST_EVENT } from "@/lib/bankroll";
import { metricSamples } from "@/lib/fitness-board";
import { fitnessWeekStepDays } from "@/lib/fitness-board";
import { manualFitnessSeed } from "@/lib/fitness-seed";
import {
  HOME_QUOTE_MAX_AGE_MS,
  aiChangeBars,
  changeBarClass,
  cryptoChangeBars,
  type HomeMove,
} from "@/lib/home-lines";
import {
  fitnessStepBars,
  inScopeBankrollPoints,
  predictionsTierBar,
  xrpPricesFromMarketChart,
  xrpSparkline,
} from "@/lib/home-visuals";
import type { Bet } from "@/lib/bets";

const NOW = new Date("2026-10-08T15:00:00.000Z");

function move(ticker: string, changePct: number | null, ageMs = 0): HomeMove {
  return {
    id: ticker.toLowerCase(),
    ticker,
    changePct,
    fetchedAt: new Date(NOW.getTime() - ageMs).toISOString(),
  };
}

function allen(overrides: Partial<Bet> & Pick<Bet, "id" | "stake" | "status">): Bet {
  return {
    id: overrides.id,
    event: BANKROLL_FIRST_EVENT.title,
    fight: "Brendan Allen vs Christian Leroy Duncan",
    fightSlug: "brendan-allen-vs-christian-leroy-duncan",
    pick: "Allen",
    stake: overrides.stake,
    oddsPct: 50,
    payout: overrides.payout ?? "2.00",
    status: overrides.status,
    venue: "coinbase-predict",
    ticker: "UFC",
    time: overrides.time ?? "2026-10-07T12:18:00-05:00",
    ...(overrides.realizedPnl ? { realizedPnl: overrides.realizedPnl } : {}),
    ...(overrides.settledAt ? { settledAt: overrides.settledAt } : {}),
    ...(overrides.settledPayout ? { settledPayout: overrides.settledPayout } : {}),
  };
}

describe("home visuals", () => {
  it("builds an XRP spark from a market chart and hides a short or empty series", () => {
    assert.deepEqual(xrpPricesFromMarketChart(null), []);
    assert.deepEqual(xrpPricesFromMarketChart({ prices: "nope" }), []);
    assert.deepEqual(
      xrpPricesFromMarketChart({
        prices: [
          [200, 1.2],
          [100, 1.1],
          [150, Number.NaN],
          [300, 0],
          [250, 1.4],
        ],
      }),
      [1.1, 1.2, 1.4],
    );
    assert.equal(xrpSparkline([]), null);
    assert.equal(xrpSparkline([1.2]), null);
    assert.equal(xrpSparkline([1.2, Number.NaN]), null);
    const spark = xrpSparkline([1.2, 1.35]);
    assert.deepEqual(spark, { prices: [1.2, 1.35], referenceUsd: 1.55 });
    const many = Array.from({ length: 100 }, (_, index) => 1 + index / 100);
    const down = xrpSparkline(many);
    assert.equal(down?.prices.length, 48);
    assert.equal(down?.prices[0], many[0]);
    assert.equal(down?.prices.at(-1), many.at(-1));
    assert.equal(xrpSparkline([1.2, 1.3], Number.NaN), null);
  });

  it("keeps fresh AI day-change bars in floor order and hides when none are live", () => {
    const bars = aiChangeBars(
      [
        move("HUBB", 1.2),
        move("CEG", -2.2),
        move("PWR", -0.4),
        move("ETN", null),
        move("VRT", 0.8, HOME_QUOTE_MAX_AGE_MS + 5),
        move("GEV", 0),
        move("OTHER", 9),
      ],
      NOW,
    );
    assert.deepEqual(bars, [
      { ticker: "PWR", changePct: -0.4 },
      { ticker: "GEV", changePct: 0 },
      { ticker: "CEG", changePct: -2.2 },
      { ticker: "HUBB", changePct: 1.2 },
    ]);
    assert.equal(
      aiChangeBars(
        [move("PWR", 1, HOME_QUOTE_MAX_AGE_MS + 1), move("ETN", null), move("VRT", Number.NaN)],
        NOW,
      ),
      null,
    );
    assert.equal(aiChangeBars([], NOW), null);
  });

  it("paints XRP then SUI, green or red by sign, and hides a missing quote", () => {
    const bars = cryptoChangeBars(
      [
        move("SUI", -1.25),
        move("HBAR", 9),
        move("XRP", 2.4),
      ],
      NOW,
    );
    assert.deepEqual(bars, [
      { ticker: "XRP", changePct: 2.4 },
      { ticker: "SUI", changePct: -1.25 },
    ]);
    assert.deepEqual(
      bars?.map((bar) => [bar.ticker, changeBarClass(bar.changePct)]),
      [
        ["XRP", "is-up"],
        ["SUI", "is-down"],
      ],
    );
    assert.equal(changeBarClass(0), "is-flat");

    assert.deepEqual(
      cryptoChangeBars([move("XRP", 0.4), move("SUI", null)], NOW),
      [{ ticker: "XRP", changePct: 0.4 }],
    );
    assert.deepEqual(
      cryptoChangeBars([move("XRP", Number.NaN), move("SUI", -0.2)], NOW)?.map((bar) => [
        bar.ticker,
        changeBarClass(bar.changePct),
      ]),
      [["SUI", "is-down"]],
    );
    assert.equal(
      cryptoChangeBars(
        [move("XRP", 1, HOME_QUOTE_MAX_AGE_MS + 1), move("SUI", null)],
        NOW,
      ),
      null,
    );
  });

  it("keeps empty step slots and hides a week with no samples", () => {
    const days = fitnessWeekStepDays(metricSamples(manualFitnessSeed().metrics), "2026-10-08");
    const slots = fitnessStepBars(days);
    assert.equal(slots?.length, 7);
    assert.deepEqual(
      slots?.map((slot) => [slot.label, slot.steps]),
      [
        ["Mo", 21608],
        ["Tu", null],
        ["We", null],
        ["Th", null],
        ["Fr", null],
        ["Sa", null],
        ["Su", null],
      ],
    );
    assert.equal(
      fitnessStepBars([
        { day: "2026-10-05", steps: null },
        { day: "2026-10-06", steps: null },
      ]),
      null,
    );
    assert.equal(fitnessStepBars([]), null);
    assert.deepEqual(fitnessStepBars([{ day: "2026-10-05", steps: Number.NaN }]), null);
    assert.deepEqual(fitnessStepBars([{ day: "2026-10-05", steps: 0 }]), [
      { day: "2026-10-05", label: "Mo", steps: 0 },
    ]);
  });

  it("splits open at-risk by tier and hides an empty book", () => {
    const segments = predictionsTierBar([
      { id: "untiered", atRiskLabel: "$1.00" },
      { id: "LEAN", atRiskLabel: "$3.00" },
      { id: "STRONG", atRiskLabel: "$0.00" },
      { id: "nope", atRiskLabel: "$9.00" },
    ]);
    assert.deepEqual(
      segments?.map((segment) => [segment.label, segment.atRiskLabel, segment.share]),
      [
        ["LEAN", "$3.00", 0.75],
        ["untiered", "$1.00", 0.25],
      ],
    );
    assert.equal(
      predictionsTierBar([
        { id: "STRONG", atRiskLabel: "$0.00" },
        { id: "LEAN", atRiskLabel: "$0.00" },
        { id: "untiered", atRiskLabel: "$0.00" },
      ]),
      null,
    );
    assert.equal(predictionsTierBar([]), null);
    assert.equal(predictionsTierBar([{ id: "LEAN", atRiskLabel: "—" }]), null);
  });

  it("hides the bankroll line until two in-scope settlements", () => {
    const open = allen({ id: "open", stake: "1.00", status: "open" });
    const one = allen({
      id: "one",
      stake: "1.00",
      status: "won",
      payout: "2.00",
      realizedPnl: "1.00",
      settledAt: "2026-10-11T01:00:00.000Z",
    });
    assert.equal(inScopeBankrollPoints([open]), null);
    assert.equal(inScopeBankrollPoints([one]), null);
    const two = allen({
      id: "two",
      stake: "2.00",
      status: "lost",
      realizedPnl: "-2.00",
      settledAt: "2026-10-11T02:00:00.000Z",
    });
    assert.deepEqual(inScopeBankrollPoints([two, one]), [18.06, 16.06]);
    const before = allen({
      id: "before",
      stake: "4.00",
      status: "won",
      realizedPnl: "9.00",
      settledAt: "2026-10-04T01:00:00.000Z",
    });
    before.event = "UFC 332: Silva vs Wang";
    before.fightSlug = "eric-nolan-vs-court-mcgee";
    assert.equal(inScopeBankrollPoints([before, one]), null);
  });
});
