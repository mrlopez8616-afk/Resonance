import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { newDb } from "pg-mem";
import { overlayStoredFillFields } from "@/lib/fills";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations, migrate, splitSqlStatements } from "@/lib/pg/migrate";
import { XRP_AGENTIC_SELL_ORDER, patchXrpAgenticSellPayload } from "@/lib/pg/xrp-sleeve-fix";
import { buildLotsLedger, type LedgerFill } from "@/lib/position-lots";

const ORDER = XRP_AGENTIC_SELL_ORDER;

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

function columnUpdateSql(): string {
  const migration = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "011_xrp_agentic_sleeve");
  assert.ok(migration);
  const statements = splitSqlStatements(migration.sql);
  assert.equal(statements.length, 1);
  return statements[0] ?? "";
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

describe("XRP agentic sleeve correction", { concurrency: false }, () => {
  after(() => {
    setSqlClientForTests(null);
  });

  it("assigns only the Sep 18 sell, then changes nothing on a second run", async () => {
    setSqlClientForTests(memorySql());
    const prior = EMBEDDED_MIGRATIONS.filter((entry) => entry.id !== "011_xrp_agentic_sleeve");
    await applyMigrations(prior);

    await insertFill({
      source: "seed",
      externalId: `seed:${ORDER}`,
      symbol: "XRP",
      side: "sell",
      quantity: "10",
      price: "1.36756",
      sleeve: null,
      venue: null,
      payload: {
        time: "2026-09-18T16:48:58Z",
        symbol: "XRP",
        side: "sell",
        quantity: "10",
        price: "1.36756",
        orderId: ORDER,
        result: "filled",
      },
    });
    await insertFill({
      source: "robinhood",
      externalId: "robinhood:xrp-buy-475",
      symbol: "XRP",
      side: "buy",
      quantity: "475.208",
      price: "1.20",
      sleeve: "rh-agentic",
      venue: "robinhood",
      payload: {
        time: "2026-09-01T15:00:00Z",
        symbol: "XRP",
        side: "buy",
        quantity: "475.208",
        price: "1.20",
        orderId: "xrp-buy-475",
        result: "filled",
        sleeve: "rh-agentic",
        venue: "robinhood",
      },
    });
    await insertFill({
      source: "seed",
      externalId: "seed:xrp-null-other",
      symbol: "XRP",
      side: "buy",
      quantity: "100",
      price: "1.10",
      sleeve: null,
      venue: null,
      payload: {
        time: "2026-09-02T15:00:00Z",
        symbol: "XRP",
        side: "buy",
        quantity: "100",
        price: "1.10",
        orderId: "xrp-null-other",
        result: "filled",
      },
    });
    await insertFill({
      source: "seed",
      externalId: "seed:sui-null",
      symbol: "SUI",
      side: "buy",
      quantity: "16.931",
      price: "0.80",
      sleeve: null,
      venue: null,
      payload: {
        time: "2026-09-18T16:49:18Z",
        symbol: "SUI",
        side: "buy",
        quantity: "16.931",
        price: "0.80",
        orderId: "6aad6b8e-f2a6-4be3-a803-65940a748d8d",
        result: "filled",
      },
    });
    const printsBefore = await sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
      `SELECT ticker, sleeve_id, quantity FROM sleeve_prints ORDER BY ticker, sleeve_id`,
    );

    const statement = columnUpdateSql();
    const first = await sqlQuery<{ external_id: string }>(statement);
    assert.deepEqual(first.map((row) => row.external_id), [`seed:${ORDER}`]);
    const payloadRows = await patchXrpAgenticSellPayload();
    assert.equal(payloadRows, 1);

    const second = await sqlQuery(statement);
    assert.equal(second.length, 0);
    assert.equal(await patchXrpAgenticSellPayload(), 0);

    const applied = await migrate();
    assert.equal(applied.applied.includes("011_xrp_agentic_sleeve"), true);
    const again = await migrate();
    assert.equal(again.applied.includes("011_xrp_agentic_sleeve"), false);
    assert.equal(again.skipped.includes("011_xrp_agentic_sleeve"), true);
    assert.equal((await sqlQuery(statement)).length, 0);

    const rows = await sqlQuery<{
      external_id: string;
      symbol: string;
      sleeve: string | null;
      venue: string | null;
      payload: unknown;
    }>(`SELECT external_id, symbol, sleeve, venue, payload FROM fills ORDER BY external_id`);
    const sell = rows.find((row) => row.external_id === `seed:${ORDER}`);
    const other = rows.find((row) => row.external_id === "seed:xrp-null-other");
    const sui = rows.find((row) => row.external_id === "seed:sui-null");
    const buy = rows.find((row) => row.external_id === "robinhood:xrp-buy-475");
    assert.equal(sell?.sleeve, "rh-agentic");
    assert.equal(sell?.venue, "robinhood");
    assert.equal(other?.sleeve, null);
    assert.equal(other?.venue, null);
    assert.equal(sui?.sleeve, null);
    assert.equal(buy?.sleeve, "rh-agentic");

    const printsAfter = await sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
      `SELECT ticker, sleeve_id, quantity FROM sleeve_prints ORDER BY ticker, sleeve_id`,
    );
    assert.deepEqual(printsAfter, printsBefore);

    const fills = rows.map((row) => overlayStoredFillFields(row.payload, row) as LedgerFill);
    const ledger = buildLotsLedger({
      fills,
      ticker: "XRP",
      sleeve: "rh-agentic",
      quantity: "465.208",
      livePrice: 1.4,
    });
    assert.equal(ledger.status, "matched");
    assert.equal(ledger.openShares, "465.208");
    assert.equal(ledger.note, null);
    assert.equal(ledger.gapShares, null);
    assert.equal(ledger.openLots.length > 0, true);
    assert.equal(ledger.openLots.some((lot) => lot.sharesLabel.includes("entry unknown")), false);
    const totalsText = JSON.stringify(ledger);
    assert.equal(totalsText.includes("entry unknown"), false);
  });
});
