import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "@/data/calendar";
import { betSeed, summarizeBets, type Bet } from "@/lib/bets";
import {
  betsForEventSlug,
  betsForNode,
  eventBackHref,
  eventSlugFromTitle,
  fightDeskNodes,
  fightEventKind,
  fightLinkTargets,
  knownBouts,
  resolveFightEventPage,
} from "@/lib/fight-desk";
import { calendarFightHref, fightPageHref } from "@/lib/fight-pages";
import { fightsInSegment, UFC_332_ID } from "@/lib/ufc332";

const DWCS_EVENT = "Dana White's Contender Series S10 Week 9";

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

const dwcsCalendar = {
  id: "dwcs-s10-week-9-card",
  kind: "fight",
  start: "2026-10-06T20:00:00-05:00",
  title: DWCS_EVENT,
  status: "scheduled",
  writer: "founder",
  eventSlug: "dwcs-s10-week-9",
} as CalendarEvent;

describe("fight desk nodes", () => {
  it("splits UFC 332 by card segment and keeps Contender Series bets on their event", () => {
    const bets = [...betSeed(), dwcsBet()];
    const nodes = fightDeskNodes({ bets, events: [dwcsCalendar] });
    assert.deepEqual(
      nodes.map((node) => node.label),
      ["Main Card", "Prelims", "Contender Series"],
    );
    const main = nodes[0];
    const prelims = nodes[1];
    const series = nodes[2];
    assert.ok(main && prelims && series);
    assert.deepEqual(
      main.events[0]?.fights.map((fight) => fight.slug),
      fightsInSegment("main-card").map((fight) => fight.slug),
    );
    assert.deepEqual(
      prelims.events[0]?.fights.map((fight) => fight.slug),
      [...fightsInSegment("early-prelims"), ...fightsInSegment("prelims")].map((fight) => fight.slug),
    );
    assert.equal(
      main.events[0]?.fights.some((fight) =>
        fightsInSegment("early-prelims").some((row) => row.slug === fight.slug),
      ),
      false,
    );
    assert.equal(series.events.length, 1);
    assert.equal(series.events[0]?.slug, "dwcs-s10-week-9");
    assert.equal(series.events[0]?.title, DWCS_EVENT);
    assert.equal(main.href, "/fights/main-card");
    assert.equal(prelims.href, "/fights/prelims");
    assert.equal(series.href, "/fights/contender-series");
    assert.equal(main.events[0]?.href, "/fights/ufc-332?node=main-card");
    assert.equal(prelims.events[0]?.href, "/fights/ufc-332?node=prelims");
    assert.equal(series.events[0]?.href, "/fights/dwcs-s10-week-9?node=contender-series");
    assert.equal(series.events[0]?.fights[0]?.bets[0]?.id, "dwcs-2026-10-06-a");
    assert.equal(
      main.events[0]?.fights.some((fight) => fight.bets.some((bet) => bet.id.startsWith("dwcs-"))),
      false,
    );
  });

  it("sums an event page from that event only", () => {
    const bets = [...betSeed(), dwcsBet("61.81")];
    const ufc = betsForEventSlug(bets, UFC_332_ID, [dwcsCalendar]);
    const dwcs = betsForEventSlug(bets, "dwcs-s10-week-9", [dwcsCalendar]);
    assert.equal(summarizeBets(bets).staked, "305.70");
    assert.equal(summarizeBets(ufc).staked, "243.89");
    assert.equal(summarizeBets(dwcs).staked, "61.81");
    assert.equal(ufc.some((bet) => bet.id.startsWith("dwcs-")), false);

    const page = resolveFightEventPage("dwcs-s10-week-9", bets, [dwcsCalendar]);
    assert.equal(page?.kind, "listed");
    assert.equal(page?.title, DWCS_EVENT);
    assert.equal(page && "bets" in page ? summarizeBets(page.bets).staked : "", "61.81");
    assert.equal(resolveFightEventPage("ufc-332", bets, [dwcsCalendar])?.kind, "ufc-332");
    assert.equal(resolveFightEventPage("main-card", bets, [dwcsCalendar]), null);
    assert.equal(resolveFightEventPage("not-a-card", bets, [dwcsCalendar]), null);
    assert.equal(eventBackHref("ufc-332", "prelims").href, "/fights/prelims");
    assert.equal(eventBackHref("ufc-332", null).href, "/fights/main-card");
    assert.equal(eventBackHref("dwcs-s10-week-9", null).href, "/fights/contender-series");
    const mainOpen = summarizeBets(betsForNode(bets, "main-card", [dwcsCalendar])).staked;
    const prelimOpen = summarizeBets(betsForNode(bets, "prelims", [dwcsCalendar])).staked;
    const seriesOpen = summarizeBets(betsForNode(bets, "contender-series", [dwcsCalendar])).staked;
    assert.equal(seriesOpen, "61.81");
    assert.equal(mainOpen === "61.81" || prelimOpen === "61.81", false);
    assert.equal(
      betsForNode(bets, "contender-series", [dwcsCalendar]).every((bet) => bet.id.startsWith("dwcs-")),
      true,
    );
    assert.equal(eventSlugFromTitle(DWCS_EVENT), "dana-white-s-contender-series-s10-week-9");
    assert.equal(fightPageHref(dwcsCalendar), "/fights/dwcs-s10-week-9");
  });

  it("files UFC Fight Night on the UFC side and leaves DWCS on Contender Series", () => {
    const fightNight = dwcsBet("10.00");
    fightNight.id = "fn-allen";
    fightNight.event = "UFC Fight Night: Allen vs Duncan";
    fightNight.fight = "Brendan Allen vs Christian Leroy Duncan";
    fightNight.fightSlug = "brendan-allen-vs-christian-leroy-duncan";
    fightNight.pick = "Brendan Allen";
    const numbered = dwcsBet("4.00");
    numbered.id = "ufc-325-a";
    numbered.event = "UFC 325";
    numbered.fight = "Fighter C vs Fighter D";
    numbered.fightSlug = "fighter-c-vs-fighter-d";
    const bets = [...betSeed(), dwcsBet(), fightNight, numbered];
    const nodes = fightDeskNodes({ bets, events: [dwcsCalendar] });
    const main = nodes[0];
    const prelims = nodes[1];
    const series = nodes[2];
    assert.ok(main && prelims && series);
    assert.equal(fightEventKind({ slug: "ufc-fight-night-allen-vs-duncan", title: fightNight.event }), "ufc");
    assert.equal(fightEventKind({ slug: "ufc-332" }), "ufc");
    assert.equal(fightEventKind({ slug: "dwcs-s10-week-9", title: DWCS_EVENT }), "contender");
    assert.equal(fightEventKind({ slug: "dana-white-s-contender-series-s10-week-9" }), "contender");
    assert.equal(
      main.events.some((event) => event.slug === "ufc-fight-night-allen-vs-duncan"),
      true,
    );
    assert.equal(main.events.some((event) => event.slug === "ufc-325"), true);
    assert.equal(
      main.events.find((event) => event.slug === "ufc-fight-night-allen-vs-duncan")?.href,
      "/fights/ufc-fight-night-allen-vs-duncan?node=main-card",
    );
    assert.equal(series.events.some((event) => event.slug === "ufc-fight-night-allen-vs-duncan"), false);
    assert.equal(series.events.some((event) => event.slug === "ufc-325"), false);
    assert.equal(series.events[0]?.slug, "dwcs-s10-week-9");
    assert.equal(eventBackHref("ufc-fight-night-allen-vs-duncan", null).href, "/fights/main-card");
    assert.equal(
      eventBackHref("ufc-fight-night-allen-vs-duncan", "contender-series").href,
      "/fights/main-card",
    );
    assert.equal(eventBackHref("ufc-fight-night-allen-vs-duncan", "prelims").href, "/fights/prelims");
    assert.equal(eventBackHref("dwcs-s10-week-9", "main-card").href, "/fights/contender-series");
    assert.equal(eventBackHref("ufc-332", null).href, "/fights/main-card");
    const mainStake = summarizeBets(betsForNode(bets, "main-card", [dwcsCalendar])).staked;
    const seriesStake = summarizeBets(betsForNode(bets, "contender-series", [dwcsCalendar])).staked;
    assert.equal(seriesStake, "61.81");
    assert.equal(
      betsForNode(bets, "main-card", [dwcsCalendar]).some((bet) => bet.id === "fn-allen"),
      true,
    );
    assert.equal(
      betsForNode(bets, "contender-series", [dwcsCalendar]).some((bet) => bet.id === "fn-allen"),
      false,
    );
    assert.equal(mainStake === seriesStake, false);
    const page = resolveFightEventPage("ufc-fight-night-allen-vs-duncan", bets, [dwcsCalendar]);
    assert.equal(page?.kind, "listed");
    assert.equal(page && "bets" in page ? summarizeBets(page.bets).staked : "", "10.00");

    const prelimsOnly = {
      ...dwcsCalendar,
      id: "ufc-prelims-only",
      title: "UFC 400 prelims",
      eventSlug: "ufc-400",
    } as CalendarEvent;
    assert.equal(
      eventBackHref("ufc-400", null, { title: "UFC 400 prelims", events: [prelimsOnly] }).href,
      "/fights/prelims",
    );

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
    const targets = fightLinkTargets(bets, calendar);
    assert.equal(
      calendarFightHref(oct10Main, { events: calendar, targets }),
      "/fights/ufc-fight-night-allen-vs-duncan?node=main-card",
    );
    assert.equal(
      calendarFightHref(oct10Prelims, { events: calendar, targets }),
      "/fights/ufc-fight-night-allen-vs-duncan",
    );
    assert.equal(calendarFightHref(oct17, { events: calendar, targets }), undefined);
    const bout = knownBouts(bets, calendar).find(
      (row) => row.event === "ufc-fight-night-allen-vs-duncan",
    );
    assert.deepEqual(bout?.fighters, ["Brendan Allen", "Christian Leroy Duncan"]);
  });
});
