import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterFills, nodesWithValue, parseFillDeskQuery } from "@/lib/fill-desk";
import {
  applyOptionalLean,
  betSeed,
  betStatusLabel,
  betToFill,
  betsOnFight,
  formatSignedUsd,
  formatUsd,
  isBetSettleOverride,
  parseBetPostBody,
  parseSettleBody,
  placeBet,
  publicBet,
  realizedPnl,
  scoreBets,
  settleBet,
  summarizeBets,
  summarizeUfcBook,
} from "@/lib/bets";
import {
  applyStoredBetCorrections,
  backfillBetLeans,
  ensureSeededBetsEnvelope,
  fallbackBetBook,
  parseBetsEnvelope,
  replaceBet,
} from "@/lib/bets-store-core";
import { addDecimal } from "@/lib/decimal";
import { chicagoDay, formatChicagoClock } from "@/lib/calendar-time";
import { fightBySlug, fightersMissingHighlights, unmatchedOddsNames, ufc332Fights } from "@/lib/ufc332";

const CORIA_ORDER = "e4f0c363-fefd-4cb5-8e7c-bb695def7711";

describe("UFC 332 bets", () => {
  it("stakes 243.89 and returns 480.35 across 15 open tickets", () => {
    const bets = betSeed();
    assert.equal(bets.length, 16);
    assert.equal(ufc332Fights.length, 14);
    const summary = summarizeBets(bets);
    assert.equal(summary.open, 15);
    assert.equal(summary.staked, "243.89");
    assert.equal(summary.potential, "480.35");
    assert.equal(summary.record, "0-1");
    assert.equal(summary.estimated, true);
    assert.equal(formatUsd(summary.staked), "$243.89");
    assert.equal(formatUsd(summary.potential), "$480.35");
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
        "ufc-332-coria-2",
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
      "Alden Coria ticket 43 card 45",
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
    assert.equal(seeded.envelope.bets.length, 16);
    const nolan = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.ok(nolan);
    const won = settleBet(nolan, { id: nolan.id, status: "won" }, "2026-10-04T01:00:00.000Z");
    const stored = replaceBet(seeded.envelope, won.bet, "2026-10-04T01:00:00.000Z");
    const again = ensureSeededBetsEnvelope(stored, "2026-10-04T02:00:00.000Z");
    assert.equal(again.seeded, false);
    assert.equal(again.envelope.bets.length, 16);
    assert.equal(again.envelope.bets.find((bet) => bet.id === "ufc-332-nolan")?.status, "won");
    const summary = summarizeBets(again.envelope.bets);
    assert.equal(summary.open, 14);
    assert.equal(summary.record, "1-1");
    assert.equal(summary.staked, "239.05");
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
    const ufc = filterFills(rows, parseFillDeskQuery({ ticker: "UFC" }));
    assert.equal(ufc.length, 16);
    assert.equal(ufc.filter((fill) => fill.kind === "bet" && fill.pick === "Alden Coria").length, 2);
    assert.equal(filterFills(rows, parseFillDeskQuery({})).length, 17);
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
    assert.equal(agreed.length, 14);
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
    assert.equal(card.open, 11);

    const book = summarizeUfcBook(bookBets);
    assert.equal(book.record, "2-2");
    assert.equal(book.voids, 1);
    assert.equal(book.sold, 0);
    assert.equal(book.count, 16);
    assert.equal(book.totalStaked, "265.20");
    assert.equal(book.open, 11);
    assert.equal(book.openStake, "186.62");
    assert.equal(book.realizedPnl, "52.10");
    assert.equal(book.realizedPnlLabel, "+$52.10");
    assert.equal(book.tileLabel, "2-2 · +$52.10");
    assert.equal(formatSignedUsd("-4.88"), "-$4.88");
    assert.equal(formatSignedUsd("0.00"), "$0.00");

    const openBook = summarizeUfcBook(bets);
    assert.equal(openBook.record, "0-1");
    assert.equal(openBook.realizedPnl, "-21.31");
    assert.equal(openBook.tileLabel, "0-1 · -$21.31");
    assert.equal(openBook.openStake, "243.89");
    assert.equal(openBook.openPotential, "480.35");
  });

  it("seeds the second Coria ticket from the Coinbase order", () => {
    const bets = betSeed();
    const coria = bets.find((bet) => bet.id === "ufc-332-coria-2");
    assert.ok(coria);
    assert.equal(coria.pick, "Alden Coria");
    assert.equal(coria.stake, "79.99");
    assert.equal(coria.payout, "177.77");
    assert.equal(coria.oddsPct, 43);
    assert.equal(coria.orderId, CORIA_ORDER);
    assert.equal(coria.status, "open");
    assert.equal(coria.estimated, undefined);
    assert.equal(coria.hubLean, "Alden Coria");
    assert.equal(coria.agreesWithLean, true);
    assert.equal(coria.time, "2026-10-03T18:34:00-05:00");
    assert.equal(formatChicagoClock(coria.time), "6:34 PM CT");
    assert.equal(chicagoDay(coria.time), "2026-10-03");
    assert.equal(addDecimal("76.44", "3.55"), "79.99");
    assert.equal(addDecimal("1.77", "1.78"), "3.55");
    assert.match(coria.note ?? "", /177\.77 Yes contracts @ avg \$0\.43/);
    assert.match(coria.note ?? "", /Coinbase fee \$1\.77 \+ exchange fee \$1\.78/);
    const fight = fightBySlug(coria.fightSlug);
    assert.ok(fight);
    assert.equal(betsOnFight(bets, fight.slug).length, 2);
    assert.equal(betToFill(coria).orderId, CORIA_ORDER);
    assert.equal(betToFill(coria).idempotencyKey, "ufc-332-coria-2");
    assert.equal(betToFill(bets[0]).orderId, "ufc-332-nolan");
    const roundTrip = parseBetsEnvelope({ bets: [coria] });
    assert.equal(roundTrip?.bets[0]?.orderId, CORIA_ORDER);
    assert.equal(roundTrip?.bets[0]?.note, coria.note);
    assert.equal(roundTrip?.bets[0]?.stake, "79.99");
  });

  it("posts a bet once and leaves a replay as a no-op", () => {
    const seeded = ensureSeededBetsEnvelope(null, "2026-10-03T12:00:00.000Z");
    const coria = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-coria-2");
    assert.ok(coria);
    const post = parseBetPostBody({
      orderId: CORIA_ORDER,
      id: "ufc-332-coria-2",
      event: coria.event,
      fight: coria.fight,
      fightSlug: coria.fightSlug,
      pick: "Alden Coria",
      stake: "79.99",
      payout: "177.77",
      oddsPct: 43,
      time: "2026-10-03T18:34:00-05:00",
      hubLean: "Alden Coria",
      agreesWithLean: true,
    })[0];
    const again = placeBet(seeded.envelope.bets, post, "2026-10-03T23:34:00.000Z");
    assert.equal(again.deduped, true);
    assert.equal(again.bets.length, 16);
    assert.equal(again.bet.id, "ufc-332-coria-2");
    assert.equal(again.bet.status, "open");

    const won = settleBet(coria, { id: coria.id, status: "won" }, "2026-10-04T01:00:00.000Z");
    assert.equal(won.bet.realizedPnl, "97.78");
    const stored = seeded.envelope.bets.map((bet) => (bet.id === coria.id ? won.bet : bet));
    const replay = placeBet(stored, { ...post, status: "open", stake: "1.00" }, "2026-10-04T02:00:00.000Z");
    assert.equal(replay.deduped, true);
    assert.equal(replay.bet.status, "won");
    assert.equal(replay.bet.stake, "79.99");
    assert.equal(replay.bet.realizedPnl, "97.78");
    assert.equal(replay.bets.length, 16);

    const renamed = stored.map((bet) =>
      bet.id === coria.id ? { ...bet, id: "posted-coria-2" } : bet,
    );
    const merged = ensureSeededBetsEnvelope(
      { ...seeded.envelope, bets: renamed },
      "2026-10-04T03:00:00.000Z",
    );
    assert.equal(merged.seeded, false);
    assert.equal(merged.envelope.bets.filter((bet) => bet.orderId === CORIA_ORDER).length, 1);
    assert.equal(merged.envelope.bets.find((bet) => bet.orderId === CORIA_ORDER)?.status, "won");
  });

  it("adds a bet already settled and rejects a bad body", () => {
    const fight = fightBySlug("imanol-rodriguez-pillado-vs-alden-coria");
    assert.ok(fight);
    const body = {
      orderId: "new-coria-order",
      id: "ufc-332-coria-settled",
      event: "UFC 332: Silva vs Wang",
      fight: "Imanol Rodriguez Pillado vs Alden Coria",
      fightSlug: fight.slug,
      pick: "Alden Coria",
      stake: "79.99",
      payout: "177.77",
      oddsPct: 43,
      time: "2026-10-03T18:34:00-05:00",
      status: "won",
    };
    const won = placeBet([], parseBetPostBody(body)[0], "2026-10-04T01:00:00.000Z");
    assert.equal(won.deduped, false);
    assert.equal(won.bet.status, "won");
    assert.equal(won.bet.realizedPnl, "97.78");
    assert.equal(won.bet.settledPayout, "177.77");
    assert.equal(won.bet.hubLean, "Alden Coria");
    assert.equal(won.bet.agreesWithLean, true);

    const lost = placeBet(
      [],
      parseBetPostBody({ ...body, orderId: "lost-order", id: "lost-id", status: "lost" })[0],
      "2026-10-04T01:00:00.000Z",
    );
    assert.equal(lost.bet.realizedPnl, "-79.99");
    assert.equal(lost.bet.settledPayout, undefined);

    const voided = placeBet(
      [],
      parseBetPostBody({ ...body, orderId: "void-order", id: "void-id", status: "void" })[0],
      "2026-10-04T01:00:00.000Z",
    );
    assert.equal(voided.bet.realizedPnl, "0.00");

    const batch = parseBetPostBody({ bets: [body, { ...body, orderId: "second-order", id: "second-id", status: "open" }] });
    assert.equal(batch.length, 2);
    assert.equal(parseBetPostBody([body]).length, 1);

    assert.throws(() => parseBetPostBody({ ...body, orderId: "" }));
    assert.throws(() => parseBetPostBody({ ...body, status: "pending" }));
    assert.throws(() => parseBetPostBody({ ...body, stake: "-1.00" }));
    assert.throws(() => parseBetPostBody({ ...body, agreesWithLean: "true" }));
    assert.throws(() => parseBetPostBody({ ...body, time: "2026-10-03 18:34" }));
    assert.throws(() => parseBetPostBody([]));
    assert.throws(() =>
      placeBet(won.bets, parseBetPostBody({ ...body, orderId: "other-order" })[0], "t"),
    );

    const sold = placeBet(
      [],
      parseBetPostBody({
        ...body,
        orderId: "sold-order",
        id: "sold-id",
        status: "sold",
        payout: "13.64",
        stake: "14.54",
      })[0],
      "2026-10-04T01:00:00.000Z",
    );
    assert.equal(sold.bet.status, "sold");
    assert.equal(sold.bet.payout, "13.64");
    assert.equal(sold.bet.realizedPnl, "-0.90");
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

    const corrected = applyStoredBetCorrections(envelope, "2026-10-04T02:00:00.000Z");
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
    assert.equal(keptNolan?.settledPayout, "7.12");
    assert.equal(keptNolan?.realizedPnl, "2.28");
    assert.equal(keptNolan?.correctionVersion, undefined);

    const coria = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-coria");
    const wang = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-wang-cong");
    assert.equal(coria?.stake, "19.99");
    assert.equal(coria?.status, "open");
    assert.equal(coria?.payout, "42.51");
    assert.equal(coria?.settledPayout, undefined);
    assert.equal(coria?.realizedPnl, undefined);
    assert.equal(coria?.correctionVersion, 1);
    assert.equal(wang?.stake, "45.13");
    assert.equal(wang?.status, "open");
    assert.equal(wang?.payout, "118.76");
    assert.equal(wang?.settledPayout, undefined);
    assert.equal(wang?.realizedPnl, undefined);
    assert.equal(wang?.correctionVersion, 1);
    const second = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-coria-2");
    assert.equal(second?.status, "open");
    assert.equal(second?.stake, "79.99");
    assert.equal(second?.payout, "177.77");
    assert.equal(second?.realizedPnl, undefined);
    const gautier = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-gautier");
    assert.equal(gautier?.status, "open");
    assert.equal(gautier?.stake, "9.69");
    assert.equal(gautier?.realizedPnl, undefined);
    const talbott = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-talbott");
    assert.equal(talbott?.status, "open");
    assert.equal(talbott?.correctionVersion, undefined);
    const green = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-green");
    assert.equal(green?.status, "lost");
    assert.equal(green?.stake, "21.31");
    assert.equal(green?.payout, "0.00");
    assert.equal(green?.realizedPnl, "-21.31");
    assert.equal(green?.correctionVersion, undefined);

    const again = applyStoredBetCorrections(corrected.envelope, "2026-10-04T03:00:00.000Z");
    assert.equal(again.changed, false);
    assert.equal(again.envelope.updatedAt, corrected.envelope.updatedAt);

    const edited = replaceBet(
      corrected.envelope,
      { ...sold, payout: "10.00", realizedPnl: "-4.54" },
      "2026-10-04T04:00:00.000Z",
    );
    const held = applyStoredBetCorrections(edited, "2026-10-04T05:00:00.000Z");
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
    const coriaBook = applyStoredBetCorrections(
      replaceBet(seeded.envelope, settledCoria, "2026-10-04T01:00:00.000Z"),
      "2026-10-04T02:00:00.000Z",
    );
    const coriaRow = coriaBook.envelope.bets.find((bet) => bet.id === "ufc-332-coria");
    assert.equal(coriaRow?.status, "lost");
    assert.equal(coriaRow?.stake, "19.99");
    assert.equal(coriaRow?.payout, "42.51");
    assert.equal(coriaRow?.realizedPnl, "-19.99");

    const openAfterStake = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-coria");
    assert.ok(openAfterStake);
    const stakeOnly = applyStoredBetCorrections(
      replaceBet(
        seeded.envelope,
        { ...openAfterStake, stake: "19.99", correctionVersion: 1 },
        "2026-10-04T01:00:00.000Z",
      ),
      "2026-10-04T02:00:00.000Z",
    );
    const closed = stakeOnly.envelope.bets.find((bet) => bet.id === "ufc-332-coria");
    assert.equal(closed?.status, "open");
    assert.equal(closed?.stake, "19.99");
    assert.equal(closed?.correctionVersion, 1);
    assert.equal(closed?.realizedPnl, undefined);
    assert.equal(closed?.payout, "42.51");
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
    assert.equal(stakeOf("ufc-332-coria-2"), "79.99");
    assert.equal(stakeOf("ufc-332-wang-cong"), "45.13");
    assert.equal(bets.some((bet) => bet.id === "ufc-332-wang-cong-2"), false);
    const second = bets.find((bet) => bet.id === "ufc-332-coria-2");
    assert.equal(second?.status, "open");
    assert.equal(second?.payout, "177.77");
    assert.equal(bets.find((bet) => bet.id === "ufc-332-ribovics")?.status, "sold");
    assert.equal(bets.find((bet) => bet.id === "ufc-332-green")?.status, "lost");
    assert.equal(bets.find((bet) => bet.id === "ufc-332-talbott")?.status, "open");
    assert.equal(bets.find((bet) => bet.id === "ufc-332-wang-cong")?.status, "open");
    assert.equal(bets.find((bet) => bet.id === "ufc-332-gautier")?.status, "open");
    assert.equal(bets.filter((bet) => bet.status === "open").length, 14);

    const book = summarizeUfcBook(bets);
    assert.equal(book.count, 16);
    assert.equal(book.totalStaked, "268.44");
    assert.equal(book.realizedPnl, "-22.21");
    assert.equal(book.realizedPnlLabel, "-$22.21");
    assert.equal(book.record, "0-1");
    assert.equal(book.sold, 1);
    assert.equal(book.wins, 0);
    assert.equal(book.losses, 1);
    assert.equal(book.open, 14);
    assert.equal(book.openStake, "232.59");
    assert.equal(book.openPotential, "457.98");

    const card = scoreBets(bets);
    assert.equal(card.founder.record, "0-1");
    assert.equal(card.hub.record, "1-0");
    assert.equal(card.withLean.record, "0-0");
    assert.equal(card.againstLean.record, "0-1");
    assert.equal(card.sold, 1);
    assert.equal(card.open, 14);
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
    assert.equal(
      isBetSettleOverride({ id: won.id, status: "sold", payout: "13.64", stake: "14.54", override: true }),
      true,
    );
    assert.equal(isBetSettleOverride({ id: won.id, status: "sold", payout: "13.64" }), false);
  });

  it("override on a re-post corrects a settled row and a plain replay does not", () => {
    const ribovics = betSeed().find((bet) => bet.id === "ufc-332-ribovics");
    assert.ok(ribovics);
    const won = settleBet(
      ribovics,
      { id: ribovics.id, status: "won", payout: "22.37" },
      "2026-10-04T01:00:00.000Z",
    ).bet;
    const ticket = {
      orderId: ribovics.id,
      id: ribovics.id,
      event: ribovics.event,
      fight: ribovics.fight,
      fightSlug: ribovics.fightSlug,
      pick: ribovics.pick,
      stake: "14.54",
      payout: "13.64",
      oddsPct: ribovics.oddsPct,
      time: "2026-10-03T19:00:00-05:00",
      status: "sold",
    };
    const replay = placeBet([won], parseBetPostBody(ticket)[0], "2026-10-04T02:00:00.000Z");
    assert.equal(replay.deduped, true);
    assert.equal(replay.bet.status, "won");
    assert.equal(replay.bet.payout, "22.37");

    const corrected = placeBet(
      [won],
      parseBetPostBody({ ...ticket, override: true })[0],
      "2026-10-04T02:00:00.000Z",
    );
    assert.equal(corrected.deduped, false);
    assert.equal(corrected.bet.status, "sold");
    assert.equal(corrected.bet.payout, "13.64");
    assert.equal(corrected.bet.stake, "14.54");
    assert.equal(corrected.bet.realizedPnl, "-0.90");
    assert.equal(corrected.bets.length, 1);
    assert.equal(isBetSettleOverride({ ...ticket, override: true }), false);
  });

  it("keeps a non-seed row posted through the API", () => {
    const seeded = ensureSeededBetsEnvelope(null, "2026-10-03T12:00:00.000Z");
    const wang = seeded.envelope.bets.find((bet) => bet.id === "ufc-332-wang-cong");
    assert.ok(wang);
    const extra = {
      ...wang,
      id: "ufc-332-wang-cong-2",
      orderId: "wang-cong-2-order",
      stake: "17.23",
      payout: "44.17",
      status: "open" as const,
      realizedPnl: undefined,
      settledPayout: undefined,
      settledAt: undefined,
      correctionVersion: undefined,
    };
    const stored = { ...seeded.envelope, bets: [...seeded.envelope.bets, extra] };
    const merged = ensureSeededBetsEnvelope(stored, "2026-10-04T02:00:00.000Z");
    assert.equal(merged.seeded, false);
    assert.equal(merged.envelope.bets.filter((bet) => bet.id === "ufc-332-wang-cong-2").length, 1);
    const row = merged.envelope.bets.find((bet) => bet.id === "ufc-332-wang-cong-2");
    assert.equal(row?.stake, "17.23");
    assert.equal(row?.payout, "44.17");
    assert.equal(row?.status, "open");
    const corrected = applyStoredBetCorrections(merged.envelope, "2026-10-04T03:00:00.000Z");
    const kept = corrected.envelope.bets.find((bet) => bet.id === "ufc-332-wang-cong-2");
    assert.equal(kept?.stake, "17.23");
    assert.equal(kept?.status, "open");
    assert.equal(betSeed().some((bet) => bet.id === "ufc-332-wang-cong-2"), false);
  });

  it("keeps an optional tier on post and settle and hides the order id from the public view", () => {
    const body = {
      orderId: "tier-order",
      id: "tier-bet",
      event: "UFC Fight Night: Allen vs Duncan",
      fight: "Brendan Allen vs Christian Leroy Duncan",
      fightSlug: "brendan-allen-vs-christian-leroy-duncan",
      pick: "Brendan Allen",
      stake: "1.00",
      payout: "2.00",
      oddsPct: 50,
      time: "2026-10-10T19:00:00-05:00",
      tier: "strong",
    };
    const placed = placeBet([], parseBetPostBody(body)[0], "2026-10-10T18:00:00.000Z");
    assert.equal(placed.bet.tier, "STRONG");
    const settled = settleBet(placed.bet, { id: placed.bet.id, status: "won", payout: "2.00" }, "2026-10-11T00:00:00.000Z");
    assert.equal(settled.bet.tier, "STRONG");
    assert.equal(settled.bet.status, "won");
    const view = publicBet(settled.bet);
    assert.equal(view.tier, "STRONG");
    assert.equal("orderId" in view, false);
    const roundTrip = parseBetsEnvelope({ bets: [settled.bet] });
    assert.equal(roundTrip?.bets[0]?.tier, "STRONG");
    assert.throws(() => parseBetPostBody({ ...body, tier: "LOCK" }));
    const lean = placeBet([], parseBetPostBody({ ...body, orderId: "lean-order", id: "lean-bet", tier: "LEAN" })[0], "t");
    assert.equal(lean.bet.tier, "LEAN");
  });
});
