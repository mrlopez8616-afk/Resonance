import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "@/data/calendar";
import {
  BANKROLL_AS_OF,
  BANKROLL_FIRST_EVENT,
  BANKROLL_START,
  bankrollHomeFace,
  bankrollRoi,
  betConviction,
  computeBankroll,
  eventInBankroll,
  fightCardDay,
  suggestedStake,
} from "@/lib/bankroll";
import { settleBet, type Bet } from "@/lib/bets";
import { UFC_332_EVENT } from "@/lib/ufc332";

const NOW = "2026-10-11T02:00:00.000Z";

function ticket(overrides: Partial<Bet> & Pick<Bet, "id" | "event" | "stake">): Bet {
  const bet: Bet = {
    id: overrides.id,
    event: overrides.event,
    fight: overrides.fight ?? "Fighter A vs Fighter B",
    fightSlug: overrides.fightSlug ?? "fighter-a-vs-fighter-b",
    pick: overrides.pick ?? "Fighter A",
    stake: overrides.stake,
    oddsPct: overrides.oddsPct ?? 50,
    payout: overrides.payout ?? "2.00",
    status: overrides.status ?? "open",
    venue: "coinbase-predict",
    ticker: "UFC",
    time: overrides.time ?? "2026-10-07T12:18:00-05:00",
  };
  if (overrides.note) bet.note = overrides.note;
  if (overrides.tier) bet.tier = overrides.tier;
  if (overrides.realizedPnl) bet.realizedPnl = overrides.realizedPnl;
  if (overrides.settledPayout) bet.settledPayout = overrides.settledPayout;
  if (overrides.settledAt) bet.settledAt = overrides.settledAt;
  return bet;
}

function allen(overrides: Partial<Bet> & Pick<Bet, "id" | "stake">): Bet {
  return ticket({
    event: BANKROLL_FIRST_EVENT.title,
    fight: "Brendan Allen vs Christian Leroy Duncan",
    fightSlug: "brendan-allen-vs-christian-leroy-duncan",
    time: "2026-10-07T12:18:00-05:00",
    ...overrides,
  });
}

const dwcsCalendar = {
  id: "dwcs-s10-week-9-card",
  lane: "fights",
  start: "2026-10-06T18:00:00-05:00",
  title: "UFC Dana White's Contender Series S10 Week 9: Fight Card, Bierley vs Onley",
  status: "scheduled",
  writer: "founder",
} as CalendarEvent;

const earlyCalendar = {
  id: "ufc-324-card",
  kind: "fight",
  start: "2026-10-09T19:00:00-05:00",
  title: "UFC 324",
  status: "scheduled",
  writer: "founder",
  eventSlug: "ufc-324",
} as CalendarEvent;

const laterCalendar = {
  id: "ufc-325-card",
  kind: "fight",
  start: "2026-10-17T19:00:00-05:00",
  title: "UFC 325: Main Card",
  status: "scheduled",
  writer: "founder",
  eventSlug: "ufc-325",
} as CalendarEvent;

describe("bankroll", () => {
  it("starts at $17.06 and stays there until an in-scope bet settles", () => {
    const open = allen({ id: "allen-open", stake: "17.05", payout: "30.00" });
    const ledger = computeBankroll([open]);
    assert.equal(ledger.start, BANKROLL_START);
    assert.equal(ledger.asOf, BANKROLL_AS_OF);
    assert.equal(BANKROLL_FIRST_EVENT.slug, "ufc-fight-night-allen-vs-duncan");
    assert.equal(BANKROLL_FIRST_EVENT.date, "2026-10-10");
    assert.equal(ledger.bankroll, "17.06");
    assert.equal(ledger.bankrollLabel, "$17.06");
    assert.equal(ledger.atRisk, "17.05");
    assert.equal(ledger.atRiskLabel, "$17.05");
    assert.equal(ledger.cash, "0.01");
    assert.equal(ledger.open, 1);
    assert.equal(ledger.recordLabel, "0-0 · 0 sold · 0 void");
    assert.equal(ledger.roiLabel, "—");
    assert.equal(ledger.suggestedStake, "0.85");
    assert.equal(ledger.suggestedStakeLabel, "$0.85");
    assert.equal(ledger.cards.length, 1);
    assert.equal(ledger.cards[0]?.href, "/fights/ufc-fight-night-allen-vs-duncan");
    assert.equal(ledger.cards[0]?.date, "2026-10-10");
    assert.equal(ledger.cards[0]?.pnlLabel, "$0.00");
    assert.deepEqual(bankrollHomeFace(ledger), {
      headline: "$17.06",
      priceLine: "$17.05 at risk · 1 open",
    });
    assert.equal(fightCardDay(BANKROLL_FIRST_EVENT.slug, BANKROLL_FIRST_EVENT.title, []), "2026-10-10");
  });

  it("adds a win, subtracts a loss, keeps a void at zero, and books a sale as proceeds minus stake", () => {
    const won = settleBet(
      allen({ id: "win", stake: "4.00", payout: "10.00" }),
      { id: "win", status: "won", payout: "10.00" },
      NOW,
    ).bet;
    const lost = settleBet(
      allen({ id: "loss", stake: "2.00", payout: "5.00" }),
      { id: "loss", status: "lost" },
      NOW,
    ).bet;
    const voided = settleBet(
      allen({ id: "void", stake: "3.00", payout: "6.00" }),
      { id: "void", status: "void" },
      NOW,
    ).bet;
    const sold = settleBet(
      allen({ id: "sold", stake: "5.00", payout: "9.00" }),
      { id: "sold", status: "sold", payout: "8.00" },
      NOW,
    ).bet;
    assert.equal(won.realizedPnl, "6.00");
    assert.equal(lost.realizedPnl, "-2.00");
    assert.equal(voided.realizedPnl, "0.00");
    assert.equal(sold.realizedPnl, "3.00");

    const ledger = computeBankroll([won, lost, voided, sold]);
    assert.equal(ledger.bankroll, "24.06");
    assert.equal(ledger.atRisk, "0.00");
    assert.equal(ledger.cash, "24.06");
    assert.equal(ledger.open, 0);
    assert.equal(ledger.recordLabel, "1-1 · 1 sold · 1 void");
    assert.equal(ledger.realizedLabel, "+$7.00");
    assert.equal(ledger.roiLabel, "+50.00%");
    assert.equal(ledger.suggestedStake, "1.20");
    assert.equal(ledger.cards[0]?.recordLabel, "1-1 · 1 sold · 1 void");
    assert.equal(ledger.cards[0]?.pnlLabel, "+$7.00");
  });

  it("uses stored settlement fields when the row already carries realized P/L", () => {
    const sold = allen({
      id: "stored-sold",
      stake: "5.00",
      payout: "8.00",
      status: "sold",
      realizedPnl: "3.00",
      settledPayout: "8.00",
    });
    const lost = allen({
      id: "stored-lost",
      stake: "2.50",
      status: "lost",
      realizedPnl: "-2.50",
    });
    const ledger = computeBankroll([sold, lost]);
    assert.equal(ledger.bankroll, "17.56");
    assert.equal(ledger.realizedLabel, "+$0.50");
    assert.equal(ledger.roiLabel, "+6.67%");
  });

  it("keeps UFC 332, DWCS, and anything before 2026-10-10 out of every total", () => {
    const ufcWin = ticket({
      id: "ufc-win",
      event: UFC_332_EVENT.name,
      fightSlug: "eric-nolan-vs-court-mcgee",
      stake: "4.84",
      payout: "7.12",
      status: "won",
      realizedPnl: "2.28",
      time: "2026-10-03T15:00:00-05:00",
    });
    const dwcsLoss = ticket({
      id: "dwcs-loss",
      event: "Dana White's Contender Series S10 Week 9",
      fight: "Roque Conceicao vs Alexander Chavez",
      fightSlug: "roque-conceicao-vs-alexander-chavez",
      stake: "28.00",
      payout: "52.82",
      status: "lost",
      realizedPnl: "-28.00",
      time: "2026-10-06T12:04:41-05:00",
      tier: "STRONG",
    });
    const earlyWin = ticket({
      id: "early-win",
      event: "UFC 324",
      stake: "10.00",
      payout: "20.00",
      status: "won",
      realizedPnl: "10.00",
      time: "2026-10-09T19:00:00-05:00",
    });
    const laterOpen = ticket({
      id: "later-open",
      event: "UFC 325",
      stake: "1.00",
      payout: "2.00",
      status: "open",
      time: "2026-10-07T12:00:00-05:00",
    });
    const allenOpen = allen({
      id: "allen-open",
      stake: "0.96",
      payout: "1.71",
      note: "UFC Vegas 122, Main card. Tier: LEAN.",
    });
    const ledger = computeBankroll(
      [ufcWin, dwcsLoss, earlyWin, laterOpen, allenOpen],
      [dwcsCalendar, earlyCalendar, laterCalendar],
    );

    assert.equal(eventInBankroll("2026-10-09"), false);
    assert.equal(eventInBankroll("2026-10-10"), true);
    assert.equal(eventInBankroll(null), false);
    assert.equal(fightCardDay("ufc-332", UFC_332_EVENT.name, []), "2026-10-03");
    assert.equal(
      fightCardDay("dana-white-s-contender-series-s10-week-9", dwcsLoss.event, [dwcsCalendar]),
      "2026-10-06",
    );
    assert.equal(fightCardDay("ufc-324", "UFC 324", [earlyCalendar]), "2026-10-09");
    assert.equal(fightCardDay("ufc-325", "UFC 325", [laterCalendar]), "2026-10-17");
    assert.equal(fightCardDay("ufc-3", "UFC 3", [laterCalendar]), null);

    assert.equal(ledger.bankroll, "17.06");
    assert.equal(ledger.atRisk, "1.96");
    assert.equal(ledger.cash, "15.10");
    assert.equal(ledger.open, 2);
    assert.equal(ledger.recordLabel, "0-0 · 0 sold · 0 void");
    assert.equal(ledger.roiLabel, "—");
    assert.equal(ledger.realizedLabel, "$0.00");
    assert.deepEqual(
      ledger.cards.map((card) => card.slug),
      ["ufc-fight-night-allen-vs-duncan", "ufc-325"],
    );
    assert.deepEqual(
      ledger.before.map((card) => card.slug),
      ["ufc-332", "dana-white-s-contender-series-s10-week-9", "ufc-324"],
    );
    assert.equal(ledger.before.find((card) => card.slug === "ufc-332")?.pnlLabel, "+$2.28");
    assert.equal(
      ledger.before.find((card) => card.slug === "dana-white-s-contender-series-s10-week-9")?.pnlLabel,
      "-$28.00",
    );
    assert.equal(ledger.tiers.find((tier) => tier.id === "STRONG")?.atRiskLabel, "$0.00");
    assert.equal(ledger.tiers.find((tier) => tier.id === "LEAN")?.open, 1);
    assert.equal(ledger.tiers.find((tier) => tier.id === "LEAN")?.atRiskLabel, "$0.96");
  });

  it("rounds a 5% stake to cents and dashes ROI until a stake has settled", () => {
    assert.equal(suggestedStake("17.06"), "0.85");
    assert.equal(suggestedStake("23.06"), "1.15");
    assert.equal(suggestedStake("0.10"), "0.01");
    assert.equal(suggestedStake("0.09"), "0.00");
    assert.equal(suggestedStake("-17.06"), "-0.85");
    assert.equal(bankrollRoi("0.00", "0.00"), null);
    assert.equal(bankrollRoi("6.00", "4.00"), "+150.00%");
    assert.equal(bankrollRoi("4.00", "6.00"), "+66.67%");
    assert.equal(bankrollRoi("-2.00", "4.00"), "-50.00%");
    assert.equal(bankrollRoi("0.00", "3.00"), "0.00%");

    const openOnly = computeBankroll([allen({ id: "open", stake: "1.00", status: "open" })]);
    assert.equal(openOnly.roiLabel, "—");
    assert.equal(openOnly.suggestedStake, "0.85");
  });

  it("splits STRONG and LEAN from the tier field, then from the ticket note, and leaves the rest untiered", () => {
    const strong = allen({
      id: "strong",
      stake: "3.85",
      status: "won",
      payout: "5.06",
      realizedPnl: "1.21",
      note: "Tier: LEAN.",
      tier: "STRONG",
    });
    const lean = allen({
      id: "lean",
      stake: "0.96",
      status: "lost",
      payout: "1.71",
      realizedPnl: "-0.96",
      note: "Main card. Tier: LEAN.",
    });
    const plain = allen({
      id: "plain",
      stake: "0.95",
      note: "Prelims. Tier: none.",
    });
    assert.equal(betConviction(strong), "STRONG");
    assert.equal(betConviction(lean), "LEAN");
    assert.equal(betConviction(plain), null);

    const ledger = computeBankroll([strong, lean, plain]);
    const byId = Object.fromEntries(ledger.tiers.map((tier) => [tier.id, tier]));
    assert.equal(byId.STRONG?.recordLabel, "1-0 · 0 sold · 0 void");
    assert.equal(byId.STRONG?.pnlLabel, "+$1.21");
    assert.equal(byId.LEAN?.recordLabel, "0-1 · 0 sold · 0 void");
    assert.equal(byId.LEAN?.pnlLabel, "-$0.96");
    assert.equal(byId.untiered?.recordLabel, "0-0 · 0 sold · 0 void");
    assert.equal(byId.untiered?.pnlLabel, "$0.00");
    assert.equal(byId.untiered?.atRiskLabel, "$0.95");
    assert.equal(byId.untiered?.open, 1);
    assert.equal(ledger.bankroll, "17.31");
    assert.equal(ledger.roiLabel, "+5.20%");
  });
});
