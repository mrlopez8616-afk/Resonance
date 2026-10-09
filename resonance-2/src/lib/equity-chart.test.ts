import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quoteFromYahooChart } from "./equity-chart";

const PRICE = 164.055;
const YESTERDAY = 160.57;
const WINDOW_OPEN = 158.96;

function unix(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

function chart(input: {
  closes: Array<number | null>;
  days: string[];
  range?: "1d" | "5d" | "1mo";
  previousClose?: number;
  chartPreviousClose?: number;
  marketDay?: string;
}) {
  return {
    body: {
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: PRICE,
              regularMarketTime: unix(`${input.marketDay ?? "2026-10-09"}T14:30:00Z`),
              chartPreviousClose: input.chartPreviousClose ?? WINDOW_OPEN,
              ...(input.previousClose === undefined ? {} : { previousClose: input.previousClose }),
            },
            timestamp: input.days.map((day) => unix(`${day}T14:30:00Z`)),
            indicators: { quote: [{ close: input.closes }] },
          },
        ],
      },
    },
    range: input.range ?? "5d",
  } as const;
}

describe("Yahoo chart day change", () => {
  it("uses yesterday's close when the 5d chartPreviousClose is an earlier session", () => {
    const fixture = chart({
      days: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
      closes: [WINDOW_OPEN, 159.4, 159.8, YESTERDAY, 164.02],
      previousClose: 151,
      chartPreviousClose: WINDOW_OPEN,
    });
    const quote = quoteFromYahooChart(fixture.body, fixture.range);
    const day = ((PRICE - YESTERDAY) / YESTERDAY) * 100;
    const windowMove = ((PRICE - WINDOW_OPEN) / WINDOW_OPEN) * 100;
    assert.equal(quote?.usd, PRICE);
    assert.equal(quote?.price24hAgoUsd, YESTERDAY);
    assert.ok(quote?.change24hPct !== null && Math.abs(quote.change24hPct - day) < 1e-9);
    assert.ok(quote?.change24hPct !== null && Math.abs(quote.change24hPct - windowMove) > 0.5);
  });

  it("treats a missing today bar as the prior session, not the 5d window open", () => {
    const fixture = chart({
      days: ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"],
      closes: [WINDOW_OPEN, 159.4, 159.8, YESTERDAY, null],
      previousClose: 151,
      chartPreviousClose: WINDOW_OPEN,
    });
    const quote = quoteFromYahooChart(fixture.body, "5d");
    assert.equal(quote?.usd, PRICE);
    assert.equal(quote?.price24hAgoUsd, YESTERDAY);
  });

  it("falls back to meta.previousClose and ignores a 5d chartPreviousClose", () => {
    const fixture = chart({
      days: ["2026-10-09"],
      closes: [164.02],
      previousClose: YESTERDAY,
      chartPreviousClose: WINDOW_OPEN,
    });
    const fromBars = quoteFromYahooChart(fixture.body, "5d");
    assert.equal(fromBars?.price24hAgoUsd, YESTERDAY);

    const noPrevious = chart({
      days: ["2026-10-09"],
      closes: [164.02],
      chartPreviousClose: WINDOW_OPEN,
    });
    assert.equal(quoteFromYahooChart(noPrevious.body, "5d")?.price24hAgoUsd, null);
    assert.equal(quoteFromYahooChart(noPrevious.body, "1d")?.price24hAgoUsd, WINDOW_OPEN);
  });
});
