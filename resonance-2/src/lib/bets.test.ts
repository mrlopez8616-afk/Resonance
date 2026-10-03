import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterFills, nodesWithValue, parseFillDeskQuery } from "@/lib/fill-desk";
import {
  betSeed,
  betToFill,
  formatUsd,
  parseSettleBody,
  realizedPnl,
  settleBet,
  summarizeBets,
} from "@/lib/bets";
import {
  ensureSeededBetsEnvelope,
  replaceBet,
} from "@/lib/bets-store-core";
import { fightBySlug, fightersMissingHighlights, unmatchedOddsNames, ufc332Fights } from "@/lib/ufc332";

describe("UFC 332 bets", () => {
  it("stakes 163.90 and returns 302.58 across 14 open tickets", () => {
    const bets = betSeed();
    assert.equal(bets.length, 14);
    assert.equal(ufc332Fights.length, 14);
    const summary = summarizeBets(bets);
    assert.equal(summary.open, 14);
    assert.equal(summary.staked, "163.90");
    assert.equal(summary.potential, "302.58");
    assert.equal(summary.record, "0-0");
    assert.equal(summary.estimated, true);
    assert.equal(formatUsd(summary.staked), "$163.90");
    assert.equal(formatUsd(summary.potential), "$302.58");
    assert.deepEqual(
      bets.map((bet) => bet.id),
      [
        "ufc-332-nolan",
        "ufc-332-naurdiev",
        "ufc-332-hernandez",
        "ufc-332-smith",
        "ufc-332-walker",
        "ufc-332-wint",
        "ufc-332-mcghee",
        "ufc-332-pinas",
        "ufc-332-coria",
        "ufc-332-gautier",
        "ufc-332-soldic",
        "ufc-332-ribovics",
        "ufc-332-talbott",
        "ufc-332-wang-cong",
      ],
    );
    assert.equal(bets.filter((bet) => bet.estimated).map((bet) => bet.id).join(), "ufc-332-coria");
    for (const bet of bets) {
      const fight = fightBySlug(bet.fightSlug);
      assert.ok(fight, bet.id);
      assert.equal(fight.A.name === bet.pick || fight.B.name === bet.pick, true);
      assert.equal(bet.venue, "coinbase-predict");
      assert.equal(bet.ticker, "UFC");
      assert.equal(bet.status, "open");
    }
  });

  it("keeps the three ticket prices that differ from the card Coinbase print", () => {
    const diffs = betSeed().flatMap((bet) => {
      const fight = fightBySlug(bet.fightSlug);
      assert.ok(fight);
      const side = fight.A.name === bet.pick ? fight.A : fight.B;
      if (side.coinbasePct === bet.oddsPct) return [];
      return [`${bet.pick} ticket ${bet.oddsPct} card ${side.coinbasePct}`];
    });
    assert.deepEqual(diffs, [
      "Ismail Naurdiev ticket 55 card 56",
      "Alexander Hernandez ticket 71 card 72",
      "Jacobe Smith ticket 89 card 88",
    ]);
    assert.deepEqual(unmatchedOddsNames(), ["Benardo Sopaj"]);
    assert.deepEqual(fightersMissingHighlights(), []);
  });

  it("settles won, lost, and void without touching the stake twice", () => {
    const [nolan, coria] = [betSeed()[0], betSeed().find((bet) => bet.id === "ufc-332-coria")];
    assert.ok(nolan && coria);
    assert.equal(realizedPnl(nolan.stake, "won", nolan.payout), "2.28");
    assert.equal(realizedPnl(nolan.stake, "lost", nolan.payout), "-4.84");
    assert.equal(realizedPnl(nolan.stake, "void", nolan.payout), "0.00");

    const won = settleBet(nolan, { id: nolan.id, status: "won" }, "2026-10-04T01:00:00.000Z");
    assert.equal(won.deduped, false);
    assert.equal(won.bet.status, "won");
    assert.equal(won.bet.realizedPnl, "2.28");
    assert.equal(won.bet.stake, nolan.stake);
    const again = settleBet(won.bet, { id: nolan.id, status: "won" }, "2026-10-04T02:00:00.000Z");
    assert.equal(again.deduped, true);
    assert.equal(again.bet.realizedPnl, "2.28");
    assert.equal(again.bet.settledAt, won.bet.settledAt);

    const lost = settleBet(coria, { id: coria.id, status: "lost" }, "2026-10-04T01:00:00.000Z");
    assert.equal(lost.bet.realizedPnl, "-19.13");
    assert.equal(lost.bet.estimated, true);
    const corrected = settleBet(
      lost.bet,
      { id: coria.id, status: "won", payout: "40.00" },
      "2026-10-04T03:00:00.000Z",
    );
    assert.equal(corrected.deduped, false);
    assert.equal(corrected.bet.realizedPnl, "20.87");
    assert.equal(corrected.bet.settledPayout, "40.00");
  });

  it("seeds by id and does not reopen a settled bet", () => {
    const seeded = ensureSeededBetsEnvelope(null, "2026-10-03T12:00:00.000Z");
    assert.equal(seeded.seeded, true);
    assert.equal(seeded.envelope.bets.length, 14);
    const nolan = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.ok(nolan);
    const won = settleBet(nolan, { id: nolan.id, status: "won" }, "2026-10-04T01:00:00.000Z");
    const stored = replaceBet(seeded.envelope, won.bet, "2026-10-04T01:00:00.000Z");
    const again = ensureSeededBetsEnvelope(stored, "2026-10-04T02:00:00.000Z");
    assert.equal(again.seeded, false);
    assert.equal(again.envelope.bets.length, 14);
    assert.equal(again.envelope.bets.find((bet) => bet.id === "ufc-332-nolan")?.status, "won");
    const summary = summarizeBets(again.envelope.bets);
    assert.equal(summary.open, 13);
    assert.equal(summary.record, "1-0");
    assert.equal(summary.staked, "159.06");
  });

  it("parses a single settle and a batch", () => {
    assert.deepEqual(parseSettleBody({ id: "ufc-332-nolan", status: "lost" }), [
      { id: "ufc-332-nolan", status: "lost" },
    ]);
    assert.equal(parseSettleBody({ bets: [{ id: "ufc-332-smith", status: "void" }] }).length, 1);
    assert.throws(() => parseSettleBody({ id: "ufc-332-nolan", status: "open" }));
    assert.throws(() => parseSettleBody({ id: "ufc-332-nolan", status: "lost", payout: "1.00" }));
  });

  it("shows bets on the UFC log and leaves node totals alone", () => {
    const bets = betSeed().map(betToFill);
    const trade = {
      time: "2026-09-18T11:48:58-05:00",
      symbol: "XRP",
      side: "sell" as const,
      quantity: "10",
      price: "1.36",
      orderId: "seed-xrp",
      result: "filled",
    };
    const rows = [...bets, trade];
    assert.equal(filterFills(rows, parseFillDeskQuery({ ticker: "UFC" })).length, 14);
    assert.equal(filterFills(rows, parseFillDeskQuery({})).length, 15);
    assert.equal(
      filterFills(rows, parseFillDeskQuery({ ticker: "UFC", sleeve: "coinbase" })).length,
      0,
    );
    assert.deepEqual(
      nodesWithValue(rows, { XRP: [{ quantity: "10" }] }).map((node) => node.ticker),
      ["XRP"],
    );
    assert.equal(parseFillDeskQuery({ ticker: "ufc" }).ticker, "UFC");
  });
});
