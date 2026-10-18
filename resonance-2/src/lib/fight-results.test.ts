import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fightResultSeed,
  formatBoutLine,
  formatEventResultLine,
  formatFightResult,
  parseFightResultBody,
  ufc332ResultLine,
  type KnownBout,
} from "@/lib/fight-results";
import {
  createEmptyFightResultsEnvelope,
  ensureSeededFightResults,
  parseFightResultsEnvelope,
  upsertFightResult,
} from "@/lib/fight-results-store-core";
import { knownBouts } from "@/lib/fight-desk";
import { fightByNumber, ufc332Fights } from "@/lib/ufc332";

function seedFor(fight: number) {
  const row = fightResultSeed().find((result) => result.fightSlug === fightByNumber(fight)?.slug);
  assert.ok(row);
  return row;
}

describe("UFC 332 fight results", () => {
  it("seeds a final for every UFC 332 bout", () => {
    const results = fightResultSeed();
    assert.equal(results.length, 14);
    assert.equal(ufc332ResultLine(results), "14 finals");
    assert.equal(formatFightResult(null), "Pending");
    assert.equal(formatEventResultLine(ufc332Fights, []), "Pending");
    assert.equal(results.some((row) => row.fightSlug === fightByNumber(13)?.slug), true);
    assert.equal(results.some((row) => row.fightSlug === fightByNumber(14)?.slug), true);

    const nolan = seedFor(1);
    assert.equal(nolan.winner, "Eric Nolan");
    assert.equal(nolan.opponent, "Court McGee");
    assert.equal(nolan.method, "KO/TKO (Punch)");
    assert.equal(nolan.round, 3);
    assert.equal(nolan.time, "3:26");
    assert.match(nolan.source ?? "", /401907089/);

    const naurdiev = seedFor(2);
    assert.equal(naurdiev.winner, "Ismail Naurdiev");
    assert.equal(naurdiev.method, "Decision - Unanimous");
    assert.equal(naurdiev.round, 3);
    assert.equal(naurdiev.time, "5:00");
    assert.match(naurdiev.source ?? "", /401912275/);

    const hernandez = seedFor(3);
    assert.equal(hernandez.winner, "Alexander Hernandez");
    assert.equal(hernandez.method, "KO/TKO (Punch)");
    assert.equal(hernandez.round, 2);
    assert.equal(hernandez.time, "3:12");

    const smith = seedFor(4);
    assert.equal(smith.winner, "Jacobe Smith");
    assert.equal(smith.method, "KO/TKO (Punches)");
    assert.equal(smith.round, 1);
    assert.equal(smith.time, "1:32");

    assert.equal(seedFor(5).method, "KO/TKO (Knee)");
    assert.equal(seedFor(5).time, "3:35");
    assert.equal(seedFor(6).method, "KO/TKO (Punches)");
    assert.equal(seedFor(6).time, "0:23");
    assert.equal(seedFor(7).method, "KO/TKO (Punches)");
    assert.equal(seedFor(7).time, "4:58");
    assert.equal(seedFor(8).method, "KO/TKO (Punch)");
    assert.equal(seedFor(8).time, "1:15");
    assert.equal(seedFor(9).winner, "Imanol Rodriguez Pillado");
    assert.equal(seedFor(9).method, "KO/TKO (Kick)");
    assert.equal(seedFor(9).time, "3:11");
    assert.match(seedFor(9).source ?? "", /401912276/);
    assert.equal(seedFor(10).winner, "Roman Kopylov");
    assert.equal(seedFor(10).opponent, "Ateba Gautier");
    assert.equal(seedFor(10).method, "KO/TKO (Punches)");
    assert.equal(seedFor(10).time, "3:12");
    assert.equal(seedFor(11).method, "UD (29-28, 29-27, 29-27)");
    assert.equal(seedFor(11).round, 3);
    assert.equal(seedFor(11).time, "5:00");
    const ribovics = seedFor(12);
    assert.equal(ribovics.winner, "Esteban Ribovics");
    assert.equal(ribovics.opponent, "King Green");
    assert.equal(ribovics.method, "KO/TKO (Punch)");
    assert.equal(ribovics.round, 1);
    assert.equal(ribovics.time, "4:08");
    assert.match(ribovics.source ?? "", /401917347/);
    assert.equal(
      formatFightResult(ribovics),
      "Esteban Ribovics def. King Green · KO/TKO (Punch) · R1 4:08",
    );

    const talbott = seedFor(13);
    assert.equal(talbott.winner, "Payton Talbott");
    assert.equal(talbott.opponent, "Deiveson Figueiredo");
    assert.equal(talbott.method, "KO/TKO (Punches)");
    assert.equal(talbott.round, 1);
    assert.equal(talbott.time, "2:09");
    assert.match(talbott.source ?? "", /401907087/);

    const silva = seedFor(14);
    assert.equal(silva.winner, "Natalia Silva");
    assert.equal(silva.opponent, "Wang Cong");
    assert.equal(silva.method, "UD (48-47, 48-47, 49-46)");
    assert.equal(silva.round, 5);
    assert.equal(silva.time, "5:00");
    assert.match(silva.source ?? "", /401912278/);
    assert.equal(
      formatFightResult(silva),
      "Natalia Silva def. Wang Cong · UD (48-47, 48-47, 49-46) · R5 5:00",
    );
  });

  it("rejects a bad body or an unknown slug and accepts one result or an array", () => {
    const nolan = seedFor(1);
    assert.equal(
      parseFightResultBody({
        event: "ufc-332",
        fightSlug: nolan.fightSlug,
        winner: nolan.winner,
        method: nolan.method,
        round: nolan.round,
        time: nolan.time,
      }).length,
      1,
    );
    assert.equal(
      parseFightResultBody([
        {
          event: "ufc-332",
          fightSlug: nolan.fightSlug,
          winner: nolan.winner,
          method: nolan.method,
          round: nolan.round,
          time: nolan.time,
        },
      ]).length,
      1,
    );
    assert.throws(() => parseFightResultBody(null));
    assert.throws(() => parseFightResultBody([]));
    assert.throws(() =>
      parseFightResultBody({
        event: "ufc-332",
        fightSlug: "not-a-bout",
        winner: "Eric Nolan",
        method: "KO/TKO",
        round: 1,
        time: "1:00",
      }),
    );
    assert.throws(() =>
      parseFightResultBody({
        event: "ufc-332",
        fightSlug: nolan.fightSlug,
        winner: "Court McGee",
        method: "",
        round: 1,
        time: "1:00",
      }),
    );
    assert.throws(() =>
      parseFightResultBody({
        event: "ufc-300",
        fightSlug: nolan.fightSlug,
        winner: nolan.winner,
        method: nolan.method,
        round: 1,
        time: "1:00",
      }),
    );
  });

  it("merges seeds without clobbering a stored row and treats the same payload as a no-op", () => {
    const seeded = ensureSeededFightResults(null, "2026-10-04T01:00:00.000Z");
    assert.equal(seeded.seeded, true);
    assert.equal(seeded.envelope.results.length, 14);
    const nolan = seeded.envelope.results.find((row) => row.winner === "Eric Nolan");
    assert.ok(nolan);
    const custom = { ...nolan, method: "KO (punches)", source: "desk correction" };
    const stored = {
      ...seeded.envelope,
      results: [custom],
    };
    const merged = ensureSeededFightResults(stored, "2026-10-04T02:00:00.000Z");
    assert.equal(merged.seeded, true);
    assert.equal(merged.envelope.results.length, 14);
    assert.equal(
      merged.envelope.results.find((row) => row.fightSlug === nolan.fightSlug)?.method,
      "KO (punches)",
    );
    assert.equal(
      merged.envelope.results.find((row) => row.fightSlug === nolan.fightSlug)?.source,
      "desk correction",
    );

    const again = ensureSeededFightResults(merged.envelope, "2026-10-04T03:00:00.000Z");
    assert.equal(again.seeded, false);

    const [incoming] = parseFightResultBody({
      event: "ufc-332",
      fightSlug: nolan.fightSlug,
      winner: nolan.winner,
      method: "KO (punches)",
      round: nolan.round,
      time: nolan.time,
    });
    const same = upsertFightResult(merged.envelope, incoming, "2026-10-04T04:00:00.000Z");
    assert.equal(same.deduped, true);
    assert.equal(same.envelope, merged.envelope);
    assert.equal(same.result.source, "desk correction");

    const corrected = upsertFightResult(
      merged.envelope,
      { ...incoming, method: "TKO (strikes)" },
      "2026-10-04T05:00:00.000Z",
    );
    assert.equal(corrected.deduped, false);
    assert.equal(corrected.result.method, "TKO (strikes)");
    assert.equal(corrected.result.source, "desk correction");
    assert.equal(corrected.result.winner, "Eric Nolan");

    const wintSlug = fightByNumber(6)?.slug;
    assert.ok(wintSlug);
    const staleWint = {
      ...seedFor(6),
      method: "KO/TKO",
      time: "4:36",
      source: "Hub confirmed final.",
    };
    const staleBook = {
      ...merged.envelope,
      results: merged.envelope.results.map((row) =>
        row.fightSlug === wintSlug ? staleWint : row,
      ),
    };
    const refreshed = ensureSeededFightResults(staleBook, "2026-10-04T06:00:00.000Z");
    assert.equal(refreshed.seeded, true);
    const wint = refreshed.envelope.results.find((row) => row.fightSlug === wintSlug);
    assert.equal(wint?.time, "0:23");
    assert.equal(wint?.method, "KO/TKO (Punches)");
    assert.match(wint?.source ?? "", /401922306/);
    assert.equal(
      refreshed.envelope.results.find((row) => row.fightSlug === nolan.fightSlug)?.method,
      "KO (punches)",
    );
    const held = ensureSeededFightResults(refreshed.envelope, "2026-10-04T07:00:00.000Z");
    assert.equal(held.seeded, false);
  });

  it("accepts a bout on any event when the fight belongs to that card", () => {
    const known: KnownBout[] = [
      {
        event: "ufc-fight-night-allen-vs-duncan",
        fightSlug: "brendan-allen-vs-christian-leroy-duncan",
        fighters: ["Brendan Allen", "Christian Leroy Duncan"],
      },
    ];
    const [result] = parseFightResultBody(
      {
        event: "ufc-fight-night-allen-vs-duncan",
        fightSlug: "brendan-allen-vs-christian-leroy-duncan",
        winner: "Brendan Allen",
        method: "Decision - Unanimous",
        round: 3,
        time: "5:00",
      },
      known,
    );
    assert.equal(result?.event, "ufc-fight-night-allen-vs-duncan");
    assert.equal(result?.winner, "Brendan Allen");
    assert.equal(result?.opponent, "Christian Leroy Duncan");
    assert.equal(
      formatFightResult(result),
      "Brendan Allen def. Christian Leroy Duncan · Decision - Unanimous · R3 5:00",
    );
    assert.throws(() =>
      parseFightResultBody(
        {
          event: "ufc-fight-night-allen-vs-duncan",
          fightSlug: "brendan-allen-vs-christian-leroy-duncan",
          winner: "Someone Else",
          method: "KO/TKO",
          round: 1,
          time: "1:00",
        },
        known,
      ),
    );
    assert.throws(() =>
      parseFightResultBody(
        {
          event: "ufc-fight-night-allen-vs-duncan",
          fightSlug: "not-on-the-card",
          winner: "Brendan Allen",
          method: "KO/TKO",
          round: 1,
          time: "1:00",
        },
        known,
      ),
    );
    assert.equal(formatBoutLine(null, ["lost", "lost"]), "lost");
    assert.equal(formatBoutLine(null, ["won", "sold"]), "won · sold");
    assert.equal(formatBoutLine(null, ["draw"]), "draw");
    assert.equal(formatBoutLine(null, ["won", "draw"]), "won · draw");
    assert.equal(formatBoutLine(null, ["open"]), "Pending");
    assert.equal(formatBoutLine(null, ["won", "open"]), "Pending");
    assert.equal(formatBoutLine(result, ["lost"]), formatFightResult(result));
  });

  it("records a draw or a no contest with no winner and settles nothing", () => {
    const event = "ufc-fight-night-allen-vs-duncan";
    const fightSlug = "ernesta-kareckaite-vs-melissa-gatto";
    const known: KnownBout[] = [
      { event, fightSlug, fighters: ["Ernesta Kareckaite", "Melissa Gatto"] },
    ];
    const [draw] = parseFightResultBody(
      {
        event,
        fightSlug,
        outcome: "draw",
        method: "Majority Draw",
        round: 3,
        time: "5:00",
        source: "Fight Desk",
      },
      known,
    );
    assert.equal(draw.outcome, "draw");
    assert.equal(draw.winner, "");
    assert.equal(draw.opponent, undefined);
    assert.deepEqual(draw.fighters, ["Ernesta Kareckaite", "Melissa Gatto"]);
    assert.equal(formatFightResult(draw), "Draw · Majority Draw · R3 5:00");
    assert.equal(formatBoutLine(draw, ["open"]), "Draw · Majority Draw · R3 5:00");
    // No bet field on the row: settlement stays on POST /api/bets/settle.
    assert.equal("settled" in draw || "payout" in draw || "bets" in draw, false);

    const [nc] = parseFightResultBody(
      { event, fightSlug, outcome: "no contest", round: 2, time: "1:10" },
      known,
    );
    assert.equal(nc.outcome, "no_contest");
    assert.equal(nc.method, "No contest");
    assert.equal(formatFightResult(nc), "No contest · R2 1:10");
    const [ncShort] = parseFightResultBody(
      { event, fightSlug, outcome: "NC", method: "Accidental eye poke", round: 1, time: "2:00" },
      known,
    );
    assert.equal(ncShort.outcome, "no_contest");

    // A draw with a winner, an opponent, or an unknown outcome is refused.
    assert.throws(() =>
      parseFightResultBody(
        { event, fightSlug, outcome: "draw", winner: "Melissa Gatto", round: 3, time: "5:00" },
        known,
      ),
    );
    assert.throws(() =>
      parseFightResultBody(
        { event, fightSlug, outcome: "draw", opponent: "Melissa Gatto", round: 3, time: "5:00" },
        known,
      ),
    );
    assert.throws(() =>
      parseFightResultBody({ event, fightSlug, outcome: "tie", round: 3, time: "5:00" }, known),
    );
    // A win still needs a winner.
    assert.throws(() =>
      parseFightResultBody({ event, fightSlug, method: "KO", round: 1, time: "1:00" }, known),
    );
    const [win] = parseFightResultBody(
      { event, fightSlug, outcome: "win", winner: "Melissa Gatto", method: "SD", round: 3, time: "5:00" },
      known,
    );
    assert.equal(win.outcome, undefined);
    assert.equal(win.opponent, "Ernesta Kareckaite");
  });

  it("upserts a draw over a win and back without stale fields, and re-reads a stored draw", () => {
    const event = "ufc-fight-night-allen-vs-duncan";
    const fightSlug = "ernesta-kareckaite-vs-melissa-gatto";
    const known: KnownBout[] = [
      { event, fightSlug, fighters: ["Ernesta Kareckaite", "Melissa Gatto"] },
    ];
    const [win] = parseFightResultBody(
      { event, fightSlug, winner: "Melissa Gatto", method: "SD", round: 3, time: "5:00" },
      known,
    );
    const empty = createEmptyFightResultsEnvelope("2026-10-11T00:00:00.000Z");
    const first = upsertFightResult(empty, win, "2026-10-11T01:00:00.000Z");
    const [draw] = parseFightResultBody(
      { event, fightSlug, outcome: "draw", method: "Majority Draw", round: 3, time: "5:00" },
      known,
    );
    const second = upsertFightResult(first.envelope, draw, "2026-10-11T02:00:00.000Z");
    assert.equal(second.deduped, false);
    assert.equal(second.result.winner, "");
    assert.equal(second.result.opponent, undefined);
    assert.equal(second.result.outcome, "draw");
    const again = upsertFightResult(second.envelope, draw, "2026-10-11T03:00:00.000Z");
    assert.equal(again.deduped, true);

    const reread = parseFightResultsEnvelope(JSON.parse(JSON.stringify(second.envelope)));
    assert.equal(reread?.results.length, 1);
    assert.equal(reread?.results[0]?.outcome, "draw");
    assert.deepEqual(reread?.results[0]?.fighters, ["Ernesta Kareckaite", "Melissa Gatto"]);
    // An old win row (no outcome) still reads as a win; a blank winner without an outcome is dropped.
    const legacy = parseFightResultsEnvelope({
      results: [
        { ...win },
        { ...win, fightSlug: "other", winner: "" },
      ],
    });
    assert.equal(legacy?.results.length, 1);
    assert.equal(legacy?.results[0]?.winner, "Melissa Gatto");
  });

  it("accepts any event named by stored breakdown rows, not only UFC 332", () => {
    const known = knownBouts([], [], [
      {
        eventSlug: "ufc-fight-night-edmonton",
        fightSlug: "a-one-vs-b-two",
        aName: "A One",
        bName: "B Two",
      },
      { eventSlug: "ufc-fight-night-edmonton", fightSlug: "half-row", aName: "Solo", bName: null },
    ]);
    const [row] = parseFightResultBody(
      {
        event: "ufc-fight-night-edmonton",
        fightSlug: "a-one-vs-b-two",
        winner: "B Two",
        method: "Submission",
        round: 2,
        time: "3:03",
      },
      known,
    );
    assert.equal(row.opponent, "A One");
    assert.throws(() =>
      parseFightResultBody(
        { event: "ufc-fight-night-edmonton", fightSlug: "half-row", outcome: "draw", round: 3, time: "5:00" },
        known,
      ),
    );
    assert.throws(() =>
      parseFightResultBody(
        { event: "ufc-unknown", fightSlug: "a-one-vs-b-two", outcome: "draw", round: 3, time: "5:00" },
        known,
      ),
    );
    // UFC 332 catalog bouts are still known with no rows at all.
    assert.equal(knownBouts([]).some((bout) => bout.event === "ufc-332"), true);
  });
});
