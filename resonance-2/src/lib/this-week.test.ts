import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CalendarEvent } from "@/data/calendar";
import { THIS_WEEK_LIMIT, thisWeekItems } from "./this-week";

const NOW = new Date("2026-10-08T15:00:00.000Z");

function row(partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "start" | "title">): CalendarEvent {
  return {
    status: "scheduled",
    writer: "agent",
    ...partial,
  };
}

describe("this week strip", () => {
  it("returns nothing when the window is empty", () => {
    assert.deepEqual(thisWeekItems([], NOW), []);
    assert.deepEqual(
      thisWeekItems(
        [
          row({
            id: "old",
            start: "2026-10-03T19:00:00-05:00",
            title: "UFC 332 main card",
            kind: "fight",
            eventSlug: "ufc-332",
          }),
        ],
        NOW,
      ),
      [],
    );
  });

  it("keeps the next four upcoming items, soonest first, and drops the rest", () => {
    const items = thisWeekItems(
      [
        row({
          id: "cadence-daily-brief",
          lane: "cadence",
          start: "2026-09-21T07:00:00-05:00",
          title: "Daily Brief",
          recurrence: { freq: "weekdays", timeZone: "America/Chicago", time: "07:00" },
        }),
        row({
          id: "fight-main",
          kind: "fight",
          start: "2026-10-10T19:00:00-05:00",
          title: "UFC Fight Night Oct 10: Main Card, Allen vs Duncan",
          eventSlug: "ufc-fight-night-allen-vs-duncan",
          link: "https://www.ufc.com/event/ufc-fight-night-october-10-2026",
        }),
        row({
          id: "cpi",
          kind: "catalyst",
          node: "MACRO",
          start: "2026-10-11T00:00:00-05:00",
          title: "CPI",
          allDay: true,
          status: "confirmed",
        }),
        row({
          id: "evernorth",
          lane: "capital",
          start: "2026-10-12T08:00:00-05:00",
          title: "Evernorth",
          link: "/n/crypto/xrp",
        }),
        row({
          id: "later",
          kind: "fight",
          start: "2026-10-13T18:00:00-05:00",
          title: "Contender Series",
          link: "https://example.com/card",
        }),
        row({
          id: "history-fill",
          lane: "capital",
          start: "2026-10-09T09:00:00-05:00",
          title: "XRP buy 1",
          status: "history",
        }),
        row({
          id: "far",
          kind: "fight",
          start: "2026-10-20T19:00:00-05:00",
          title: "UFC later",
        }),
        row({
          id: "span",
          kind: "catalyst",
          node: "MACRO",
          start: "2026-10-07T00:00:00-05:00",
          end: "2026-10-12",
          title: "Already underway",
          allDay: true,
          status: "confirmed",
        }),
        row({
          id: "blank",
          start: "2026-10-09T12:00:00-05:00",
          title: "   ",
        }),
      ],
      NOW,
    );
    assert.equal(THIS_WEEK_LIMIT, 4);
    assert.deepEqual(
      items.map((item) => item.title),
      [
        "Daily Brief",
        "UFC Fight Night Oct 10: Main Card, Allen vs Duncan",
        "CPI",
        "Daily Brief",
      ],
    );
    assert.deepEqual(
      items.map((item) => item.when),
      ["Fri 9 Oct", "Sat 10 Oct", "Sun 11 Oct", "Mon 12 Oct"],
    );
    assert.deepEqual(
      items.map((item) => item.href),
      ["/calendar", "/fights/ufc-fight-night-allen-vs-duncan", "/calendar", "/calendar"],
    );
    assert.ok(items.every((item) => Date.parse(item.start) >= NOW.getTime() || item.title === "CPI"));
  });

  it("links a fight slug, keeps an in-app path, and sends everything else to /calendar", () => {
    const items = thisWeekItems(
      [
        row({
          id: "fight",
          kind: "fight",
          start: "2026-10-10T19:00:00-05:00",
          title: "Allen vs Duncan",
          eventSlug: "ufc-fight-night-allen-vs-duncan",
        }),
        row({
          id: "external",
          lane: "fights",
          start: "2026-10-10T16:00:00-05:00",
          title: "Prelims",
          link: "https://www.ufc.com/event/ufc-fight-night-october-10-2026",
        }),
        row({
          id: "log",
          lane: "capital",
          start: "2026-10-11T09:00:00-05:00",
          title: "Evernorth",
          link: "/log?ticker=XRP&from=2026-10-11&to=2026-10-11",
        }),
      ],
      NOW,
    );
    assert.deepEqual(
      items.map((item) => [item.title, item.href]),
      [
        ["Prelims", "/calendar"],
        ["Allen vs Duncan", "/fights/ufc-fight-night-allen-vs-duncan"],
        ["Evernorth", "/log?ticker=XRP&from=2026-10-11&to=2026-10-11"],
      ],
    );
  });

  it("includes the instant at the horizon and drops the one after it", () => {
    const items = thisWeekItems(
      [
        row({ id: "edge", start: "2026-10-15T10:00:00-05:00", title: "On the horizon" }),
        row({ id: "past-edge", start: "2026-10-15T10:01:00-05:00", title: "Too late" }),
        row({ id: "now", start: "2026-10-08T10:00:00-05:00", title: "Right now" }),
        row({
          id: "today-all-day",
          start: "2026-10-08T00:00:00-05:00",
          title: "CPI today",
          allDay: true,
          kind: "catalyst",
          node: "MACRO",
          status: "confirmed",
        }),
      ],
      NOW,
    );
    assert.deepEqual(
      items.map((item) => item.title),
      ["CPI today", "Right now", "On the horizon"],
    );
  });
});
