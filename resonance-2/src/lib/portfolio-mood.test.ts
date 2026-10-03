import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PWR_SLEEVES } from "@/data/pwr-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import {
  FLAT_DEADBAND_PCT,
  MIN_VALUE_COVERAGE,
  PORTFOLIO_FACE_TICKERS,
  formatMoodChange,
  holdingFromBook,
  moodHoldingsFromBooks,
  moodPreviewFromQuery,
  portfolioMood,
  priorUsd,
  type MoodHolding,
} from "./portfolio-mood";

function book(
  id: string,
  quantity: number,
  priceUsd: number | null,
  extra: Partial<Pick<MoodHolding, "price24hAgoUsd" | "change24hPct">> = {},
): MoodHolding {
  return { id, quantity, priceUsd, ...extra };
}

describe("portfolio mood", () => {
  it("reads up from current value versus the 24h-ago price", () => {
    const mood = portfolioMood([
      book("XRP", 10, 110, { price24hAgoUsd: 100 }),
      book("SUI", 2, 55, { price24hAgoUsd: 50 }),
    ]);
    assert.equal(mood.tone, "up");
    assert.equal(mood.partial, false);
    assert.equal(mood.included, 2);
    assert.equal(mood.excluded, 0);
    assert.equal(mood.changePct, 10);
    assert.equal(formatMoodChange(mood.changePct), "+10.00%");
  });

  it("reads down when the book is below its 24h-ago value", () => {
    const mood = portfolioMood([
      book("HBAR", 100, 80, { price24hAgoUsd: 100 }),
    ]);
    assert.equal(mood.tone, "down");
    assert.equal(mood.partial, false);
    assert.equal(mood.changePct, -20);
    assert.equal(formatMoodChange(mood.changePct), "-20.00%");
  });

  it("is flat inside the 0.05% deadband and steps out at exactly 0.05%", () => {
    assert.equal(FLAT_DEADBAND_PCT, 0.05);
    const flat = portfolioMood([
      book("XRP", 1, 10001, { price24hAgoUsd: 10000 }),
    ]);
    assert.equal(flat.tone, "flat");
    assert.equal(flat.changePct, 0.01);
    assert.equal(formatMoodChange(flat.changePct), "+0.01%");

    const upEdge = portfolioMood([
      book("XRP", 1, 2001, { price24hAgoUsd: 2000 }),
    ]);
    assert.equal(upEdge.tone, "up");
    assert.equal(upEdge.changePct, 0.05);

    const downEdge = portfolioMood([
      book("XRP", 1, 1999, { price24hAgoUsd: 2000 }),
    ]);
    assert.equal(downEdge.tone, "down");
    assert.equal(downEdge.changePct, -0.05);

    const unchanged = portfolioMood([
      book("XRP", 4, 10, { change24hPct: 0 }),
    ]);
    assert.equal(unchanged.tone, "flat");
    assert.equal(unchanged.changePct, 0);
    assert.equal(formatMoodChange(unchanged.changePct), "0.00%");
  });

  it("weights the book by value instead of averaging percents", () => {
    const mood = portfolioMood([
      book("XRP", 1, 100000, { price24hAgoUsd: 100000 }),
      book("PWR", 1, 100, { price24hAgoUsd: 101 }),
    ]);
    assert.equal(mood.tone, "flat");
    assert.ok(mood.changePct !== null && Math.abs(mood.changePct) < FLAT_DEADBAND_PCT);
  });

  it("is unknown when every 24h price is missing", () => {
    const mood = portfolioMood([
      book("XRP", 10, 2),
      book("HBAR", 5, 0.2, { change24hPct: null, price24hAgoUsd: null }),
    ]);
    assert.equal(mood.tone, "unknown");
    assert.equal(mood.changePct, null);
    assert.equal(mood.partial, false);
    assert.equal(mood.included, 0);
    assert.equal(mood.excluded, 2);
    assert.equal(formatMoodChange(mood.changePct), "—");
  });

  it("is unknown when there are no holdings or the feeds are empty", () => {
    assert.equal(portfolioMood([]).tone, "unknown");
    assert.equal(
      portfolioMood([book("SUI", 0, 3, { change24hPct: 10 })]).tone,
      "unknown",
    );
    assert.equal(
      portfolioMood([book("XRP", 10, null, { change24hPct: 4 })]).tone,
      "unknown",
    );
  });

  it("is unknown when value coverage is under half", () => {
    assert.equal(MIN_VALUE_COVERAGE, 0.5);
    const mood = portfolioMood([
      book("XRP", 1, 51, { price24hAgoUsd: null }),
      book("PWR", 1, 49, { price24hAgoUsd: 40 }),
    ]);
    assert.equal(mood.tone, "unknown");
    assert.equal(mood.partial, false);
    assert.equal(mood.included, 1);
    assert.equal(mood.excluded, 1);
    assert.ok(mood.coverage !== null && mood.coverage < MIN_VALUE_COVERAGE);
  });

  it("is unknown when more than half of the eligible holdings have no price", () => {
    const mood = portfolioMood([
      book("XRP", 1, 10, { change24hPct: 1 }),
      book("SUI", 1, null),
      book("HBAR", 1, null),
      book("PWR", 1, null),
    ]);
    assert.equal(mood.tone, "unknown");
    assert.equal(mood.partial, false);
    assert.equal(mood.eligible, 4);
    assert.equal(mood.included, 1);
  });

  it("marks partial when a covered majority still has a direction", () => {
    const up = portfolioMood([
      book("XRP", 1, 60, { price24hAgoUsd: 50 }),
      book("PWR", 1, 40),
    ]);
    assert.equal(up.tone, "up");
    assert.equal(up.partial, true);
    assert.equal(up.changePct, 20);
    assert.equal(up.coverage, 0.6);

    const exactHalf = portfolioMood([
      book("XRP", 1, 50, { change24hPct: -10 }),
      book("SUI", 1, 50),
    ]);
    assert.equal(exactHalf.tone, "down");
    assert.equal(exactHalf.partial, true);
    assert.equal(exactHalf.coverage, 0.5);

    const flatPartial = portfolioMood([
      book("XRP", 1, 10000, { price24hAgoUsd: 10000 }),
      book("ETN", 1, 1),
    ]);
    assert.equal(flatPartial.tone, "flat");
    assert.equal(flatPartial.partial, true);
  });

  it("prefers a direct 24h-ago price and refuses a -100% change", () => {
    assert.equal(
      priorUsd(book("XRP", 1, 110, { price24hAgoUsd: 80, change24hPct: 50 })),
      80,
    );
    const fromPct = portfolioMood([book("XRP", 2, 110, { change24hPct: 10 })]);
    assert.equal(fromPct.tone, "up");
    assert.equal(fromPct.changePct, 10);

    const broken = portfolioMood([
      book("XRP", 5, 1, { change24hPct: -100 }),
      book("SUI", 1, 2, { change24hPct: -150 }),
    ]);
    assert.equal(broken.tone, "unknown");
    assert.equal(priorUsd(book("XRP", 1, 1, { change24hPct: -100 })), null);
  });

  it("skips zero quantities and does not treat them as exclusions", () => {
    const mood = portfolioMood([
      book("SUI", 0, null),
      book("XRP", 3, 10, { change24hPct: 2 }),
    ]);
    assert.equal(mood.tone, "up");
    assert.equal(mood.partial, false);
    assert.equal(mood.eligible, 1);
    assert.equal(mood.excluded, 0);
  });

  it("builds holdings from live sleeve books and ignores bets", () => {
    assert.equal(PORTFOLIO_FACE_TICKERS.includes("XRP"), true);
    assert.equal(
      (PORTFOLIO_FACE_TICKERS as readonly string[]).includes("UFC"),
      false,
    );
    assert.equal(
      (PORTFOLIO_FACE_TICKERS as readonly string[]).includes("BTC"),
      false,
    );

    const books = Object.fromEntries(
      PORTFOLIO_FACE_TICKERS.map((ticker) => [ticker, [] as { quantity: string }[]]),
    );
    books.XRP = XRP_SLEEVES;
    books.PWR = PWR_SLEEVES;
    const holdings = moodHoldingsFromBooks(
      { ...books, UFC: [{ quantity: "1000" }] },
      {
        XRP: { usd: 2, change24hPct: 1 },
        PWR: { usd: 100, change24hPct: -50 },
        UFC: { usd: 1, change24hPct: -80 },
      },
    );
    assert.deepEqual(
      holdings.map((row) => row.id),
      [...PORTFOLIO_FACE_TICKERS],
    );
    assert.equal(holdings.some((row) => row.id === "UFC"), false);

    const mood = portfolioMood(holdings);
    assert.equal(mood.tone, "up");
    assert.equal(mood.partial, false);
    assert.ok(mood.changePct !== null && mood.changePct > 0.9 && mood.changePct < 1.1);
    const xrp = holdingFromBook("XRP", XRP_SLEEVES, { usd: 2, change24hPct: 1 });
    assert.equal(xrp.quantity, 28332.601);
  });

  it("treats a missing 24h field on a dominant holding as unknown", () => {
    const mood = portfolioMood(
      moodHoldingsFromBooks(
        { XRP: XRP_SLEEVES, PWR: PWR_SLEEVES },
        {
          XRP: { usd: 2, change24hPct: null },
          PWR: { usd: 100, change24hPct: 40 },
        },
      ),
    );
    assert.equal(mood.tone, "unknown");
    assert.equal(mood.partial, false);
  });

  it("counts an unreadable quantity as excluded rather than zero", () => {
    const mood = portfolioMood([
      holdingFromBook("XRP", [{ quantity: "nope" }], {
        usd: 1,
        change24hPct: 5,
      }),
      holdingFromBook("HBAR", [{ quantity: "" }], {
        usd: 1,
        change24hPct: 5,
      }),
      book("SUI", 1, 1, { change24hPct: 5 }),
    ]);
    assert.equal(mood.tone, "unknown");
    assert.equal(mood.eligible, 3);
    assert.equal(mood.included, 1);
    assert.equal(mood.partial, false);
  });

  it("ignores the dev mood query in production", () => {
    assert.equal(moodPreviewFromQuery("up", "development"), "up");
    assert.equal(moodPreviewFromQuery("down", "development"), "down");
    assert.equal(moodPreviewFromQuery("neutral", "test"), "flat");
    assert.equal(moodPreviewFromQuery("unknown", "development"), "unknown");
    assert.equal(moodPreviewFromQuery("sideways", "development"), null);
    assert.equal(moodPreviewFromQuery("up", "production"), null);
    assert.equal(moodPreviewFromQuery("down", "production"), null);
    assert.equal(moodPreviewFromQuery(null, "development"), null);
  });
});
