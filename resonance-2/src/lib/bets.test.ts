import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterFills, nodesWithValue, parseFillDeskQuery } from "@/lib/fill-desk";
import {
  applyOptionalLean,
  betSeed,
  betStatusLabel,
  betToFill,
  formatSignedUsd,
  formatUsd,
  parseSettleBody,
  realizedPnl,
  scoreBets,
  settleBet,
  summarizeBets,
  summarizeUfcBook,
} from "@/lib/bets";
import {
  applyBetCorrections,
  backfillBetLeans,
  ensureSeededBetsEnvelope,
  fallbackBetBook,
  parseBetsEnvelope,
  replaceBet,
} from "@/lib/bets-store-core";
import { fightBySlug, fightersMissingHighlights, unmatchedOddsNames, ufc332Fights } from "@/lib/ufc332";

describe("UFC 332 bets", () => {
  it("stakes 163.90 and returns 302.58 across 14 open tickets", () => {
    const bets = betSeed();
    assert.equal(bets.length, 15);
    assert.equal(ufc332Fights.length, 14);
    const summary = summarizeBets(bets);
    assert.equal(summary.open, 14);
    assert.equal(summary.staked, "163.90");
    assert.equal(summary.potential, "302.58");
    assert.equal(summary.record, "0-1");
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
        "ufc-332-green",
        "ufc-332-talbott",
        "ufc-332-wang-cong",
      ],
    );
    assert.equal(bets.filter((bet) => bet.estimated).map((bet) => bet.id).join(), "ufc-332-coria");
    for (const bet of bets) {
      const fight = fightBySlug(bet.fightSlug);
      assert.ok(fight, bet.id);
      assert.equal(
        fight.A.name === bet.pick ||
          fight.B.name === bet.pick ||
          bet.pick.includes(fight.A.name) ||
          bet.pick.includes(fight.B.name),
        true,
      );
      assert.equal(bet.venue, "coinbase-predict");
      assert.equal(bet.ticker, "UFC");
      assert.equal(bet.status, bet.id === "ufc-332-green" ? "lost" : "open");
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
    assert.equal(won.bet.hubLean, "Eric Nolan");
    assert.equal(won.bet.agreesWithLean, true);
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
    assert.equal(seeded.envelope.bets.length, 15);
    const nolan = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.ok(nolan);
    const won = settleBet(nolan, { id: nolan.id, status: "won" }, "2026-10-04T01:00:00.000Z");
    const stored = replaceBet(seeded.envelope, won.bet, "2026-10-04T01:00:00.000Z");
    const again = ensureSeededBetsEnvelope(stored, "2026-10-04T02:00:00.000Z");
    assert.equal(again.seeded, false);
    assert.equal(again.envelope.bets.length, 15);
    assert.equal(again.envelope.bets.find((bet) => bet.id === "ufc-332-nolan")?.status, "won");
    const summary = summarizeBets(again.envelope.bets);
    assert.equal(summary.open, 13);
    assert.equal(summary.record, "1-1");
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
    assert.equal(filterFills(rows, parseFillDeskQuery({ ticker: "UFC" })).length, 15);
    assert.equal(filterFills(rows, parseFillDeskQuery({})).length, 16);
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

  it("stores the hub lean and marks only Wang Cong and King Green as disagrees", () => {
    const bets = betSeed();
    const agreed = bets.filter((bet) => bet.id !== "ufc-332-wang-cong" && bet.id !== "ufc-332-green");
    assert.equal(agreed.length, 13);
    for (const bet of agreed) {
      assert.equal(bet.hubLean, bet.pick, bet.id);
      assert.equal(bet.agreesWithLean, true, bet.id);
    }
    const wang = bets.find((bet) => bet.id === "ufc-332-wang-cong");
    assert.ok(wang);
    assert.equal(wang.hubLean, "Natalia Silva");
    assert.equal(wang.pick, "Wang Cong");
    assert.equal(wang.agreesWithLean, false);
    assert.equal(betToFill(wang).hubLean, "Natalia Silva");
    assert.equal(betToFill(wang).agreesWithLean, false);
    const green = bets.find((bet) => bet.id === "ufc-332-green");
    assert.ok(green);
    assert.equal(green.pick, "Yes King Green");
    assert.equal(green.hubLean, "Esteban Ribovics");
    assert.equal(green.agreesWithLean, false);
    assert.equal(green.stake, "21.31");
    assert.equal(green.status, "lost");
    assert.equal(green.realizedPnl, "-21.31");
    assert.equal(green.orderId, null);
    assert.equal(betToFill(green).orderId, "pending");
    assert.equal(betToFill(green).idempotencyKey, "ufc-332-green");
    assert.equal(betStatusLabel(green.status), "lost");
  });

  it("backfills lean onto a settled row without touching status or P&L", () => {
    const seeded = ensureSeededBetsEnvelope(null, "2026-10-03T12:00:00.000Z");
    const nolan = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.ok(nolan);
    const won = settleBet(nolan, { id: nolan.id, status: "won" }, "2026-10-04T01:00:00.000Z");
    const stripped = { ...won.bet };
    delete stripped.hubLean;
    delete stripped.agreesWithLean;
    const stored = replaceBet(seeded.envelope, stripped, "2026-10-04T01:00:00.000Z");
    const parsed = parseBetsEnvelope(JSON.parse(JSON.stringify(stored)));
    assert.ok(parsed);
    const rawNolan = parsed.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.ok(rawNolan);
    assert.equal(rawNolan.hubLean, undefined);
    assert.equal(rawNolan.agreesWithLean, undefined);
    assert.equal(rawNolan.status, "won");
    assert.equal(rawNolan.realizedPnl, "2.28");

    const filled = backfillBetLeans(parsed, "2026-10-04T02:00:00.000Z");
    assert.equal(filled.changed, true);
    const restored = filled.envelope.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.ok(restored);
    assert.equal(restored.hubLean, "Eric Nolan");
    assert.equal(restored.agreesWithLean, true);
    assert.equal(restored.status, "won");
    assert.equal(restored.realizedPnl, "2.28");
    assert.equal(restored.stake, nolan.stake);

    const again = backfillBetLeans(filled.envelope, "2026-10-04T03:00:00.000Z");
    assert.equal(again.changed, false);
    assert.equal(again.envelope, filled.envelope);
    assert.equal(again.envelope.updatedAt, "2026-10-04T02:00:00.000Z");
  });

  it("keeps a stored lean override and accepts optional write fields", () => {
    const seeded = ensureSeededBetsEnvelope(null, "2026-10-03T12:00:00.000Z");
    const wang = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-wang-cong");
    assert.ok(wang);
    const overridden = replaceBet(
      seeded.envelope,
      { ...wang, hubLean: "Wang Cong", agreesWithLean: true },
      "2026-10-04T01:00:00.000Z",
    );
    const kept = backfillBetLeans(overridden, "2026-10-04T02:00:00.000Z");
    assert.equal(kept.changed, false);
    const row = kept.envelope.bets.find((bet) => bet.id === "ufc-332-wang-cong");
    assert.equal(row?.hubLean, "Wang Cong");
    assert.equal(row?.agreesWithLean, true);

    const open = betSeed().find((bet) => bet.id === "ufc-332-wang-cong");
    assert.ok(open);
    const written = applyOptionalLean(
      { ...open, hubLean: undefined, agreesWithLean: undefined },
      { hubLean: " Natalia Silva ", agreesWithLean: false },
    );
    assert.equal(written.hubLean, "Natalia Silva");
    assert.equal(written.agreesWithLean, false);
    assert.equal(written.status, "open");

    const omitted = applyOptionalLean(
      { ...open, hubLean: undefined, agreesWithLean: undefined },
      {},
    );
    assert.equal(omitted.hubLean, "Natalia Silva");
    assert.equal(omitted.agreesWithLean, false);

    const envelope = parseBetsEnvelope({
      bets: [
        {
          ...open,
          hubLean: 12,
          agreesWithLean: "false",
        },
      ],
    });
    assert.equal(envelope?.bets.length, 1);
    assert.equal(envelope?.bets[0]?.hubLean, undefined);
    assert.equal(envelope?.bets[0]?.agreesWithLean, undefined);
    assert.equal(envelope?.bets[0]?.stake, open.stake);
  });

  it("scores settled bets and sums the UFC book", () => {
    const bets = betSeed();
    const byId = (id: string) => {
      const bet = bets.find((row) => row.id === id);
      assert.ok(bet);
      return bet;
    };
    const nolan = settleBet(byId("ufc-332-nolan"), { id: "ufc-332-nolan", status: "won" }, "t").bet;
    const smith = settleBet(byId("ufc-332-smith"), { id: "ufc-332-smith", status: "lost" }, "t").bet;
    const walker = settleBet(byId("ufc-332-walker"), { id: "ufc-332-walker", status: "void" }, "t").bet;
    const wang = settleBet(
      byId("ufc-332-wang-cong"),
      { id: "ufc-332-wang-cong", status: "won" },
      "t",
    ).bet;
    const bookBets = bets.map((bet) => {
      if (bet.id === nolan.id) return nolan;
      if (bet.id === smith.id) return smith;
      if (bet.id === walker.id) return walker;
      if (bet.id === wang.id) return wang;
      return bet;
    });

    const card = scoreBets(bookBets);
    assert.equal(card.founder.record, "2-2");
    assert.equal(card.hub.record, "2-2");
    assert.equal(card.withLean.record, "1-1");
    assert.equal(card.againstLean.record, "1-1");
    assert.equal(card.voids, 1);
    assert.equal(card.sold, 0);
    assert.equal(card.open, 10);

    const book = summarizeUfcBook(bookBets);
    assert.equal(book.record, "2-2");
    assert.equal(book.voids, 1);
    assert.equal(book.sold, 0);
    assert.equal(book.count, 15);
    assert.equal(book.totalStaked, "185.21");
    assert.equal(book.open, 10);
    assert.equal(book.openStake, "106.63");
    assert.equal(book.realizedPnl, "52.10");
    assert.equal(book.realizedPnlLabel, "+$52.10");
    assert.equal(book.tileLabel, "2-2 · +$52.10");
    assert.equal(formatSignedUsd("-4.88"), "-$4.88");
    assert.equal(formatSignedUsd("0.00"), "$0.00");

    const openBook = summarizeUfcBook(bets);
    assert.equal(openBook.record, "0-1");
    assert.equal(openBook.realizedPnl, "-21.31");
    assert.equal(openBook.tileLabel, "0-1 · -$21.31");
    assert.equal(openBook.openStake, "163.90");
    assert.equal(openBook.openPotential, "302.58");
  });

  it("applies versioned stake and sold corrections once", () => {
    const seeded = ensureSeededBetsEnvelope(null, "2026-10-03T12:00:00.000Z");
    const ribovics = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-ribovics");
    const nolan = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.ok(ribovics && nolan);
    const wonRibovics = settleBet(
      ribovics,
      { id: ribovics.id, status: "won", payout: "22.37" },
      "2026-10-04T01:00:00.000Z",
    ).bet;
    assert.equal(wonRibovics.realizedPnl, "7.83");
    const wonNolan = settleBet(nolan, { id: nolan.id, status: "won" }, "2026-10-04T01:00:00.000Z").bet;
    let envelope = replaceBet(seeded.envelope, wonRibovics, "2026-10-04T01:00:00.000Z");
    envelope = replaceBet(envelope, wonNolan, "2026-10-04T01:00:00.000Z");

    const corrected = applyBetCorrections(envelope, "2026-10-04T02:00:00.000Z");
    assert.equal(corrected.changed, true);
    const sold = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-ribovics");
    assert.ok(sold);
    assert.equal(sold.status, "sold");
    assert.equal(sold.payout, "13.64");
    assert.equal(sold.stake, "14.54");
    assert.equal(sold.realizedPnl, "-0.90");
    assert.equal(sold.correctionVersion, 1);
    assert.equal(betStatusLabel(sold.status), "sold early");
    const keptNolan = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.equal(keptNolan?.status, "won");
    assert.equal(keptNolan?.stake, "4.84");
    assert.equal(keptNolan?.correctionVersion, undefined);

    const coria = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-coria");
    const wang = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-wang-cong");
    assert.equal(coria?.stake, "19.99");
    assert.equal(coria?.status, "open");
    assert.equal(coria?.payout, "42.51");
    assert.equal(wang?.stake, "45.13");
    assert.equal(wang?.status, "open");
    assert.equal(wang?.payout, "118.76");

    const again = applyBetCorrections(corrected.envelope, "2026-10-04T03:00:00.000Z");
    assert.equal(again.changed, false);
    assert.equal(again.envelope.updatedAt, corrected.envelope.updatedAt);

    const edited = replaceBet(
      corrected.envelope,
      { ...sold, payout: "10.00", realizedPnl: "-4.54" },
      "2026-10-04T04:00:00.000Z",
    );
    const held = applyBetCorrections(edited, "2026-10-04T05:00:00.000Z");
    assert.equal(held.changed, false);
    assert.equal(held.envelope.bets.find((bet) => bet.id === "ufc-332-ribovics")?.payout, "10.00");

    const lostCoria = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-coria");
    assert.ok(lostCoria);
    const settledCoria = settleBet(
      lostCoria,
      { id: lostCoria.id, status: "lost" },
      "2026-10-04T01:00:00.000Z",
    ).bet;
    assert.equal(settledCoria.realizedPnl, "-19.13");
    const coriaBook = applyBetCorrections(
      replaceBet(seeded.envelope, settledCoria, "2026-10-04T01:00:00.000Z"),
      "2026-10-04T02:00:00.000Z",
    );
    const coriaRow = coriaBook.envelope.bets.find((bet) => bet.id === "ufc-332-coria");
    assert.equal(coriaRow?.status, "lost");
    assert.equal(coriaRow?.stake, "19.99");
    assert.equal(coriaRow?.payout, "42.51");
    assert.equal(coriaRow?.realizedPnl, "-19.99");
  });

  it("reads the corrected book without moving the other stakes", () => {
    const bets = fallbackBetBook();
    const stakeOf = (id: string) => bets.find((bet) => bet.id === id)?.stake;
    assert.equal(stakeOf("ufc-332-nolan"), "4.84");
    assert.equal(stakeOf("ufc-332-naurdiev"), "4.82");
    assert.equal(stakeOf("ufc-332-hernandez"), "14.58");
    assert.equal(stakeOf("ufc-332-smith"), "4.88");
    assert.equal(stakeOf("ufc-332-walker"), "4.80");
    assert.equal(stakeOf("ufc-332-wint"), "14.64");
    assert.equal(stakeOf("ufc-332-mcghee"), "4.87");
    assert.equal(stakeOf("ufc-332-pinas"), "4.87");
    assert.equal(stakeOf("ufc-332-gautier"), "9.69");
    assert.equal(stakeOf("ufc-332-soldic"), "4.84");
    assert.equal(stakeOf("ufc-332-ribovics"), "14.54");
    assert.equal(stakeOf("ufc-332-talbott"), "14.65");
    assert.equal(stakeOf("ufc-332-green"), "21.31");
    assert.equal(stakeOf("ufc-332-coria"), "19.99");
    assert.equal(stakeOf("ufc-332-wang-cong"), "45.13");

    const book = summarizeUfcBook(bets);
    assert.equal(book.totalStaked, "188.45");
    assert.equal(book.realizedPnl, "-22.21");
    assert.equal(book.realizedPnlLabel, "-$22.21");
    assert.equal(book.record, "0-1");
    assert.equal(book.sold, 1);
    assert.equal(book.wins, 0);
    assert.equal(book.losses, 1);
    assert.equal(book.open, 13);
    assert.equal(book.openStake, "152.60");
    assert.equal(book.openPotential, "280.21");

    const card = scoreBets(bets);
    assert.equal(card.founder.record, "0-1");
    assert.equal(card.hub.record, "1-0");
    assert.equal(card.withLean.record, "0-0");
    assert.equal(card.againstLean.record, "0-1");
    assert.equal(card.sold, 1);
    assert.equal(card.voids, 0);
  });

  it("lets override correct a settled stake and rejects stake without it", () => {
    const ribovics = betSeed().find((bet) => bet.id === "ufc-332-ribovics");
    assert.ok(ribovics);
    const won = settleBet(
      ribovics,
      { id: ribovics.id, status: "won", payout: "22.37" },
      "2026-10-04T01:00:00.000Z",
    ).bet;
    assert.throws(() =>
      settleBet(won, { id: won.id, status: "won", stake: "10.00" }, "2026-10-04T02:00:00.000Z"),
    );
    assert.throws(() => parseSettleBody({ id: won.id, status: "sold", payout: "13.64", stake: "14.54" }));
    const sold = settleBet(
      won,
      { id: won.id, status: "sold", payout: "13.64", stake: "14.54", override: true },
      "2026-10-04T02:00:00.000Z",
    );
    assert.equal(sold.deduped, false);
    assert.equal(sold.bet.status, "sold");
    assert.equal(sold.bet.payout, "13.64");
    assert.equal(sold.bet.stake, "14.54");
    assert.equal(sold.bet.realizedPnl, "-0.90");
    const same = settleBet(
      sold.bet,
      { id: won.id, status: "sold", payout: "13.64", stake: "14.54", override: true },
      "2026-10-04T03:00:00.000Z",
    );
    assert.equal(same.deduped, true);
    assert.deepEqual(parseSettleBody({ id: won.id, status: "lost" }), [{ id: won.id, status: "lost" }]);
  });
});
