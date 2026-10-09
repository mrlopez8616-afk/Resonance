import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Fill, TradeFill } from "@/data/fills";
import { addDecimal, subtractDecimal } from "@/lib/decimal";
import { fillRowKey } from "@/lib/fills";
import { FILLS_STORE_VERSION, type FillsStoreEnvelope } from "@/lib/fills-store-core";
import { setSqlClientForTests, sqlQuery, sqlTransaction, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { saveFillsEnvelope } from "@/lib/pg/envelopes";
import { applyMigrations, splitSqlStatements } from "@/lib/pg/migrate";
import { buildLotsLedger, type LedgerFill } from "@/lib/position-lots";

const XRP = "6aad6b7a-415a-4895-b43c-72c0eca79a55";
const SUI = "6aad6b8e-f2a6-4be3-a803-65940a748d8d";
const MIGRATION_ID = "019_dedupe_fill_keys";

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

function envelope(fills: Fill[]): FillsStoreEnvelope {
  return {
    version: FILLS_STORE_VERSION,
    updatedAt: "2026-10-09T00:00:00.000Z",
    seededAt: "2026-10-09T00:00:00.000Z",
    fills,
    sleevePrints: {},
  };
}

function trade(row: {
  time: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  orderId: string;
  sleeve?: TradeFill["sleeve"];
  venue?: "robinhood" | "coinbase";
  idempotencyKey?: string;
  note?: string;
}): TradeFill {
  return {
    time: row.time,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    orderId: row.orderId,
    result: "filled",
    sleeve: row.sleeve,
    venue: row.venue,
    idempotencyKey: row.idempotencyKey,
    note: row.note,
  };
}

async function insertFill(fill: Fill, source: string): Promise<void> {
  const tradeFill = fill.kind === "bet" ? null : fill;
  await sqlQuery(
    `INSERT INTO fills (
       source, external_id, filled_at, symbol, side, quantity, price, venue, sleeve, result, note, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'filled', $10, $11::jsonb)`,
    [
      source,
      fillRowKey(fill).trim().toLowerCase(),
      fill.time,
      fill.symbol,
      tradeFill?.side ?? null,
      tradeFill?.quantity ?? null,
      tradeFill?.price ?? null,
      fill.venue ?? null,
      tradeFill?.sleeve ?? null,
      fill.note ?? null,
      JSON.stringify(fill),
    ],
  );
}

type StoredFill = {
  id: string;
  source: string;
  external_id: string;
  filled_at: string;
  symbol: string;
  side: string | null;
  quantity: string | null;
  price: string | null;
  venue: string | null;
  sleeve: string | null;
  result: string;
  log_only: boolean;
  note: string | null;
  payload: unknown;
  created_at: string;
};

async function storedRows(where = ""): Promise<StoredFill[]> {
  return sqlQuery<StoredFill>(
    `SELECT id::text AS id, source, external_id, filled_at::text AS filled_at, symbol, side,
            quantity::text AS quantity, price::text AS price, venue, sleeve, result, log_only, note,
            payload, created_at::text AS created_at
     FROM fills
     ${where}
     ORDER BY id`,
  );
}

function migrationSql(): string {
  const migration = EMBEDDED_MIGRATIONS.find((entry) => entry.id === MIGRATION_ID);
  assert.ok(migration);
  return migration.sql;
}

async function countFills(): Promise<number> {
  const rows = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills`);
  return Number(rows[0]?.n ?? "0");
}

function net(rows: LedgerFill[], symbol: string): string {
  let total = "0";
  for (const row of rows) {
    if (row.symbol !== symbol || row.sleeve !== "rh-agentic") continue;
    const quantity = String(row.quantity ?? "");
    if (row.side === "buy") total = addDecimal(total, quantity);
    if (row.side === "sell") total = subtractDecimal(total, quantity);
  }
  return total;
}

describe("fill key dedupe", { concurrency: false }, () => {
  after(() => {
    setSqlClientForTests(null);
  });

  it("backs up the duplicate, keeps one robinhood row, and does not copy again", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(
      EMBEDDED_MIGRATIONS.filter((entry) => entry.id !== "015_dedupe_retagged_fills" && entry.id !== MIGRATION_ID),
    );
    const seedXrp = trade({
      time: "2026-09-18T16:48:58Z",
      symbol: "XRP",
      side: "sell",
      quantity: "10",
      price: "1.36756",
      orderId: XRP,
      sleeve: "rh-agentic",
      venue: "robinhood",
      idempotencyKey: `seed:${XRP}`,
      note: "secret-token",
    });
    const liveXrp = trade({
      time: "2026-09-18T16:48:58Z",
      symbol: "XRP",
      side: "sell",
      quantity: "10",
      price: "1.36756",
      orderId: XRP,
      sleeve: "rh-agentic",
      venue: "robinhood",
      note: "secret-token",
    });
    const seedSui = trade({
      time: "2026-09-18T16:49:18Z",
      symbol: "SUI",
      side: "buy",
      quantity: "16.931",
      price: "0.80729341",
      orderId: SUI,
      sleeve: "rh-agentic",
      venue: "robinhood",
      idempotencyKey: `seed:${SUI}`,
      note: "secret-token",
    });
    const liveSui = trade({
      time: "2026-09-18T16:49:18Z",
      symbol: "SUI",
      side: "buy",
      quantity: "16.931",
      price: "0.80729341",
      orderId: SUI,
      sleeve: "rh-agentic",
      venue: "robinhood",
      note: "secret-token",
    });
    assert.equal(fillRowKey(seedXrp), `seed:${XRP}`);
    assert.equal(fillRowKey(liveXrp), `robinhood:${XRP}`);
    assert.equal(fillRowKey(seedSui), `seed:${SUI}`);
    assert.equal(fillRowKey(liveSui), `robinhood:${SUI}`);
    await insertFill(seedXrp, "seed");
    await insertFill(liveXrp, liveXrp.venue ?? "seed");
    await insertFill(seedSui, "seed");
    await insertFill(liveSui, liveSui.venue ?? "seed");
    await insertFill(
      trade({
        time: "2026-09-01T15:00:00Z",
        symbol: "XRP",
        side: "buy",
        quantity: "475.208",
        price: "1.20",
        orderId: "xrp-buy-475",
        sleeve: "rh-agentic",
        venue: "robinhood",
        idempotencyKey: "robinhood:xrp-buy-475",
      }),
      "robinhood",
    );
    for (const sell of [
      { id: "6aad8347", quantity: "6" },
      { id: "6aad8385", quantity: "2" },
      { id: "6ab14b1f", quantity: "8.931" },
    ]) {
      await insertFill(
        trade({
          time: "2026-09-18T17:00:00Z",
          symbol: "SUI",
          side: "sell",
          quantity: sell.quantity,
          price: "0.90",
          orderId: sell.id,
          sleeve: "rh-agentic",
          venue: "robinhood",
          idempotencyKey: `robinhood:${sell.id}`,
        }),
        "robinhood",
      );
    }
    const printsBefore = await sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
      `SELECT ticker, sleeve_id, quantity FROM sleeve_prints ORDER BY ticker, sleeve_id`,
    );

    const earlier = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "015_dedupe_retagged_fills");
    assert.ok(earlier);
    const earlierStatements = splitSqlStatements(earlier.sql);
    const deletedBy015 = await sqlQuery(earlierStatements[0] ?? "SELECT 1");
    assert.equal(deletedBy015.length, 0);
    for (const statement of earlierStatements.slice(1)) await sqlQuery(statement);
    const retagged = await sqlQuery<{ source: string; external_id: string }>(
      `SELECT source, external_id FROM fills
       WHERE external_id IN ($1, $2, $3, $4)
       ORDER BY external_id`,
      [`seed:${XRP}`, `robinhood:${XRP}`, `seed:${SUI}`, `robinhood:${SUI}`],
    );
    assert.equal(retagged.length, 4);
    assert.equal(retagged.every((row) => row.source === "robinhood"), true);
    const before = await storedRows(
      `WHERE external_id IN ('seed:${XRP}', 'seed:${SUI}')`,
    );
    assert.equal(before.length, 2);
    const countBefore = await countFills();

    const sql = migrationSql();
    assert.equal(sql.includes("sleeve_prints"), false);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      logs.push(String(message));
    };
    let applied: { applied: string[] };
    try {
      applied = await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === MIGRATION_ID || entry.id === "015_dedupe_retagged_fills"));
    } finally {
      console.log = originalLog;
    }
    assert.deepEqual(applied.applied, ["015_dedupe_retagged_fills", MIGRATION_ID]);
    assert.equal(await countFills(), countBefore - 2);

    const survivors = await sqlQuery<{ external_id: string; n: string }>(
      `SELECT payload->>'orderId' AS external_id, count(*)::text AS n
       FROM fills
       WHERE payload->>'orderId' IN ($1, $2)
       GROUP BY payload->>'orderId'
       ORDER BY external_id`,
      [XRP, SUI],
    );
    assert.deepEqual(
      survivors.map((row) => [row.external_id, row.n]),
      [
        [XRP, "1"],
        [SUI, "1"],
      ],
    );
    const kept = await sqlQuery<{ external_id: string }>(
      `SELECT external_id FROM fills WHERE payload->>'orderId' IN ($1, $2) ORDER BY external_id`,
      [XRP, SUI],
    );
    assert.deepEqual(
      kept.map((row) => row.external_id),
      [`robinhood:${XRP}`, `robinhood:${SUI}`],
    );

    const backups = await sqlQuery<StoredFill & { migration_id: string }>(
      `SELECT migration_id, id::text AS id, source, external_id, filled_at::text AS filled_at, symbol, side,
              quantity::text AS quantity, price::text AS price, venue, sleeve, result, log_only, note,
              payload, created_at::text AS created_at
       FROM fills_dedupe_backup
       ORDER BY external_id`,
    );
    assert.equal(backups.length, 2);
    for (const backup of backups) {
      const original = before.find((row) => row.id === backup.id);
      assert.ok(original);
      assert.equal(backup.migration_id, MIGRATION_ID);
      assert.equal(backup.source, original.source);
      assert.equal(backup.external_id, original.external_id);
      assert.equal(backup.filled_at, original.filled_at);
      assert.equal(backup.symbol, original.symbol);
      assert.equal(backup.side, original.side);
      assert.equal(backup.quantity, original.quantity);
      assert.equal(backup.price, original.price);
      assert.equal(backup.venue, original.venue);
      assert.equal(backup.sleeve, original.sleeve);
      assert.equal(backup.result, original.result);
      assert.equal(backup.log_only, original.log_only);
      assert.equal(backup.note, original.note);
      assert.equal(backup.created_at, original.created_at);
      assert.deepEqual(backup.payload, original.payload);
      assert.equal(logs.some((line) => line.includes(`deleted id ${backup.id}`) && line.includes(backup.external_id)), true);
      assert.equal(logs.some((line) => line.includes("secret-token")), false);
    }
    const gone = await sqlQuery<{ id: string }>(
      `SELECT id::text AS id FROM fills WHERE id::text = ANY($1::text[])`,
      [backups.map((row) => row.id)],
    );
    assert.equal(gone.length, 0);

    const ledger = await sqlQuery<LedgerFill>(
      `SELECT symbol, side, quantity::text AS quantity, price::text AS price, sleeve, filled_at::text AS time
       FROM fills`,
    );
    assert.equal(net(ledger, "XRP"), "465.208");
    assert.equal(net(ledger, "SUI"), "0");
    const lots = buildLotsLedger({
      fills: ledger.filter((row) => row.symbol === "XRP"),
      ticker: "XRP",
      sleeve: "rh-agentic",
      quantity: "465.208",
    });
    assert.equal(lots.status, "matched");
    assert.equal(lots.openShares, "465.208");
    const printsAfter = await sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
      `SELECT ticker, sleeve_id, quantity FROM sleeve_prints ORDER BY ticker, sleeve_id`,
    );
    assert.deepEqual(printsAfter, printsBefore);

    const again = [];
    for (const statement of splitSqlStatements(sql)) again.push(await sqlQuery(statement));
    assert.equal(again[1]?.length, 0);
    assert.equal(again[2]?.length, 0);
    assert.equal(again[3]?.length, 0);
    assert.equal(again[4]?.length, 0);
    const backupCount = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills_dedupe_backup`);
    assert.equal(backupCount[0]?.n, "2");
    assert.equal(await countFills(), countBefore - 2);
    const skipped = await applyMigrations([
      EMBEDDED_MIGRATIONS.find((entry) => entry.id === MIGRATION_ID)!,
    ]);
    assert.deepEqual(skipped.applied, []);

    const loaded = await saveFillsEnvelope(
      envelope([
        seedXrp,
        liveXrp,
        seedSui,
        liveSui,
        trade({
          time: "2026-09-01T15:00:00Z",
          symbol: "XRP",
          side: "buy",
          quantity: "475.208",
          price: "1.20",
          orderId: "xrp-buy-475",
          sleeve: "rh-agentic",
          venue: "robinhood",
          idempotencyKey: "robinhood:xrp-buy-475",
        }),
      ]),
    );
    assert.equal(loaded.inserted, 0);
    const afterSave = await sqlQuery<{ n: string; order_id: string }>(
      `SELECT payload->>'orderId' AS order_id, count(*)::text AS n
       FROM fills
       WHERE payload->>'orderId' IN ($1, $2)
       GROUP BY payload->>'orderId'`,
      [XRP, SUI],
    );
    assert.equal(afterSave.every((row) => row.n === "1"), true);
  });

  it("leaves a single row and a group of three untouched", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id !== MIGRATION_ID));
    await insertFill(
      trade({
        time: "2026-09-18T16:48:58Z",
        symbol: "XRP",
        side: "sell",
        quantity: "10",
        price: "1.36756",
        orderId: XRP,
        sleeve: "rh-agentic",
        venue: "robinhood",
        idempotencyKey: `robinhood:${XRP}`,
      }),
      "robinhood",
    );
    for (const key of [`seed:${SUI}`, `robinhood:${SUI}`, SUI]) {
      await insertFill(
        trade({
          time: "2026-09-18T16:49:18Z",
          symbol: "SUI",
          side: "buy",
          quantity: "16.931",
          price: "0.80729341",
          orderId: SUI,
          sleeve: "rh-agentic",
          venue: "robinhood",
          idempotencyKey: key,
        }),
        "robinhood",
      );
    }
    const before = (await storedRows()).map((row) => row.external_id).sort();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };
    try {
      await applyMigrations([EMBEDDED_MIGRATIONS.find((entry) => entry.id === MIGRATION_ID)!]);
    } finally {
      console.warn = originalWarn;
    }
    const after = (await storedRows()).map((row) => row.external_id).sort();
    assert.deepEqual(after, before);
    const backups = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills_dedupe_backup`);
    assert.equal(backups[0]?.n, "0");
    assert.equal(warnings.some((line) => line.includes(SUI) && line.includes("3")), true);
    assert.equal(warnings.some((line) => line.includes(XRP)), false);
    for (const statement of splitSqlStatements(migrationSql())) await sqlQuery(statement);
    assert.equal((await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills_dedupe_backup`))[0]?.n, "0");
    assert.deepEqual((await storedRows()).map((row) => row.external_id).sort(), before);
  });

  it("rolls back the backup when a later statement in the same transaction fails", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS);
    await insertFill(
      trade({
        time: "2026-09-18T16:48:58Z",
        symbol: "XRP",
        side: "sell",
        quantity: "10",
        price: "1",
        orderId: "rollback-order",
        sleeve: "rh-agentic",
        venue: "robinhood",
        idempotencyKey: "robinhood:rollback-order",
      }),
      "robinhood",
    );
    await assert.rejects(
      sqlTransaction([
        {
          text: `INSERT INTO fills_dedupe_backup (
                   migration_id, backed_up_at, id, source, external_id, filled_at, symbol, side,
                   quantity, price, venue, sleeve, result, log_only, note, payload, created_at
                 )
                 SELECT '019_dedupe_fill_keys', now(), id, source, external_id, filled_at, symbol, side,
                   quantity, price, venue, sleeve, result, log_only, note, payload, created_at
                 FROM fills WHERE external_id = 'robinhood:rollback-order'`,
        },
        { text: `SELECT * FROM missing_relation` },
      ]),
    );
    const backups = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills_dedupe_backup`);
    assert.equal(backups[0]?.n, "0");
    assert.equal(await countFills() > 0, true);
  });

  it("does not insert a second row for the same order or the same external id", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS);
    const seeded = trade({
      time: "2026-10-09T15:00:00Z",
      symbol: "XRP",
      side: "buy",
      quantity: "1",
      price: "1",
      orderId: "cross-order",
      sleeve: "rh-agentic",
      venue: "robinhood",
      idempotencyKey: "seed:cross-order",
    });
    const live = trade({
      time: "2026-10-09T15:00:00Z",
      symbol: "XRP",
      side: "buy",
      quantity: "1",
      price: "1.5",
      orderId: "cross-order",
      sleeve: "rh-agentic",
      venue: "robinhood",
    });
    assert.equal(fillRowKey(live), "robinhood:cross-order");
    await saveFillsEnvelope(envelope([seeded]));
    await saveFillsEnvelope(envelope([live]));
    const crossed = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fills WHERE payload->>'orderId' = 'cross-order'`,
    );
    assert.equal(crossed[0]?.n, "1");

    const shared = trade({
      time: "2026-10-09T16:00:00Z",
      symbol: "SUI",
      side: "buy",
      quantity: "2",
      price: "1",
      orderId: "same-ext",
      sleeve: "cb-agentic",
      venue: "coinbase",
      idempotencyKey: "coinbase:same-ext",
    });
    await saveFillsEnvelope(envelope([shared, { ...shared, price: "3" }]));
    await saveFillsEnvelope(envelope([{ ...shared, note: "edited" }]));
    const same = await sqlQuery<{ n: string; price: string }>(
      `SELECT count(*)::text AS n, max(price)::text AS price FROM fills WHERE external_id = 'coinbase:same-ext'`,
    );
    assert.equal(same[0]?.n, "1");
  });
});
