import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBetsEnvelope } from "@/lib/bets-store-core";
import { BET_TICKER, BET_VENUE } from "@/lib/bets";

describe("parseBetsEnvelope", () => {
  it("keeps a settled draw bet on read", () => {
    const env = parseBetsEnvelope({
      bets: [
        {
          id: "ufc-fn-2026-10-10-melissa-gatto",
          event: "UFC Fight Night",
          fight: "Kareckaite vs Gatto",
          fightSlug: "kareckaite-vs-gatto",
          pick: "Melissa Gatto",
          stake: "0.96",
          payout: "1.84",
          oddsPct: 52,
          status: "draw",
          settledPayout: "0.92",
          settledAt: "2026-10-10T18:31:00-05:00",
          venue: BET_VENUE,
          ticker: BET_TICKER,
          time: "2026-10-10T12:00:00-05:00",
        },
      ],
    });
    assert.equal(env?.bets.length, 1);
    assert.equal(env?.bets[0].status, "draw");
  });
});
