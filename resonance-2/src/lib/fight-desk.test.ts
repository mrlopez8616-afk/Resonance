import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "@/data/calendar";
import { betSeed, cardMoney, summarizeBets, type Bet } from "@/lib/bets";
import {
  betsForEventSlug,
  eventBackHref,
  eventBoutSections,
  eventSlugFromTitle,
  fightEventKind,
  fightLinkTargets,
  fightPromotions,
  knownBouts,
  legacyFightNodeHref,
  resolveFightEventPage,
  segmentHint,
} from "@/lib/fight-desk";
import { calendarFightHref, fightPageHref } from "@/lib/fight-pages";
import { fightsInSegment, UFC_332_ID } from "@/lib/ufc332";

const DWCS_EVENT = "Dana White's Contender Series S10 Week 9";
const NOW = new Date("2026-10-07T18:00:00-05:00");

function dwcsBet(stake = "61.81"): Bet {
  const base = betSeed()[0];
  assert.ok(base);
  return {
    ...base,
    id: "dwcs-2026-10-06-a",
    event: DWCS_EVENT,
    fight: "Fighter A vs Fighter B",
    fightSlug: "fighter-a-vs-fighter-b",
    pick: "Fighter A",
    stake,
    payout: "100.00",
    status: "open",
    realizedPnl: undefined,
    settledPayout: undefined,
    settledAt: undefined,
    correctionVersion: undefined,
  };
}

function settledCopy(bet: Bet, status: "won" | "lost" | "sold", pnl: string): Bet {
  return {
    ...bet,
    status,
    realizedPnl: pnl,
    settledPayout: status === "lost" ? "0.00" : bet.payout,
    settledAt: "2026-10-06T23:00:00-05:00",
  };
}

const dwcsCalendar = {
  id: "dwcs-s10-week-9-card",
  kind: "fight",
  start: "2026-10-06T20:00:00-05:00",
  title: DWCS_EVENT,
  status: "scheduled",
  writer: "founder",
  eventSlug: "dwcs-s10-week-9",
} as CalendarEvent;

describe("fight promotions", () => {
  it("files UFC cards under UFC and DWCS under Contender Series", () => {
    const bets = [...betSeed(), dwcsBet()];
    const promotions = fightPromotions({ bets, events: [dwcsCalendar], now: NOW });
    assert.deepEqual(
      promotions.map((promotion) => promotion.label),
      ["UFC", "Contender Series"],
    );
    const ufc = promotions[0];
    const series = promotions[1];
    assert.ok(ufc && series);
    assert.equal(ufc.href, "/fights/ufc");
    assert.equal(series.href, "/fights/contender-series");
    assert.equal(ufc.events.some((event) => event.slug === UFC_332_ID), true);
    assert.equal(series.events.length, 1);
    assert.equal(series.events[0]?.slug, "dwcs-s10-week-9");
    assert.equal(series.events[0]?.href, "/fights/dwcs-s10-week-9");
    assert.equal(
      ufc.events.some((event) => event.slug === "dwcs-s10-week-9"),
      false,
    );
    const card = ufc.events.find((event) => event.slug === UFC_332_ID);
    const layout = eventBoutSections(card?.fights ?? []);
    assert.equal(layout.kind, "sections");
    if (layout.kind !== "sections") return;
    assert.deepEqual(
      layout.sections.map((section) => section.id),
      ["early-prelims", "prelims", "main-card"],
    );
    assert.deepEqual(
      layout.sections.find((section) => section.id === "early-prelims")?.fights.map((fight) => fight.slug),
      fightsInSegment("early-prelims").map((fight) => fight.slug),
    );
    assert.deepEqual(
      layout.sections.find((section) => section.id === "prelims")?.fights.map((fight) => fight.slug),
      fightsInSegment("prelims").map((fight) => fight.slug),
    );
    assert.deepEqual(
      layout.sections.find((section) => section.id === "main-card")?.fights.map((fight) => fight.slug),
      fightsInSegment("main-card").map((fight) => fight.slug),
    );
    assert.equal(layout.sections[0]?.fights[0]?.boutOrder, 1);
    assert.equal(
      layout.sections.at(-1)?.fights.at(-1)?.slug,
      "natalia-silva-vs-wang-cong",
    );
    assert.equal(eventBackHref("ufc-332").href, "/fights/ufc");
    assert.equal(eventBackHref("dwcs-s10-week-9", { title: DWCS_EVENT }).href, "/fights/contender-series");
    assert.equal(legacyFightNodeHref("main-card"), "/fights/ufc");
    assert.equal(legacyFightNodeHref("prelims"), "/fights/ufc");
    assert.equal(resolveFightEventPage("main-card", bets, [dwcsCalendar]), null);
    assert.equal(resolveFightEventPage("prelims", bets, [dwcsCalendar]), null);
  });

  it("sums an event from that event only and leads a settled card with P/L", () => {
    const openDwcs = dwcsBet("12.00");
    const settled = [
      settledCopy({ ...openDwcs, id: "dwcs-w1", stake: "4.76", payout: "11.60" }, "won", "6.84"),
      settledCopy({ ...openDwcs, id: "dwcs-w2", stake: "4.86", payout: "6.23" }, "won", "1.37"),
      settledCopy({ ...openDwcs, id: "dwcs-l1", stake: "28.00", payout: "52.82" }, "lost", "-28.00"),
      settledCopy({ ...openDwcs, id: "dwcs-l2", stake: "4.87", payout: "6.01" }, "lost", "-4.87"),
      settledCopy({ ...openDwcs, id: "dwcs-l3", stake: "4.78", payout: "10.39" }, "lost", "-4.78"),
    ];
    const bets = [...betSeed(), ...settled];
    const dwcs = betsForEventSlug(bets, "dwcs-s10-week-9", [dwcsCalendar]);
    assert.equal(cardMoney(dwcs).headline, "-$29.44");
    assert.equal(cardMoney(dwcs).detail, "2-3");
    const page = resolveFightEventPage("dwcs-s10-week-9", bets, [dwcsCalendar]);
    assert.equal(page?.kind, "listed");
    assert.equal(eventBoutSections(page && "fights" in page ? page.fights : []).kind, "list");
    const promotions = fightPromotions({ bets, events: [dwcsCalendar], now: NOW });
    const series = promotions.find((promotion) => promotion.id === "contender-series");
    const seriesBets = series?.events.flatMap((event) => event.bets) ?? [];
    assert.equal(cardMoney(seriesBets).headline, "-$29.44");
    assert.equal(cardMoney(seriesBets).detail, "2-3");
    assert.equal(cardMoney([]).headline, "No bets");
    assert.equal(cardMoney([]).detail, "");

    const sold = settledCopy({ ...openDwcs, id: "dwcs-sold", stake: "12.00", payout: "13.00" }, "sold", "1.00");
    const soldBook = cardMoney([sold, settled[0], settled[2]].filter((bet): bet is Bet => Boolean(bet)));
    assert.equal(soldBook.detail.includes("sold"), true);
    assert.equal(soldBook.detail.startsWith("1-1"), true);
    assert.equal(summarizeBets(dwcs).open, 0);
  });

  it("splits a fight night by note and calendar hints and keeps the back link on UFC", () => {
    const fightNight = dwcsBet("10.00");
    fightNight.id = "fn-allen";
    fightNight.event = "UFC Fight Night: Allen vs Duncan";
    fightNight.fight = "Brendan Allen vs Christian Leroy Duncan";
    fightNight.fightSlug = "brendan-allen-vs-christian-leroy-duncan";
    fightNight.pick = "Brendan Allen";
    fightNight.note = "UFC Vegas 122, Main card (main event).";
    const prelim = dwcsBet("3.85");
    prelim.id = "fn-franco";
    prelim.event = fightNight.event;
    prelim.fight = "Felipe Franco vs Brendson Ribeiro";
    prelim.fightSlug = "felipe-franco-vs-brendson-ribeiro";
    prelim.pick = "Felipe Franco";
    prelim.note = "UFC Vegas 122, Prelims. Tier: STRONG.";
    const numbered = dwcsBet("4.00");
    numbered.id = "ufc-325-a";
    numbered.event = "UFC 325";
    numbered.fight = "Fighter C vs Fighter D";
    numbered.fightSlug = "fighter-c-vs-fighter-d";
    numbered.time = "2026-10-17T19:00:00-05:00";
    const bets = [...betSeed(), dwcsBet(), fightNight, prelim, numbered];
    const promotions = fightPromotions({ bets, events: [dwcsCalendar], now: NOW });
    const ufc = promotions[0];
    const series = promotions[1];
    assert.ok(ufc && series);
    assert.equal(fightEventKind({ slug: "ufc-fight-night-allen-vs-duncan", title: fightNight.event }), "ufc");
    assert.equal(fightEventKind({ slug: "dwcs-s10-week-9", title: DWCS_EVENT }), "contender");
    assert.equal(ufc.events.some((event) => event.slug === "ufc-fight-night-allen-vs-duncan"), true);
    assert.equal(ufc.events.some((event) => event.slug === "ufc-325"), true);
    assert.equal(series.events.some((event) => event.slug === "ufc-fight-night-allen-vs-duncan"), false);
    assert.equal(
      ufc.events.find((event) => event.slug === "ufc-fight-night-allen-vs-duncan")?.href,
      "/fights/ufc-fight-night-allen-vs-duncan",
    );
    assert.equal(eventBackHref("ufc-fight-night-allen-vs-duncan").href, "/fights/ufc");
    assert.equal(eventBackHref("ufc-332").href, "/fights/ufc");
    assert.equal(eventBackHref("dwcs-s10-week-9", { title: DWCS_EVENT }).href, "/fights/contender-series");
    const night = ufc.events.find((event) => event.slug === "ufc-fight-night-allen-vs-duncan");
    const layout = eventBoutSections(night?.fights ?? []);
    assert.equal(layout.kind, "sections");
    if (layout.kind === "sections") {
      assert.deepEqual(
        layout.sections.find((section) => section.id === "main-card")?.fights.map((fight) => fight.slug),
        ["brendan-allen-vs-christian-leroy-duncan"],
      );
      assert.deepEqual(
        layout.sections.find((section) => section.id === "prelims")?.fights.map((fight) => fight.slug),
        ["felipe-franco-vs-brendson-ribeiro"],
      );
    }
    assert.equal(segmentHint("Main card (co-main)"), "main-card");
    assert.equal(segmentHint("Prelims (top)"), "prelims");
    assert.equal(segmentHint("Early prelims"), "early-prelims");
    assert.equal(segmentHint("Early prelims moved from main card"), "early-prelims");
    assert.equal(segmentHint("DWCS S10 Wk9"), null);
    const page = resolveFightEventPage("ufc-fight-night-allen-vs-duncan", bets, [dwcsCalendar]);
    assert.equal(page && "bets" in page ? cardMoney(page.bets).headline : "", "$13.85");
    assert.equal(page && "bets" in page ? cardMoney(page.bets).detail : "", "2 open");
    const ufcBets = ufc.events.flatMap((event) => event.bets);
    const ufcFace = cardMoney(ufcBets);
    assert.equal(ufcFace.headline, summarizeBets(ufcBets).stakedLabel);
    assert.match(ufcFace.detail, /^\d+ open/);

    const oct10Prelims = {
      id: "fights-2026-10-10-prelims",
      kind: "fight",
      lane: "fights",
      start: "2026-10-10T16:00:00-05:00",
      title: "UFC Fight Night Oct 10: Prelims",
      status: "scheduled",
      writer: "agent",
    } as CalendarEvent;
    const oct10Main = {
      id: "fights-2026-10-10-main",
      kind: "fight",
      lane: "fights",
      start: "2026-10-10T19:00:00-05:00",
      title: "UFC Fight Night Oct 10: Main Card, Allen vs Duncan",
      status: "scheduled",
      writer: "agent",
    } as CalendarEvent;
    const oct17 = {
      id: "fights-2026-10-17-prelims",
      kind: "fight",
      lane: "fights",
      start: "2026-10-17T16:00:00-05:00",
      title: "UFC Fight Night Edmonton Oct 17: Prelims",
      status: "scheduled",
      writer: "agent",
    } as CalendarEvent;
    const calendar = [dwcsCalendar, oct10Prelims, oct10Main, oct17];
    const ordered = fightPromotions({ bets, events: calendar, now: NOW })[0]?.events.map((event) => event.slug);
    assert.deepEqual(ordered, ["ufc-fight-night-allen-vs-duncan", "ufc-325", UFC_332_ID]);
    const targets = fightLinkTargets(bets, calendar);
    assert.equal(calendarFightHref(oct10Main, { events: calendar, targets }), "/fights/ufc-fight-night-allen-vs-duncan");
    assert.equal(
      calendarFightHref(oct10Prelims, { events: calendar, targets }),
      "/fights/ufc-fight-night-allen-vs-duncan",
    );
    assert.equal(calendarFightHref(oct17, { events: calendar, targets }), undefined);
    assert.equal(eventSlugFromTitle(DWCS_EVENT), "dana-white-s-contender-series-s10-week-9");
    assert.equal(fightPageHref(dwcsCalendar), "/fights/dwcs-s10-week-9");
    const bout = knownBouts(bets, calendar).find((row) => row.event === "ufc-fight-night-allen-vs-duncan");
    assert.deepEqual(bout?.fighters, ["Brendan Allen", "Christian Leroy Duncan"]);
  });
});
