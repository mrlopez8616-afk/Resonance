import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newSessionToken, planAccess } from "@/lib/auth-core";
import { isHiddenInPublicMode } from "@/lib/public-mode";
import { XRP_DAILY_CLOSE_USD } from "@/lib/home-lines";
import {
  XRP_TRIGGER_BAR_DAYS,
  XRP_TRIGGER_FOUNDER_GO,
  XRP_TRIGGER_HOLD_DAYS,
  XRP_TRIGGER_HREF,
  ctLabelForUtcDay,
  evaluateXrpTrigger,
  utcClosesFromMarketChart,
  type DailyClose,
} from "./xrp-trigger";

const NOW = new Date("2026-10-09T18:00:00.000Z");

function day(offset: number): string {
  const utc = new Date(Date.UTC(2026, 9, 8 + offset));
  return utc.toISOString().slice(0, 10);
}

function closes(rows: readonly [number, number][]): DailyClose[] {
  return rows.map(([offset, close]) => ({ day: day(offset), close }));
}

describe("XRP trigger settings", () => {
  it("keeps the line at $1.55 and the founder hold at 5 closes", () => {
    assert.equal(XRP_DAILY_CLOSE_USD, 1.55);
    assert.equal(XRP_TRIGGER_HOLD_DAYS, 5);
    assert.equal(XRP_TRIGGER_BAR_DAYS, 14);
    assert.equal(XRP_TRIGGER_FOUNDER_GO, "not given");
    assert.equal(XRP_TRIGGER_HREF, "/n/crypto/xrp-trigger");
  });
});

describe("UTC daily closes", () => {
  it("keeps the last print of each UTC day and drops invalid rows", () => {
    const parsed = utcClosesFromMarketChart({
      prices: [
        [Date.parse("2026-10-08T00:00:00.000Z"), 1.4],
        [Date.parse("2026-10-08T20:00:00.000Z"), 1.8],
        [Date.parse("2026-10-07T12:00:00.000Z"), 1.2],
        ["bad", 1.1],
        [Date.parse("2026-10-07T18:00:00.000Z"), 0],
        [Date.parse("2026-10-09T12:00:00.000Z"), 2.5],
      ],
    });
    assert.deepEqual(parsed, [
      { day: "2026-10-07", close: 1.2 },
      { day: "2026-10-08", close: 1.8 },
      { day: "2026-10-09", close: 2.5 },
    ]);
  });

  it("labels a UTC close day on the Central Time clock", () => {
    assert.equal(ctLabelForUtcDay("2026-10-08"), "Oct 8 CT");
    assert.equal(ctLabelForUtcDay("2026-01-15"), "Jan 15 CT");
  });
});

describe("XRP trigger streak", () => {
  it("excludes today's partial candle and stops the streak on a gap", () => {
    const status = evaluateXrpTrigger(
      [
        ...closes([
          [-4, 1.9],
          [-3, 1.8],
          [-1, 1.72],
          [0, 2],
        ]),
        { day: "2026-10-09", close: 3 },
      ],
      NOW,
    );
    assert.equal(status.lastDay, "2026-10-08");
    assert.equal(status.lastClose, 2);
    assert.equal(status.ctLabel, "Oct 8 CT");
    assert.equal(status.above, true);
    assert.equal(status.streak, 2);
    assert.equal(status.holds, false);
    assert.equal(status.bars.some((bar) => bar.day === "2026-10-09"), false);
    assert.equal(status.state, "holding");
    assert.equal(status.stateLabel, "Holding (2/5)");
  });

  it("does not count a close exactly on the line", () => {
    const exact = evaluateXrpTrigger(closes([[0, 1.55]]), NOW);
    assert.equal(exact.above, false);
    assert.equal(exact.streak, 0);
    assert.equal(exact.holds, false);
    assert.equal(exact.state, "watching");
    assert.equal(exact.stateLabel, "Watching");
    assert.equal(exact.distanceLabel, "0.0%");
    assert.equal(exact.checklist.dailyClose, "Daily close above $1.55: no, Oct 8 CT");

    const broken = evaluateXrpTrigger(
      closes([
        [-2, 1.8],
        [-1, 1.55],
        [0, 1.7],
      ]),
      NOW,
    );
    assert.equal(broken.streak, 1);
    assert.equal(broken.stateLabel, "Close above line");
    assert.equal(broken.bars.find((bar) => bar.day === "2026-10-07")?.above, false);
  });

  it("meets the hold only after five consecutive closes above the line", () => {
    const four = evaluateXrpTrigger(
      closes([
        [-3, 1.6],
        [-2, 1.61],
        [-1, 1.62],
        [0, 1.63],
      ]),
      NOW,
    );
    assert.equal(four.streak, 4);
    assert.equal(four.holds, false);
    assert.equal(four.stateLabel, "Holding (4/5)");
    assert.equal(four.checklist.holds, "Holds for 5 closes in a row: 4 of 5");

    const five = evaluateXrpTrigger(
      closes([
        [-4, 1.6],
        [-3, 1.61],
        [-2, 1.62],
        [-1, 1.63],
        [0, 1.64],
      ]),
      NOW,
    );
    assert.equal(five.streak, 5);
    assert.equal(five.holds, true);
    assert.equal(five.state, "trigger");
    assert.equal(five.stateLabel, "Trigger met, awaiting Founder's go");
    assert.equal(five.founderGo, "not given");
    assert.equal(five.checklist.founderGo, "Founder's go: not given");
    assert.equal(five.checklist.holds, "Holds for 5 closes in a row: 5 of 5");
    assert.equal(five.checklist.dailyClose, "Daily close above $1.55: yes, Oct 8 CT");
  });

  it("changes the hold and the state when N changes", () => {
    const rows = closes([
      [-2, 1.6],
      [-1, 1.7],
      [0, 1.8],
    ]);
    const three = evaluateXrpTrigger(rows, NOW, 3);
    assert.equal(three.holdDays, 3);
    assert.equal(three.holds, true);
    assert.equal(three.stateLabel, "Trigger met, awaiting Founder's go");
    assert.equal(three.checklist.holds, "Holds for 3 closes in a row: 3 of 3");

    const five = evaluateXrpTrigger(rows, NOW, 5);
    assert.equal(five.holds, false);
    assert.equal(five.stateLabel, "Holding (3/5)");
    assert.equal(five.checklist.holds, "Holds for 5 closes in a row: 3 of 5");

    const one = evaluateXrpTrigger(closes([[0, 1.6]]), NOW, 1);
    assert.equal(one.holds, true);
    assert.equal(one.stateLabel, "Trigger met, awaiting Founder's go");
    assert.equal(one.checklist.holds, "Holds for 1 close in a row: 1 of 1");
  });

  it("watches when the latest completed close is under the line", () => {
    const status = evaluateXrpTrigger(
      closes([
        [-1, 1.8],
        [0, 1.4],
      ]),
      NOW,
    );
    assert.equal(status.above, false);
    assert.equal(status.streak, 0);
    assert.equal(status.stateLabel, "Watching");
    assert.equal(status.distanceLabel, "-9.7%");
    assert.equal(status.checklist.dailyClose, "Daily close above $1.55: no, Oct 8 CT");
    assert.equal(status.checklist.holds, "Holds for 5 closes in a row: 0 of 5");
  });

  it("names the first close above the line before a hold streak starts", () => {
    const status = evaluateXrpTrigger(closes([[0, 1.6]]), NOW);
    assert.equal(status.streak, 1);
    assert.equal(status.state, "above");
    assert.equal(status.stateLabel, "Close above line");
    assert.equal(status.distanceLabel, "+3.2%");
    assert.equal(status.holds, false);
  });

  it("keeps the last 14 completed closes and drops a future day", () => {
    const rows: DailyClose[] = [];
    for (let offset = -20; offset <= 2; offset += 1) {
      rows.push({ day: day(offset), close: 1.4 + (offset + 20) * 0.01 });
    }
    const status = evaluateXrpTrigger(rows, NOW);
    assert.equal(status.bars.length, 14);
    assert.equal(status.bars[0]?.day, "2026-09-25");
    assert.equal(status.bars.at(-1)?.day, "2026-10-08");
    assert.equal(status.bars.some((bar) => bar.day >= "2026-10-09"), false);
    assert.equal(status.lastDay, "2026-10-08");
  });

  it("stays on Watching with no close and never records a go", () => {
    const status = evaluateXrpTrigger(
      [
        { day: "not-a-day", close: 2 },
        { day: "2026-10-09", close: 2 },
        { day: "2026-10-08", close: Number.NaN },
      ],
      NOW,
    );
    assert.equal(status.lastClose, null);
    assert.equal(status.streak, 0);
    assert.equal(status.holds, false);
    assert.equal(status.pctFromLine, null);
    assert.equal(status.distanceLabel, null);
    assert.equal(status.stateLabel, "Watching");
    assert.equal(status.founderGo, "not given");
    assert.deepEqual(status.checklist, {
      dailyClose: "Daily close above $1.55: no",
      holds: "Holds for 5 closes in a row: 0 of 5",
      founderGo: "Founder's go: not given",
    });
    assert.equal(status.bars.length, 0);
  });
});

describe("XRP trigger route auth", () => {
  it("sends a signed-out visit to login and lets a session through", () => {
    const base = {
      pathname: "/n/crypto/xrp-trigger",
      method: "GET",
      sessionToken: null as string | null,
      bearerOk: true,
      loginConfigured: true,
      nextPath: "/n/crypto/xrp-trigger",
    };
    assert.deepEqual(planAccess(base), { kind: "redirect", next: "/n/crypto/xrp-trigger" });
    assert.equal(planAccess({ ...base, sessionToken: newSessionToken() }).kind, "allow");
    assert.equal(planAccess({ ...base, loginConfigured: false }).kind, "redirect");
    assert.equal(isHiddenInPublicMode("/n/crypto/xrp-trigger"), false);
  });
});
