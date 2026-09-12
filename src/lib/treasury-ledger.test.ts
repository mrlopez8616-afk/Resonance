import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createSeedState } from "./seed";
import { migrateState } from "./storage";
import {
  LOCKED_TREASURY_LEDGER,
  TREASURY_CURRENT_UNITS,
  TREASURY_OPENING_UNITS,
  exportTreasuryLedgerJson,
  mergeLedgerById,
  parseTreasuryLedgerImport,
  principalTrailTotal,
  previewLedgerMerge,
  withRunningPrincipal,
} from "./treasury-ledger";

const examplePath = path.join(
  process.cwd(),
  "public/examples/treasury-ledger.json",
);

describe("founder treasury trail", () => {
  it("sums the official principal trail to 27,772", () => {
    assert.equal(principalTrailTotal(LOCKED_TREASURY_LEDGER), TREASURY_CURRENT_UNITS);
    assert.equal(LOCKED_TREASURY_LEDGER[0]?.amount, TREASURY_OPENING_UNITS);
    const seed = createSeedState();
    assert.equal(seed.treasury.units, 27772);
    assert.equal(seed.treasury.provenance, "founder-reported");
    assert.match(seed.treasury.locationNote, /2026-08-28/);
    assert.equal(seed.treasury.venue, "Xaman");
  });

  it("keeps yield as ammo and never applies seed rows to the working balance", () => {
    const yieldRow = LOCKED_TREASURY_LEDGER.find(
      (entry) => entry.id === "led-2026-09-11-yield-ammo",
    );
    assert.ok(yieldRow);
    assert.equal(yieldRow?.classification, "reward");
    assert.equal(yieldRow?.applyToBalance, false);
    assert.match(yieldRow?.note ?? "", /ammo/i);
    for (const entry of LOCKED_TREASURY_LEDGER) {
      assert.equal(entry.applyToBalance, false);
    }
  });

  it("walks running principal 20k → 24k → 25k → 26k → 27,772", () => {
    const trail = withRunningPrincipal(LOCKED_TREASURY_LEDGER).filter(
      (row) => row.classification === "principal",
    );
    assert.deepEqual(
      trail.map((row) => row.runningPrincipal),
      [20000, 24000, 25000, 26000, 27772],
    );
  });

  it("ships the same trail in the public example", () => {
    const imported = parseTreasuryLedgerImport(readFileSync(examplePath, "utf8"));
    assert.equal(imported.source, "founder-reported");
    assert.equal(imported.treasury?.units, 27772);
    assert.equal(imported.ledger.length, LOCKED_TREASURY_LEDGER.length);
    for (const locked of LOCKED_TREASURY_LEDGER) {
      const row = imported.ledger.find((item) => item.id === locked.id);
      assert.ok(row, `missing ${locked.id}`);
      assert.equal(row?.amount, locked.amount);
      assert.equal(row?.classification, locked.classification);
    }
  });

  it("merges by ID and leaves unrelated local rows", () => {
    const local = {
      id: "led-local-keep",
      date: "2026-09-10",
      amount: 1,
      fee: 0,
      note: "Operator-typed reward.",
      classification: "reward" as const,
      applyToBalance: false,
      createdAt: "2026-09-10T12:00:00.000Z",
    };
    const incoming = parseTreasuryLedgerImport(
      readFileSync(examplePath, "utf8"),
    ).ledger.map((row) =>
      row.id === "led-2026-09-11-mark" ? { ...row, note: "Revised residual." } : row,
    );
    const merged = mergeLedgerById([local, LOCKED_TREASURY_LEDGER[0]], incoming);
    assert.ok(merged.some((row) => row.id === "led-local-keep"));
    assert.equal(
      merged.find((row) => row.id === "led-2026-09-11-mark")?.note,
      "Revised residual.",
    );
    const preview = previewLedgerMerge(
      [local, LOCKED_TREASURY_LEDGER[0]],
      incoming,
      20000,
      27772,
    );
    assert.equal(preview.added, 5);
    assert.equal(preview.untouchedLocal, 1);
    assert.equal(preview.appliesTreasury, true);
  });

  it("upgrades a legacy 26k opening seed without wiping operator ledger rows", () => {
    const restored = migrateState({
      version: 1,
      treasury: {
        units: 26000,
        venue: "Xaman",
        locationNote: "Currently in a Flare vault",
        estimatedDailyReward: 1,
        provenance: "founder-reported",
        updatedAt: "2026-09-11T12:00:00.000Z",
      },
      ledger: [
        {
          id: "led-open",
          date: "2026-08-15",
          amount: 26000,
          fee: 0,
          note: "Opening treasury balance",
          classification: "principal",
          applyToBalance: false,
          createdAt: "2026-08-15T15:00:00.000Z",
        },
        {
          id: "led-local-keep",
          date: "2026-09-10",
          amount: 2,
          fee: 0,
          note: "Typed after first load.",
          classification: "reward",
          applyToBalance: false,
          createdAt: "2026-09-10T12:00:00.000Z",
        },
      ],
    });
    assert.equal(restored.treasury.units, 27772);
    assert.ok(restored.ledger.some((row) => row.id === "led-local-keep"));
    assert.ok(restored.ledger.some((row) => row.id === "led-2026-08-28-open"));
    assert.ok(!restored.ledger.some((row) => row.id === "led-open"));
  });

  it("export JSON re-parses as a merge payload", () => {
    const seed = createSeedState();
    const exported = exportTreasuryLedgerJson(seed.treasury, seed.ledger);
    const imported = parseTreasuryLedgerImport(exported);
    assert.equal(imported.source, "resonance-treasury");
    assert.equal(imported.treasury?.units, 27772);
    assert.equal(imported.ledger.length, seed.ledger.length);
  });

  it("rejects a decisions payload", () => {
    assert.throws(
      () =>
        parseTreasuryLedgerImport(
          JSON.stringify({
            asOf: "2026-09-11T23:30:00Z",
            source: "resonance-hub",
            decisions: [{ id: "D-2026-09-11-01", question: "x" }],
          }),
        ),
      /decisions record book/,
    );
  });
});
