import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalystSeed } from "@/data/catalyst-seed";
import { calendarSeed } from "@/data/calendar";
import { civilMonthGrid } from "@/lib/calendar-time";
import { ensureSeededCalendarEnvelope } from "@/lib/calendar-store-core";
import {
  calendarDayHref,
  calendarHref,
  calendarMonthBackHref,
  calendarWeekDays,
  chipsOnDay,
  displayedCalendarStatus,
  laneCountsOnDay,
  monthLevelEvents,
  occurrencesOnDay,
  parseCalendarDaySearch,
  parseCalendarDeskQuery,
} from "./calendar-desk";

const today = "2026-09-23";

describe("calendar desk", () => {
  it("defaults to the Chicago day and ignores an unknown lane", () => {
    const query = parseCalendarDeskQuery({ lane: "month", day: "nope" }, today);
    assert.equal(query.day, today);
    assert.equal(query.lane, "");
    assert.equal(calendarHref({ day: today, today }), "/calendar");
    assert.equal(
      calendarHref({ day: "2026-09-21", lane: "capital", today }),
      "/calendar?day=2026-09-21&lane=capital",
    );
    const month = parseCalendarDeskQuery({ view: "month", node: "xrp" }, today);
    assert.equal(month.view, "month");
    assert.equal(month.node, "XRP");
    assert.equal(parseCalendarDeskQuery({ view: "year", node: "DOGE" }, today).view, "day");
    assert.equal(parseCalendarDeskQuery({ view: "year", node: "DOGE" }, today).node, "");
    assert.equal(
      calendarHref({ day: "2026-10-07", view: "month", node: "SUI", today }),
      "/calendar?day=2026-10-07&view=month&node=SUI",
    );
  });

  it("shows the weekday brief on Wednesday and the capital history on Monday", () => {
    const wednesday = occurrencesOnDay(calendarSeed, "2026-09-23");
    assert.deepEqual(
      wednesday.map((item) => item.event.id),
      ["cadence-daily-brief"],
    );
    assert.equal(wednesday[0]?.start, "2026-09-23T07:00:00-05:00");

    const monday = occurrencesOnDay(calendarSeed, "2026-09-21");
    assert.deepEqual(
      monday.map((item) => item.event.title),
      ["Daily Brief", "Agentic SUI→6 AI"],
    );
    assert.equal(
      monday[1]?.event.link,
      "/log?ticker=SUI&from=2026-09-21&to=2026-09-21",
    );
  });

  it("keeps Saturday, Build, and Gates empty", () => {
    assert.deepEqual(occurrencesOnDay(calendarSeed, "2026-09-26"), []);
    assert.deepEqual(
      occurrencesOnDay(calendarSeed, "2026-09-21", "build"),
      [],
    );
    assert.deepEqual(
      occurrencesOnDay(calendarSeed, "2026-09-21", "gates"),
      [],
    );
    assert.equal(
      occurrencesOnDay(calendarSeed, "2026-09-21", "capital")[0]?.event.lane,
      "capital",
    );
  });

  it("spans multi-day catalysts, keeps month precision off the day grid, and filters nodes", () => {
    const octoberSeventh = occurrencesOnDay(catalystSeed, "2026-10-07");
    assert.ok(octoberSeventh.some((item) => item.event.id === "sui-basecamp-2026"));
    assert.ok(octoberSeventh.some((item) => item.event.id === "token2049-singapore-2026"));
    assert.equal(
      octoberSeventh.some((item) => item.event.id === "gev-investor-update-2026"),
      false,
    );
    assert.equal(
      occurrencesOnDay(catalystSeed, "2026-12-09").some(
        (item) => item.event.id === "gev-investor-update-2026",
      ),
      false,
    );
    assert.deepEqual(
      monthLevelEvents(catalystSeed, "2026-12").map((event) => event.id),
      ["gev-investor-update-2026"],
    );
    assert.deepEqual(monthLevelEvents(catalystSeed, "2026-11"), []);

    const eighth = occurrencesOnDay(catalystSeed, "2026-10-08");
    assert.equal(
      eighth.find((item) => item.event.id === "sui-basecamp-2026")?.continues,
      true,
    );

    const xrpOnly = occurrencesOnDay(catalystSeed, "2026-10-27", "", "XRP");
    assert.ok(xrpOnly.some((item) => item.event.id === "ripple-swell-2026"));
    assert.ok(xrpOnly.every((item) => item.event.node === "XRP"));
    assert.equal(
      xrpOnly.some((item) => item.event.id === "fomc-2026-oct"),
      false,
    );

    const chips = chipsOnDay(catalystSeed, "2026-10-07");
    assert.ok(chips.chips.length > 0);
    assert.ok(chips.chips.length <= 3);
    const batch = occurrencesOnDay(catalystSeed, "2026-09-29");
    assert.equal(batch[0]?.event.id, "xrpl-batchv1-1-activation-2026");
    assert.equal(batch[0]?.event.status, "tentative");
    assert.match(batch[0]?.start ?? "", /T09:06:00/);
  });

  it("renders posted Daily Briefs on the cadence lane for day, week, and month", () => {
    const now = "2026-09-30T18:00:00.000Z";
    const { envelope } = ensureSeededCalendarEnvelope(null, now);
    const events = envelope.events;

    for (const day of ["2026-09-28", "2026-09-29"]) {
      const cadence = occurrencesOnDay(events, day, "cadence");
      assert.equal(cadence.length, 1);
      assert.equal(cadence[0]?.event.id, `cadence-daily-brief-${day}`);
      assert.equal(cadence[0]?.event.title, "Daily Brief");
      assert.equal(cadence[0]?.event.lane, "cadence");
      assert.equal(cadence[0]?.event.status, "sent");
      assert.equal(cadence[0]?.start, `${day}T07:02:00-05:00`);
      assert.equal(laneCountsOnDay(events, day).cadence, 1);
      assert.equal(
        chipsOnDay(events, day, "cadence").chips.some(
          (chip) => chip.id === `cadence-daily-brief-${day}`,
        ),
        true,
      );
      assert.equal(
        occurrencesOnDay(events, day).some((item) => item.event.id === "cadence-daily-brief"),
        false,
      );
    }

    const week = calendarWeekDays("2026-09-28", "2026-09-30").flatMap((item) =>
      occurrencesOnDay(events, item.date, "cadence"),
    );
    assert.equal(
      week.filter((item) => item.event.id === "cadence-daily-brief-2026-09-28").length,
      1,
    );
    assert.equal(
      week.filter((item) => item.event.id === "cadence-daily-brief-2026-09-29").length,
      1,
    );

    const september = civilMonthGrid("2026-09-30").filter((day) =>
      day.startsWith("2026-09"),
    );
    for (const day of ["2026-09-28", "2026-09-29"]) {
      assert.equal(september.includes(day), true);
      assert.equal(
        occurrencesOnDay(events, day, "cadence").some(
          (item) => item.event.id === `cadence-daily-brief-${day}`,
        ),
        true,
      );
    }
  });

  it("prints sent for a past hub brief stored as scheduled", () => {
    const posted = {
      id: "cadence-daily-brief-2026-09-25",
      lane: "cadence" as const,
      start: "2026-09-25T07:02:00-05:00",
      title: "Daily Brief",
      status: "scheduled" as const,
      writer: "agent" as const,
    };
    const now = new Date("2026-09-30T18:00:00.000Z");
    assert.equal(displayedCalendarStatus(posted, posted.start, now), "sent");
    const future = {
      ...posted,
      id: "cadence-daily-brief-2026-10-01",
      start: "2026-10-01T07:02:00-05:00",
    };
    assert.equal(displayedCalendarStatus(future, future.start, now), "scheduled");
    const capital = calendarSeed[1];
    assert.ok(capital);
    assert.equal(
      displayedCalendarStatus(capital, capital.start, now),
      capital.status,
    );
  });

  it("lets a posted weekday brief replace the standing rhythm row", () => {
    const posted = {
      id: "cadence-daily-brief-2026-09-23",
      lane: "cadence" as const,
      start: "2026-09-23T07:00:00-05:00",
      title: "Daily Brief",
      status: "scheduled" as const,
      writer: "agent" as const,
      note: "Filed.",
    };
    const day = occurrencesOnDay([...calendarSeed, posted], "2026-09-23");
    assert.deepEqual(
      day.map((item) => item.event.id),
      ["cadence-daily-brief-2026-09-23"],
    );
  });

  it("builds a day route and returns to the month map with filters", () => {
    const search = parseCalendarDaySearch({
      anchor: "2026-10-07",
      lane: "build",
      node: "xrp",
      event: "ripple-swell",
    });
    assert.deepEqual(search, {
      anchor: "2026-10-07",
      lane: "build",
      node: "XRP",
      event: "ripple-swell",
    });
    assert.deepEqual(parseCalendarDaySearch({ lane: "nope", node: "DOGE", anchor: "nope" }), {
      anchor: "",
      lane: "",
      node: "",
      event: "",
    });
    assert.equal(
      calendarDayHref({
        day: "2026-09-25",
        anchor: "2026-10-07",
        lane: "capital",
        node: "SUI",
        event: "sui-basecamp",
      }),
      "/calendar/2026-09-25?anchor=2026-10-07&lane=capital&node=SUI&event=sui-basecamp",
    );
    assert.equal(calendarDayHref({ day: "2026-09-25" }), "/calendar/2026-09-25");
    assert.equal(
      calendarMonthBackHref({
        day: "2026-09-28",
        anchor: "2026-10-07",
        lane: "capital",
        node: "XRP",
        today,
      }),
      "/calendar?day=2026-10-07&view=month&lane=capital&node=XRP",
    );
    assert.equal(
      calendarMonthBackHref({ day: "2026-09-23", anchor: today, today }),
      "/calendar?view=month",
    );
    const counts = laneCountsOnDay([...calendarSeed, ...catalystSeed], "2026-10-07");
    assert.equal(counts.cadence, 1);
    assert.equal(counts.capital, 0);
    assert.equal(counts.build, 0);
    assert.equal(counts.gates, 0);
  });
});
