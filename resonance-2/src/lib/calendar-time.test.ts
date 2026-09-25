import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCivilDays,
  adjacentMonth,
  chicagoDay,
  chicagoInstant,
  chicagoToday,
  civilMonthGrid,
  civilWeek,
  formatChicagoClock,
  formatChicagoIso,
  isCivilWeekday,
} from "./calendar-time";

describe("calendar time", () => {
  it("places 7:00 AM Chicago on the September daylight offset", () => {
    const instant = chicagoInstant("2026-09-23", "07:00");
    assert.equal(instant.toISOString(), "2026-09-23T12:00:00.000Z");
    assert.equal(formatChicagoIso(instant), "2026-09-23T07:00:00-05:00");
    assert.equal(formatChicagoClock(instant.toISOString()), "7:00 AM CT");
  });

  it("places 7:00 AM Chicago on the January standard offset", () => {
    const instant = chicagoInstant("2026-01-07", "07:00");
    assert.equal(instant.toISOString(), "2026-01-07T13:00:00.000Z");
    assert.equal(formatChicagoIso(instant), "2026-01-07T07:00:00-06:00");
  });

  it("reads the Chicago civil date, including late UTC instants", () => {
    assert.equal(chicagoDay("2026-09-21T08:30:00-05:00"), "2026-09-21");
    assert.equal(chicagoDay("2026-09-22T04:30:00Z"), "2026-09-21");
  });

  it("builds a Monday week around Wednesday 23 Sep 2026", () => {
    assert.deepEqual(civilWeek("2026-09-23"), [
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
    ]);
    assert.equal(addCivilDays("2026-09-30", 1), "2026-10-01");
    assert.equal(isCivilWeekday("2026-09-23"), true);
    assert.equal(isCivilWeekday("2026-09-26"), false);
  });

  it("builds a Monday-start October 2026 grid and steps a month", () => {
    const cells = civilMonthGrid("2026-10-15");
    assert.equal(cells[0], "2026-09-28");
    assert.equal(cells.at(-1), "2026-11-01");
    assert.equal(cells.length, 35);
    assert.equal(adjacentMonth("2026-10-31", 1), "2026-11-30");
    assert.equal(adjacentMonth("2026-10-07", -1), "2026-09-07");
  });

  it("reports today in America/Chicago", () => {
    assert.equal(
      chicagoToday(new Date("2026-09-23T04:30:00Z")),
      "2026-09-22",
    );
    assert.equal(
      chicagoToday(new Date("2026-09-23T12:00:00Z")),
      "2026-09-23",
    );
  });
});
