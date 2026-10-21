import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "@/data/calendar";
import type { Bet } from "@/lib/bets";
import { listCalendarEvents } from "@/lib/calendar-store-core";
import { fightPromotions } from "@/lib/fight-desk";
import {
  BUCKLEY_EVENT_SLUG,
  BUCKLEY_EVENT_TITLE,
  canonicalEventSlug,
  isEdmontonAlias,
} from "@/lib/fight-event-alias";

const NOW = new Date("2026-10-18T18:00:00Z");
const START = "2026-10-17T23:00:00Z";

function bet(id: string, event: string): Bet {
  return {
    id,
    event,
    fight: "A One vs B Two",
    fightSlug: "a-one-vs-b-two",
    pick: "A One",
    stake: "1.00",
    oddsPct: 55,
    payout: "1.80",
    status: "open",
    venue: "coinbase-predict",
    ticker: "UFC",
    time: "2026-10-17T18:00:00-05:00",
  };
}

function row(id: string, title: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    kind: "fight",
    lane: "fights",
    start: START,
    title,
    status: "scheduled",
    writer: "agent",
    ...extra,
  };
}

describe("Edmonton alias", () => {
  it("maps the venue copy onto Buckley and leaves a real bout alone", () => {
    assert.equal(isEdmontonAlias("ufc-edmonton"), true);
    assert.equal(isEdmontonAlias("UFC Fight Night: Edmonton"), true);
    assert.equal(isEdmontonAlias("UFC Fight Night Edmonton Oct 17: Prelims"), true);
    assert.equal(isEdmontonAlias("edmonton"), true);
    assert.equal(isEdmontonAlias(BUCKLEY_EVENT_TITLE), false);
    assert.equal(isEdmontonAlias("UFC Fight Night: Silva vs Wang"), false);
    assert.equal(canonicalEventSlug("ufc-edmonton"), BUCKLEY_EVENT_SLUG);
    assert.equal(canonicalEventSlug("UFC Fight Night: Edmonton"), BUCKLEY_EVENT_SLUG);
    assert.equal(canonicalEventSlug("ufc-325"), "ufc-325");
  });

  it("shows one Buckley card when the Edmonton slug and a same-day venue card are present", () => {
    const events = [
      row("buck", BUCKLEY_EVENT_TITLE, {
        eventSlug: BUCKLEY_EVENT_SLUG,
        location: "Rogers Place, Edmonton",
      }),
      row("ed", "UFC Edmonton", { eventSlug: "ufc-edmonton", location: "Rogers Place" }),
      row("rogers", "UFC Fight Night", {
        eventSlug: "rogers-place-card",
        location: "Rogers Place, Edmonton",
      }),
      row("silva", "UFC Fight Night: Silva vs Wang", {
        eventSlug: "ufc-fight-night-silva-vs-wang",
        location: "Las Vegas",
      }),
    ];
    const cards = fightPromotions({
      bets: [bet("buck-bet", BUCKLEY_EVENT_TITLE), bet("ed-bet", "UFC Fight Night: Edmonton")],
      events,
      now: NOW,
    })
      .flatMap((promotion) => promotion.events)
      .filter((event) => event.slug !== "ufc-332");
    assert.deepEqual(
      cards.map((event) => event.slug).sort(),
      [BUCKLEY_EVENT_SLUG, "ufc-fight-night-silva-vs-wang"].sort(),
    );
    const buckley = cards.find((event) => event.slug === BUCKLEY_EVENT_SLUG);
    assert.equal(buckley?.title, BUCKLEY_EVENT_TITLE);
    assert.deepEqual(buckley?.bets.map((ticket) => ticket.id).sort(), ["buck-bet", "ed-bet"]);
  });

  it("folds the Edmonton calendar row into Buckley and keeps UFC 333 sessions", () => {
    const folded = listCalendarEvents([
      row("buck", BUCKLEY_EVENT_TITLE, { eventSlug: BUCKLEY_EVENT_SLUG }),
      row("ed", "UFC Edmonton", { eventSlug: "ufc-edmonton", location: "Rogers Place" }),
      row("pre", "UFC Fight Night Edmonton Oct 17: Prelims"),
    ]);
    assert.equal(folded.some((event) => event.id === "ed"), false);
    assert.equal(folded.some((event) => event.id === "pre"), false);
    assert.equal(folded.find((event) => event.id === "buck")?.location, "Rogers Place");

    const alone = listCalendarEvents([row("pre", "UFC Fight Night Edmonton Oct 17: Prelims")]);
    assert.equal(alone.some((event) => event.id === "pre"), true);

    const sessions = ["early prelims", "prelims", "main card"].map((session, index) =>
      row(`ufc-333-${index}`, `UFC 333 ${session}`, {
        eventSlug: "ufc-333",
        start: `2026-10-24T${15 + index * 2}:00:00-05:00`,
      }),
    );
    const listed = listCalendarEvents(sessions);
    assert.equal(listed.filter((event) => event.eventSlug === "ufc-333").length, 3);
  });
});
