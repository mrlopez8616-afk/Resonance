import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarSeed } from "@/data/calendar";
import {
  calendarHref,
  occurrencesOnDay,
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
});
