import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chicagoDay,
  filterLotBars,
  lotRangeStart,
  parseLotRange,
  parseLotRangeQuery,
} from "@/lib/lot-range";

const LATE_OCT_11 = new Date("2026-10-12T04:30:00.000Z");
const CHICAGO_MIDNIGHT = new Date("2026-10-12T05:00:00.000Z");

function bars(days: readonly string[]) {
  return days.map((day) => ({ day, magnitude: day.endsWith("1") ? 6 : -4 }));
}

describe("lot range", () => {
  it("parses the range query and falls back to All", () => {
    assert.equal(parseLotRange("1D"), "1D");
    assert.equal(parseLotRange("1W"), "1W");
    assert.equal(parseLotRange("1M"), "1M");
    assert.equal(parseLotRange("1Y"), "1Y");
    assert.equal(parseLotRange("All"), "All");
    assert.equal(parseLotRange(null), "All");
    assert.equal(parseLotRange(undefined), "All");
    assert.equal(parseLotRange(""), "All");
    assert.equal(parseLotRange("1d"), "All");
    assert.equal(parseLotRange("1m"), "All");
    assert.equal(parseLotRange("all"), "All");
    assert.equal(parseLotRange("2Y"), "All");
    assert.equal(parseLotRange(" 1M"), "All");
    assert.equal(parseLotRangeQuery(undefined), "All");
    assert.equal(parseLotRangeQuery("1M"), "1M");
    assert.equal(parseLotRangeQuery(["bogus"]), "All");
    assert.equal(parseLotRangeQuery(["1W", "1D"]), "1W");
  });

  it("ends the window on the Chicago civil day, including the first day", () => {
    assert.equal(chicagoDay(LATE_OCT_11), "2026-10-11");
    assert.equal(chicagoDay(new Date("2026-10-12T04:59:59.000Z")), "2026-10-11");
    assert.equal(chicagoDay(CHICAGO_MIDNIGHT), "2026-10-12");
    assert.equal(chicagoDay(new Date("2026-11-01T04:59:00.000Z")), "2026-10-31");
    assert.equal(chicagoDay(new Date("2026-11-01T05:00:00.000Z")), "2026-11-01");

    assert.equal(lotRangeStart("1D", LATE_OCT_11), "2026-10-11");
    assert.equal(lotRangeStart("1W", LATE_OCT_11), "2026-10-05");
    assert.equal(lotRangeStart("1M", LATE_OCT_11), "2026-09-11");
    assert.equal(lotRangeStart("1Y", LATE_OCT_11), "2025-10-11");
    assert.equal(lotRangeStart("All", LATE_OCT_11), null);

    const days = [
      "2025-10-10",
      "2025-10-11",
      "2026-09-10",
      "2026-09-11",
      "2026-10-04",
      "2026-10-05",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ];
    const kept = (range: "1D" | "1W" | "1M" | "1Y") =>
      filterLotBars(bars(days), range, LATE_OCT_11).map((bar) => bar.day);

    assert.deepEqual(kept("1D"), ["2026-10-11"]);
    assert.deepEqual(kept("1W"), ["2026-10-05", "2026-10-10", "2026-10-11"]);
    assert.deepEqual(kept("1M"), ["2026-09-11", "2026-10-04", "2026-10-05", "2026-10-10", "2026-10-11"]);
    assert.deepEqual(kept("1Y"), [
      "2025-10-11",
      "2026-09-10",
      "2026-09-11",
      "2026-10-04",
      "2026-10-05",
      "2026-10-10",
      "2026-10-11",
    ]);

    assert.deepEqual(filterLotBars(bars(days), "1D", CHICAGO_MIDNIGHT).map((bar) => bar.day), ["2026-10-12"]);
    assert.equal(lotRangeStart("1D", new Date("2026-11-01T04:59:00.000Z")), "2026-10-31");
    assert.equal(lotRangeStart("1D", new Date("2026-11-01T05:00:00.000Z")), "2026-11-01");
  });

  it("clamps a month and a year onto the last real day", () => {
    const march = new Date("2026-03-31T17:00:00.000Z");
    assert.equal(chicagoDay(march), "2026-03-31");
    assert.equal(lotRangeStart("1M", march), "2026-02-28");
    assert.deepEqual(
      filterLotBars(bars(["2026-02-27", "2026-02-28", "2026-03-31"]), "1M", march).map((bar) => bar.day),
      ["2026-02-28", "2026-03-31"],
    );

    const leap = new Date("2024-03-31T17:00:00.000Z");
    assert.equal(chicagoDay(leap), "2024-03-31");
    assert.equal(lotRangeStart("1M", leap), "2024-02-29");

    const year = new Date("2025-02-28T18:00:00.000Z");
    assert.equal(chicagoDay(year), "2025-02-28");
    assert.equal(lotRangeStart("1Y", year), "2024-02-28");
    assert.deepEqual(
      filterLotBars(bars(["2024-02-27", "2024-02-28", "2024-02-29", "2025-02-28"]), "1Y", year).map((bar) => bar.day),
      ["2024-02-28", "2024-02-29", "2025-02-28"],
    );
  });

  it("keeps undated and future bars on All and leaves gain untouched", () => {
    const input = [
      { day: "", magnitude: 8 },
      { day: "not-a-day", magnitude: 3 },
      { day: "2026-10-11", magnitude: 6 },
      { day: "2026-10-12", magnitude: -2 },
    ];
    const all = filterLotBars(input, "All", LATE_OCT_11);
    assert.deepEqual(all.map((bar) => bar.day), ["", "not-a-day", "2026-10-11", "2026-10-12"]);
    assert.equal(all[2]?.magnitude, 6);
    assert.notEqual(all, input);

    const day = filterLotBars(input, "1D", LATE_OCT_11);
    assert.deepEqual(day.map((bar) => bar.day), ["2026-10-11"]);
    assert.equal(day[0]?.magnitude, 6);
    assert.equal(input[2]?.magnitude, 6);
  });
});
