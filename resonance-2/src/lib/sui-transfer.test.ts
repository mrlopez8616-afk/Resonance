import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { TransferFill } from "@/data/fills";
import { FILLS_STORE_VERSION, type FillsStoreEnvelope } from "@/lib/fills-store-core";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { loadFillsEnvelope, saveFillsEnvelope } from "@/lib/pg/envelopes";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations, splitSqlStatements } from "@/lib/pg/migrate";

const BUY = "4f8720ee-fd80-4a8e-b7f2-ec4c9f8c1f79";
const TRANSFER_KEY = "coinbase:transfer:cb-agentic->coinbase:sui:2026-10-09t16:59";
const MIGRATION_ID = "020_sui_cb_agentic_transfer";

async function postgres(): Promise<SqlClient> {
  const db = new PGlite();
  async function query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
    const result = await db.query<T>(text, [...params]);
    return result.rows ?? [];
  }
  return {
    query,
    async transaction(statements) {
      const results: Record<string, unknown>[][] = [];
      await query("BEGIN");
      try {
        for (const statement of statements) {
          results.push(await query(statement.text, statement.params ?? []));
        }
        await query("COMMIT");
        return results;
      } catch (error) {
        await query("ROLLBACK");
        throw error;
      }
    },
  };
}

function migrationSql(): string {
  const migration = EMBEDDED_MIGRATIONS.find((entry) => entry.id === MIGRATION_ID);
  assert.ok(migration);
  return migration.sql;
}

async function seedShape(options: {
  agentic?: string;
  coinbase?: string | null;
  buySleeve?: string;
} = {}): Promise<void> {
  const agentic = options.agentic ?? "1.2";
  const coinbase = options.coinbase === undefined ? "33.7" : options.coinbase;
  const buySleeve = options.buySleeve ?? "cb-agentic";
  await sqlQuery(
    `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity) VALUES ('SUI', 'cb-agentic', $1)`,
    [agentic],
  );
  if (coinbase !== null) {
    await sqlQuery(
      `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity) VALUES ('SUI', 'coinbase', $1)`,
      [coinbase],
    );
  }
  await sqlQuery(
    `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity) VALUES ('XRP', 'cb-agentic', '9')`,
  );
  await sqlQuery(
    `INSERT INTO fills (
       source, external_id, filled_at, symbol, side, quantity, price, venue, sleeve, result, payload
     ) VALUES (
       'coinbase', $1, '2026-10-09T15:21:33-05:00', 'SUI', 'buy', 1.2, 1.0601340274,
       'coinbase', $2, 'filled', $3::jsonb
     )`,
    [
      `coinbase:${BUY}`,
      buySleeve,
      JSON.stringify({
        time: "2026-10-09T15:21:33-05:00",
        symbol: "SUI",
        side: "buy",
        quantity: "1.2",
        price: "1.0601340274",
        orderId: BUY,
        result: "filled",
        venue: "coinbase",
        sleeve: buySleeve,
        idempotencyKey: `coinbase:${BUY}`,
      }),
    ],
  );
}

async function prints(): Promise<{ ticker: string; sleeve_id: string; quantity: string }[]> {
  return sqlQuery(
    `SELECT ticker, sleeve_id, quantity FROM sleeve_prints ORDER BY ticker, sleeve_id`,
  );
}

async function buyRow(): Promise<{ side: string; sleeve: string | null; payload: Record<string, unknown> }[]> {
  return sqlQuery(
    `SELECT side, sleeve, payload FROM fills WHERE payload->>'orderId' = $1`,
    [BUY],
  );
}

async function runStatement(): Promise<Record<string, unknown>> {
  const [statement] = splitSqlStatements(migrationSql());
  assert.ok(statement);
  const rows = await sqlQuery<Record<string, unknown>>(statement);
  return rows[0] ?? {};
}

function counts(row: Record<string, unknown>): { transfer: number; from: number; to: number } {
  return {
    transfer: Number(row.transfer_rows ?? 0),
    from: Number(row.from_rows ?? 0),
    to: Number(row.to_rows ?? 0),
  };
}

async function withConsole(
  run: () => Promise<void>,
): Promise<{ logs: string[]; warns: string[] }> {
  const logs: string[] = [];
  const warns: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(" "));
  };
  try {
    await run();
  } finally {
    console.log = origLog;
    console.warn = origWarn;
  }
  return { logs, warns };
}

describe("SUI cb-agentic transfer migration", { concurrency: false }, () => {
  after(() => {
    setSqlClientForTests(null);
  });

  it("inserts the transfer once and leaves the buy and XRP alone", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === "001_domain_tables"));
    await seedShape();
    const seen = await withConsole(async () => {
      const applied = await applyMigrations(
        EMBEDDED_MIGRATIONS.filter((entry) => entry.id === MIGRATION_ID),
      );
      assert.deepEqual(applied.applied, [MIGRATION_ID]);
    });
    assert.deepEqual(seen.logs, ["020_sui_cb_agentic_transfer: transfer 1 from 1 to 1"]);
    assert.deepEqual(seen.warns, []);

    assert.deepEqual(await prints(), [
      { ticker: "SUI", sleeve_id: "cb-agentic", quantity: "0" },
      { ticker: "SUI", sleeve_id: "coinbase", quantity: "34.9" },
      { ticker: "XRP", sleeve_id: "cb-agentic", quantity: "9" },
    ]);
    const buy = await buyRow();
    assert.equal(buy[0]?.side, "buy");
    assert.equal(buy[0]?.sleeve, "cb-agentic");
    assert.equal(buy[0]?.payload.price, "1.0601340274");
    assert.equal(buy[0]?.payload.sleeve, "cb-agentic");
    assert.equal(buy[0]?.payload.quantity, "1.2");

    const transfer = await sqlQuery<{
      side: string;
      sleeve: string | null;
      price: string | null;
      external_id: string;
    }>(
      `SELECT side, sleeve, price::text AS price, external_id FROM fills WHERE external_id = $1`,
      [TRANSFER_KEY],
    );
    assert.equal(transfer.length, 1);
    assert.equal(transfer[0]?.side, "transfer");
    assert.equal(transfer[0]?.sleeve, null);
    assert.equal(transfer[0]?.price, null);
    const trades = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fills WHERE symbol = 'SUI' AND side IN ('buy', 'sell')`,
    );
    assert.equal(trades[0]?.n, "1");

    assert.deepEqual(counts(await runStatement()), { transfer: 0, from: 0, to: 0 });
    assert.deepEqual(await prints(), [
      { ticker: "SUI", sleeve_id: "cb-agentic", quantity: "0" },
      { ticker: "SUI", sleeve_id: "coinbase", quantity: "34.9" },
      { ticker: "XRP", sleeve_id: "cb-agentic", quantity: "9" },
    ]);
    assert.equal((await buyRow())[0]?.payload.price, "1.0601340274");
    const skipped = await applyMigrations(
      EMBEDDED_MIGRATIONS.filter((entry) => entry.id === MIGRATION_ID),
    );
    assert.deepEqual(skipped.applied, []);
    assert.deepEqual(skipped.skipped, [MIGRATION_ID]);
  });

  it("changes nothing when the guard fails", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === "001_domain_tables"));
    await seedShape({ agentic: "2.4" });
    const beforePrints = await prints();
    const beforeBuy = await buyRow();
    const seen = await withConsole(async () => {
      await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === MIGRATION_ID));
    });
    assert.deepEqual(seen.warns, ["020_sui_cb_agentic_transfer: guard not met: manual review"]);
    assert.deepEqual(seen.logs, []);
    assert.deepEqual(await prints(), beforePrints);
    assert.deepEqual(await buyRow(), beforeBuy);
    const rows = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills`);
    assert.equal(rows[0]?.n, "1");
    assert.deepEqual(counts(await runStatement()), { transfer: 0, from: 0, to: 0 });
  });

  it("changes nothing when the buy is not still in cb-agentic", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === "001_domain_tables"));
    await seedShape({ buySleeve: "coinbase" });
    const before = await prints();
    await runStatement();
    assert.deepEqual(await prints(), before);
    const rows = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fills WHERE external_id = $1`,
      [TRANSFER_KEY],
    );
    assert.equal(rows[0]?.n, "0");
  });

  it("round-trips a transfer row and counts a second save as unchanged", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === "001_domain_tables"));
    const fill: TransferFill = {
      kind: "transfer",
      time: "2026-10-09T16:59:00-05:00",
      symbol: "SUI",
      quantity: "1.2",
      venue: "coinbase",
      fromSleeve: "cb-agentic",
      toSleeve: "coinbase",
      orderId: "transfer:cb-agentic->coinbase:SUI:2026-10-09T16:59",
      idempotencyKey: TRANSFER_KEY,
      result: "filled",
      note: "Coinbase portfolio transfer Agentic d757d013 to Default 5aba0d3b. Not a trade.",
    };
    const envelope: FillsStoreEnvelope = {
      version: FILLS_STORE_VERSION,
      updatedAt: "2026-10-09T21:59:00.000Z",
      seededAt: null,
      fills: [fill],
      sleevePrints: { SUI: { coinbase: "34.9", "cb-agentic": "0" } },
    };
    const first = await saveFillsEnvelope(envelope);
    assert.equal(first.inserted, 1);
    const stored = await sqlQuery<{ side: string; sleeve: string | null; price: string | null }>(
      `SELECT side, sleeve, price::text AS price FROM fills WHERE external_id = $1`,
      [TRANSFER_KEY],
    );
    assert.equal(stored[0]?.side, "transfer");
    assert.equal(stored[0]?.sleeve, null);
    assert.equal(stored[0]?.price, null);
    const loaded = await loadFillsEnvelope();
    assert.ok(loaded);
    assert.deepEqual(loaded.fills, [fill]);
    const second = await saveFillsEnvelope(loaded);
    assert.equal(second.unchanged, 1);
    assert.equal(second.inserted, 0);
    assert.equal(second.updated, 0);
  });
});
