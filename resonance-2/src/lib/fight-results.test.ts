import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fightResultSeed,
  formatEventResultLine,
  formatFightResult,
  parseFightResultBody,
  ufc332ResultLine,
} from "@/lib/fight-results";
import {
  ensureSeededFightResults,
  upsertFightResult,
} from "@/lib/fight-results-store-core";
import { fightByNumber, ufc332Fights } from "@/lib/ufc332";

function seedFor(fight: number) {
  const row = fightResultSeed().find((result) => result.fightSlug === fightByNumber(fight)?.slug);
  assert.ok(row);
  return row;
}

describe("UFC 332 fight results", () => {
  it("seeds twelve finals and leaves Talbott and Silva pending", () => {
    const results = fightResultSeed();
    assert.equal(results.length, 12);
    assert.equal(ufc332ResultLine(results), "12 finals · 2 pending");
    assert.equal(formatFightResult(null), "Pending");
    assert.equal(formatEventResultLine(ufc332Fights, []), "Pending");
    assert.equal(results.some((row) => row.fightSlug === fightByNumber(13)?.slug), false);
    assert.equal(results.some((row) => row.fightSlug === fightByNumber(14)?.slug), false);

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

    assert.equal(seedFor(5).method, "KO (knee)");
    assert.equal(seedFor(5).time, "3:35");
    assert.equal(seedFor(6).method, "KO/TKO");
    assert.equal(seedFor(6).time, "4:36");
    assert.equal(seedFor(9).winner, "Imanol Rodriguez Pillado");
    assert.equal(seedFor(9).time, "1:46");
    assert.equal(seedFor(10).winner, "Roman Kopylov");
    assert.equal(seedFor(10).opponent, "Ateba Gautier");
    assert.equal(seedFor(11).method, "UD (29-28, 29-27, 29-27)");
    assert.equal(seedFor(11).round, 3);
    assert.equal(seedFor(11).time, "5:00");
    const ribovics = seedFor(12);
    assert.equal(ribovics.winner, "Esteban Ribovics");
    assert.equal(ribovics.opponent, "King Green");
    assert.equal(ribovics.method, "KO/TKO");
    assert.equal(ribovics.round, 1);
    assert.equal(ribovics.time, "1:01");
    assert.equal(
      formatFightResult(ribovics),
      "Esteban Ribovics def. King Green · KO/TKO · R1 1:01",
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
    assert.equal(seeded.envelope.results.length, 12);
    const nolan = seeded.envelope.results.find((row) => row.winner === "Eric Nolan");
    assert.ok(nolan);
    const custom = { ...nolan, method: "KO (punches)", source: "desk correction" };
    const stored = {
      ...seeded.envelope,
      results: [custom],
    };
    const merged = ensureSeededFightResults(stored, "2026-10-04T02:00:00.000Z");
    assert.equal(merged.seeded, true);
    assert.equal(merged.envelope.results.length, 12);
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
  });
});
