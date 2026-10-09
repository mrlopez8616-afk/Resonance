import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { newDb } from "pg-mem";
import { addDecimal, subtractDecimal } from "@/lib/decimal";
import { overlayStoredFillFields } from "@/lib/fills";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations, migrate, splitSqlStatements } from "@/lib/pg/migrate";
import { SUI_AGENTIC_BUY_ORDER, patchSuiAgenticBuyPayload } from "@/lib/pg/sui-sleeve-fix";
import { buildLotsLedger, type LedgerFill } from "@/lib/position-lots";

const BUY = SUI_AGENTIC_BUY_ORDER;
const COINBASE_BUYS = [
  {
    orderId: "6bab89a3-fdbb-4768-92f4-dbb5654bf1f3",
    quantity: "16.8",
    price: "0.8020710385",
    time: "2026-09-18T12:49:23-05:00",
  },
  {
    orderId: "4ef87d64-62b4-42f1-ac48-7db6941d5ba8",
    quantity: "16.9",
    price: "0.8019",
    time: "2026-09-18T12:51:58-05:00",
  },
] as const;

function memorySql(): SqlClient {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const result = await pool.query(text, [...params]);
      return (result.rows ?? []) as T[];
    },
  };
}

function migrationSql(id: string): string[] {
  const migration = EMBEDDED_MIGRATIONS.find((entry) => entry.id === id);
  assert.ok(migration);
  return splitSqlStatements(migration.sql);
}

async function insertFill(row: {
  source: string;
  externalId: string;
  symbol: string;
  side: string;
  quantity: string;
  price: string;
  sleeve: string | null;
  venue: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  await sqlQuery(
    `INSERT INTO fills (
       source, external_id, filled_at, symbol, side, quantity, price, venue, sleeve, result, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'filled', $10::jsonb)`,
    [
      row.source,
      row.externalId,
      String(row.payload.time),
      row.symbol,
      row.side,
      row.quantity,
      row.price,
      row.venue,
      row.sleeve,
      JSON.stringify(row.payload),
    ],
  );
}

async function prints(): Promise<{ ticker: string; sleeve_id: string; quantity: string }[]> {
  return sqlQuery(
    `SELECT ticker, sleeve_id, quantity FROM sleeve_prints ORDER BY ticker, sleeve_id`,
  );
}

describe("SUI sleeve corrections", { concurrency: false }, () => {
  after(() => {
    setSqlClientForTests(null);
  });

  it("assigns only the Sep 18 SUI buy, nets rh-agentic to 0, and is safe to run twice", async () => {
    setSqlClientForTests(memorySql());
    const prior = EMBEDDED_MIGRATIONS.filter((entry) => entry.id !== "012_sui_agentic_sleeve");
    await applyMigrations(prior);

    await insertFill({
      source: "seed",
      externalId: `seed:${BUY}`,
      symbol: "SUI",
      side: "buy",
      quantity: "16.931",
      price: "0.80729341",
      sleeve: null,
      venue: null,
      payload: {
        time: "2026-09-18T16:49:19Z",
        symbol: "SUI",
        side: "buy",
        quantity: "16.931",
        price: "0.80729341",
        orderId: BUY,
        result: "filled",
      },
    });
    const sells = [
      { id: "6aad8347", quantity: "6" },
      { id: "6aad8385", quantity: "2" },
      { id: "6ab14b1f", quantity: "8.931" },
    ];
    for (const sell of sells) {
      await insertFill({
        source: "robinhood",
        externalId: `robinhood:${sell.id}`,
        symbol: "SUI",
        side: "sell",
        quantity: sell.quantity,
        price: "0.90",
        sleeve: "rh-agentic",
        venue: "robinhood",
        payload: {
          time: "2026-09-18T17:00:00Z",
          symbol: "SUI",
          side: "sell",
          quantity: sell.quantity,
          price: "0.90",
          orderId: sell.id,
          result: "filled",
          sleeve: "rh-agentic",
          venue: "robinhood",
        },
      });
    }
    await insertFill({
      source: "seed",
      externalId: "seed:sui-other-null",
      symbol: "SUI",
      side: "buy",
      quantity: "1",
      price: "0.80",
      sleeve: null,
      venue: null,
      payload: {
        time: "2026-09-19T16:00:00Z",
        symbol: "SUI",
        side: "buy",
        quantity: "1",
        price: "0.80",
        orderId: "sui-other-null",
        result: "filled",
      },
    });
    await insertFill({
      source: "seed",
      externalId: "seed:xrp-null",
      symbol: "XRP",
      side: "buy",
      quantity: "3",
      price: "1.20",
      sleeve: null,
      venue: null,
      payload: {
        time: "2026-09-19T16:00:00Z",
        symbol: "XRP",
        side: "buy",
        quantity: "3",
        price: "1.20",
        orderId: BUY,
        result: "filled",
      },
    });

    const statements = migrationSql("012_sui_agentic_sleeve");
    assert.equal(statements.length, 1);
    assert.equal(statements[0]?.includes("sleeve_prints"), false);
    const before = await prints();

    const first = await sqlQuery<{ external_id: string }>(statements[0] ?? "");
    assert.deepEqual(first.map((row) => row.external_id), [`seed:${BUY}`]);
    assert.equal(await patchSuiAgenticBuyPayload(), 1);

    const second = await sqlQuery(statements[0] ?? "");
    assert.equal(second.length, 0);
    assert.equal(await patchSuiAgenticBuyPayload(), 0);

    const applied = await migrate();
    assert.equal(applied.applied.includes("012_sui_agentic_sleeve"), true);
    const again = await migrate();
    assert.equal(again.applied.includes("012_sui_agentic_sleeve"), false);
    assert.equal(again.skipped.includes("012_sui_agentic_sleeve"), true);
    assert.equal((await sqlQuery(statements[0] ?? "")).length, 0);

    const rows = await sqlQuery<{
      external_id: string;
      symbol: string;
      side: string;
      quantity: string;
      sleeve: string | null;
      venue: string | null;
      payload: unknown;
    }>(
      `SELECT external_id, symbol, side, quantity::text AS quantity, sleeve, venue, payload
       FROM fills ORDER BY external_id`,
    );
    const buy = rows.find((row) => row.external_id === `seed:${BUY}`);
    const other = rows.find((row) => row.external_id === "seed:sui-other-null");
    const xrp = rows.find((row) => row.external_id === "seed:xrp-null");
    assert.equal(buy?.sleeve, "rh-agentic");
    assert.equal(buy?.venue, "robinhood");
    const payload = overlayStoredFillFields(buy?.payload, { sleeve: buy?.sleeve, venue: buy?.venue }) as {
      sleeve?: string;
      venue?: string;
    };
    assert.equal(payload.sleeve, "rh-agentic");
    assert.equal(payload.venue, "robinhood");
    assert.equal(other?.sleeve, null);
    assert.equal(xrp?.sleeve, null);
    assert.equal(xrp?.symbol, "XRP");

    let net = "0";
    for (const row of rows) {
      if (row.symbol !== "SUI" || row.sleeve !== "rh-agentic") continue;
      net = row.side === "buy" ? addDecimal(net, row.quantity) : subtractDecimal(net, row.quantity);
    }
    assert.equal(net, "0");
    assert.deepEqual(await prints(), before);
  });

  it("inserts the two Coinbase SUI buys once and does not change sleeves", async () => {
    setSqlClientForTests(memorySql());
    const prior = EMBEDDED_MIGRATIONS.filter((entry) => entry.id !== "013_sui_coinbase_backfill");
    await applyMigrations(prior);
    await sqlQuery(
      `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity) VALUES ('SUI', 'coinbase', '33.7')
       ON CONFLICT (ticker, sleeve_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    );
    await sqlQuery(
      `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity) VALUES ('SUI', 'rh-agentic', '0')
       ON CONFLICT (ticker, sleeve_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    );
    const before = await prints();
    const statements = migrationSql("013_sui_coinbase_backfill");
    assert.equal(statements.length, 2);
    assert.equal(statements.join("\n").includes("sleeve_prints"), false);

    const inserted: string[] = [];
    for (const statement of statements) {
      const rows = await sqlQuery<{ external_id: string }>(statement);
      inserted.push(...rows.map((row) => row.external_id));
    }
    assert.deepEqual(inserted, [
      "coinbase:6bab89a3-fdbb-4768-92f4-dbb5654bf1f3",
      "coinbase:4ef87d64-62b4-42f1-ac48-7db6941d5ba8",
    ]);

    const replay: string[] = [];
    for (const statement of statements) {
      const rows = await sqlQuery<{ external_id: string }>(statement);
      replay.push(...rows.map((row) => row.external_id));
    }
    assert.deepEqual(replay, []);
    assert.deepEqual(await prints(), before);

    const applied = await migrate();
    assert.equal(applied.applied.includes("013_sui_coinbase_backfill"), true);
    const again = await migrate();
    assert.equal(again.skipped.includes("013_sui_coinbase_backfill"), true);
    const count = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills WHERE symbol = 'SUI' AND sleeve = 'coinbase'`);
    assert.equal(count[0]?.n, "2");
    assert.deepEqual(await prints(), before);

    const stored = await sqlQuery<{ payload: unknown; sleeve: string | null; venue: string | null }>(
      `SELECT payload, sleeve, venue FROM fills WHERE symbol = 'SUI' AND sleeve = 'coinbase' ORDER BY external_id`,
    );
    const fills = stored.map((row) => overlayStoredFillFields(row.payload, row) as LedgerFill);
    assert.deepEqual(
      fills.map((row) => row.quantity),
      ["16.9", "16.8"],
    );
    assert.equal(fills.every((row) => row.sleeve === "coinbase"), true);
    const ledger = buildLotsLedger({
      fills,
      ticker: "SUI",
      sleeve: "coinbase",
      quantity: "33.7",
      livePrice: 1,
    });
    assert.equal(ledger.status, "matched");
    assert.equal(ledger.openShares, "33.7");
    assert.equal(ledger.gapShares, null);
    assert.equal(ledger.note, null);
    assert.equal(JSON.stringify(ledger).includes("entry unknown"), false);
    assert.equal(addDecimal(COINBASE_BUYS[0].quantity, COINBASE_BUYS[1].quantity), "33.7");
  });

  it("seeds cb-agentic with 10 XRP and does not touch another sleeve", async () => {
    setSqlClientForTests(memorySql());
    const prior = EMBEDDED_MIGRATIONS.filter((entry) => entry.id !== "014_cb_agentic_xrp");
    await applyMigrations(prior);
    await sqlQuery(
      `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity) VALUES ('SUI', 'coinbase', '33.7')
       ON CONFLICT (ticker, sleeve_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    );
    const statements = migrationSql("014_cb_agentic_xrp");
    assert.equal(statements.length, 1);
    assert.equal(statements[0]?.includes("rh-agentic"), false);
    assert.equal(statements[0]?.includes("coinbase"), false);

    const first = await sqlQuery<{ sleeve_id: string }>(statements[0] ?? "");
    assert.deepEqual(first.map((row) => row.sleeve_id), ["cb-agentic"]);
    const second = await sqlQuery(statements[0] ?? "");
    assert.equal(second.length, 0);

    await sqlQuery(`UPDATE sleeve_prints SET quantity = '7' WHERE ticker = 'XRP' AND sleeve_id = 'cb-agentic'`);
    const kept = await sqlQuery(statements[0] ?? "");
    assert.equal(kept.length, 0);
    const quantity = await sqlQuery<{ quantity: string }>(
      `SELECT quantity FROM sleeve_prints WHERE ticker = 'XRP' AND sleeve_id = 'cb-agentic'`,
    );
    assert.equal(quantity[0]?.quantity, "7");

    await sqlQuery(`DELETE FROM sleeve_prints WHERE ticker = 'XRP' AND sleeve_id = 'cb-agentic'`);
    const applied = await migrate();
    assert.equal(applied.applied.includes("014_cb_agentic_xrp"), true);
    const seeded = await sqlQuery<{ quantity: string }>(
      `SELECT quantity FROM sleeve_prints WHERE ticker = 'XRP' AND sleeve_id = 'cb-agentic'`,
    );
    assert.equal(seeded[0]?.quantity, "10");
    const others = await sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
      `SELECT ticker, sleeve_id, quantity FROM sleeve_prints
       WHERE NOT (ticker = 'XRP' AND sleeve_id = 'cb-agentic')
       ORDER BY ticker, sleeve_id`,
    );
    assert.equal(
      others.some((row) => row.ticker === "XRP" && row.sleeve_id === "rh-agentic" && row.quantity === "492.828"),
      true,
    );
    assert.equal(
      others.some((row) => row.ticker === "SUI" && row.sleeve_id === "coinbase" && row.quantity === "33.7"),
      true,
    );
    const again = await migrate();
    assert.equal(again.skipped.includes("014_cb_agentic_xrp"), true);
  });
});
