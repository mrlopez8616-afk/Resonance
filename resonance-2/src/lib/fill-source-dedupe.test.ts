import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { addDecimal, subtractDecimal } from "@/lib/decimal";
import type { Fill } from "@/data/fills";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { loadFillsEnvelope, saveFillsEnvelope } from "@/lib/pg/envelopes";
import { RETAGGED_FILL_EXTERNAL_IDS } from "@/lib/pg/fill-source-dedupe";
import { applyMigrations, migrate, migrateMigrations, splitSqlStatements } from "@/lib/pg/migrate";
import { SUI_AGENTIC_BUY_ORDER } from "@/lib/pg/sui-sleeve-fix";
import { XRP_AGENTIC_SELL_ORDER } from "@/lib/pg/xrp-sleeve-fix";
import { buildLotsLedger, type LedgerFill } from "@/lib/position-lots";

const XRP_SELL = XRP_AGENTIC_SELL_ORDER;
const SUI_BUY = SUI_AGENTIC_BUY_ORDER;
const XRP_KEY = `seed:${XRP_SELL}`;
const SUI_KEY = `seed:${SUI_BUY}`;

async function postgres(): Promise<SqlClient> {
  const db = new PGlite();
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const result = await db.query<T>(text, [...params]);
      return result.rows ?? [];
    },
  };
}

function without(ids: readonly string[]) {
  const skip = new Set(ids);
  return EMBEDDED_MIGRATIONS.filter((entry) => !skip.has(entry.id));
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

function trade(row: {
  time: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  price: string;
  orderId: string;
  sleeve?: string | null;
  venue?: string | null;
  idempotencyKey?: string;
}): Record<string, unknown> {
  return {
    time: row.time,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    orderId: row.orderId,
    result: "filled",
    ...(row.sleeve ? { sleeve: row.sleeve } : {}),
    ...(row.venue ? { venue: row.venue } : {}),
    ...(row.idempotencyKey ? { idempotencyKey: row.idempotencyKey } : {}),
  };
}

async function seedLegacyPair(): Promise<void> {
  await insertFill({
    source: "seed",
    externalId: XRP_KEY,
    symbol: "XRP",
    side: "sell",
    quantity: "10",
    price: "1.36756",
    sleeve: null,
    venue: null,
    payload: trade({
      time: "2026-09-18T16:48:58Z",
      symbol: "XRP",
      side: "sell",
      quantity: "10",
      price: "1.36756",
      orderId: XRP_SELL,
      idempotencyKey: XRP_KEY,
    }),
  });
  await insertFill({
    source: "seed",
    externalId: SUI_KEY,
    symbol: "SUI",
    side: "buy",
    quantity: "16.931",
    price: "0.80729341",
    sleeve: null,
    venue: null,
    payload: trade({
      time: "2026-09-18T16:49:18Z",
      symbol: "SUI",
      side: "buy",
      quantity: "16.931",
      price: "0.80729341",
      orderId: SUI_BUY,
      idempotencyKey: SUI_KEY,
    }),
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
    payload: trade({
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
  });
  for (const sell of [
    { id: "6aad8347", quantity: "6" },
    { id: "6aad8385", quantity: "2" },
    { id: "6ab14b1f", quantity: "8.931" },
  ]) {
    await insertFill({
      source: "robinhood",
      externalId: `robinhood:${sell.id}`,
      symbol: "SUI",
      side: "sell",
      quantity: sell.quantity,
      price: "0.90",
      sleeve: "rh-agentic",
      venue: "robinhood",
      payload: trade({
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
    });
  }
}

async function sourcesFor(externalId: string): Promise<string[]> {
  const rows = await sqlQuery<{ source: string }>(
    `SELECT source FROM fills WHERE external_id = $1 ORDER BY source`,
    [externalId],
  );
  return rows.map((row) => row.source);
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

async function rhRows(): Promise<LedgerFill[]> {
  const rows = await sqlQuery<{
    symbol: string;
    side: string | null;
    quantity: string | null;
    price: string | null;
    sleeve: string | null;
    filled_at: Date | string;
  }>(
    `SELECT symbol, side, quantity::text AS quantity, price::text AS price, sleeve, filled_at FROM fills`,
  );
  return rows.map((row) => ({
    symbol: row.symbol,
    side: row.side ?? undefined,
    quantity: row.quantity ?? undefined,
    price: row.price ?? undefined,
    sleeve: row.sleeve ?? undefined,
    time: row.filled_at instanceof Date ? row.filled_at.toISOString() : String(row.filled_at),
  }));
}

describe("fill source dedupe", { concurrency: false }, () => {
  after(() => {
    setSqlClientForTests(null);
  });

  it("does not insert a second row when 011 and 012 re-tag venue and a full save runs", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(without(["011_xrp_agentic_sleeve", "012_sui_agentic_sleeve", "015_dedupe_retagged_fills"]));
    await seedLegacyPair();
    await sqlQuery(
      `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity) VALUES ('XRP', 'rh-agentic', '465.208')
       ON CONFLICT (ticker, sleeve_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    );
    const before = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills`);
    await applyMigrations(
      EMBEDDED_MIGRATIONS.filter((entry) =>
        entry.id === "011_xrp_agentic_sleeve" || entry.id === "012_sui_agentic_sleeve",
      ),
    );
    assert.deepEqual(await sourcesFor(XRP_KEY), ["seed"]);
    assert.deepEqual(await sourcesFor(SUI_KEY), ["seed"]);

    const loaded = await loadFillsEnvelope();
    assert.ok(loaded);
    const saved = await saveFillsEnvelope(loaded);
    assert.equal(saved.inserted, 0);
    assert.deepEqual(await sourcesFor(XRP_KEY), ["robinhood"]);
    assert.deepEqual(await sourcesFor(SUI_KEY), ["robinhood"]);
    const after = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills`);
    assert.equal(after[0]?.n, before[0]?.n);

    const again = await saveFillsEnvelope(loaded);
    assert.equal(again.inserted, 0);
    assert.equal((await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills`))[0]?.n, before[0]?.n);

    const rows = await rhRows();
    assert.equal(net(rows, "XRP"), "465.208");
    assert.equal(net(rows, "SUI"), "0");
    const xrp = buildLotsLedger({
      fills: rows.filter((row) => row.symbol === "XRP"),
      ticker: "XRP",
      sleeve: "rh-agentic",
      quantity: "465.208",
    });
    assert.equal(xrp.status, "matched");
    assert.equal(xrp.openShares, "465.208");
    const prints = await sqlQuery<{ quantity: string }>(
      `SELECT quantity FROM sleeve_prints WHERE ticker = 'XRP' AND sleeve_id = 'rh-agentic'`,
    );
    assert.equal(prints[0]?.quantity, "465.208");
  });

  it("removes the seed copy of the two duplicated orders and leaves every other row", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(without(["015_dedupe_retagged_fills"]));
    await seedLegacyPair();
    await insertFill({
      source: "robinhood",
      externalId: XRP_KEY,
      symbol: "XRP",
      side: "sell",
      quantity: "10",
      price: "1.36756",
      sleeve: null,
      venue: null,
      payload: trade({
        time: "2026-09-18T16:48:58Z",
        symbol: "XRP",
        side: "sell",
        quantity: "10",
        price: "1.36756",
        orderId: XRP_SELL,
        idempotencyKey: XRP_KEY,
      }),
    });
    await insertFill({
      source: "robinhood",
      externalId: SUI_KEY,
      symbol: "SUI",
      side: "buy",
      quantity: "16.931",
      price: "0.80729341",
      sleeve: "rh-agentic",
      venue: "robinhood",
      payload: trade({
        time: "2026-09-18T16:49:18Z",
        symbol: "SUI",
        side: "buy",
        quantity: "16.931",
        price: "0.80729341",
        orderId: SUI_BUY,
        sleeve: "rh-agentic",
        venue: "robinhood",
        idempotencyKey: SUI_KEY,
      }),
    });
    await insertFill({
      source: "seed",
      externalId: "shared-order",
      symbol: "XRP",
      side: "buy",
      quantity: "1",
      price: "1",
      sleeve: null,
      venue: null,
      payload: trade({
        time: "2026-09-02T15:00:00Z",
        symbol: "XRP",
        side: "buy",
        quantity: "1",
        price: "1",
        orderId: "shared-order",
      }),
    });
    await insertFill({
      source: "coinbase",
      externalId: "shared-order",
      symbol: "XRP",
      side: "buy",
      quantity: "1",
      price: "1",
      sleeve: "coinbase",
      venue: "coinbase",
      payload: trade({
        time: "2026-09-02T15:00:00Z",
        symbol: "XRP",
        side: "buy",
        quantity: "1",
        price: "1",
        orderId: "shared-order",
        sleeve: "coinbase",
        venue: "coinbase",
      }),
    });
    await sqlQuery(
      `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity)
       VALUES ('SUI', 'rh-agentic', '0')
       ON CONFLICT (ticker, sleeve_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    );
    const printsBefore = await sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
      `SELECT ticker, sleeve_id, quantity FROM sleeve_prints ORDER BY ticker, sleeve_id`,
    );

    const migration = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "015_dedupe_retagged_fills");
    assert.ok(migration);
    assert.equal(migration.sql.includes("sleeve_prints"), false);
    const statements = splitSqlStatements(migration.sql);
    const first: unknown[][] = [];
    for (const statement of statements) first.push(await sqlQuery(statement));
    assert.deepEqual(
      (first[0] as { external_id: string }[]).map((row) => row.external_id).sort(),
      [XRP_KEY, SUI_KEY],
    );
    const applied = await applyMigrations([migration]);
    assert.deepEqual(applied.applied, ["015_dedupe_retagged_fills"]);

    assert.deepEqual(await sourcesFor(XRP_KEY), ["robinhood"]);
    assert.deepEqual(await sourcesFor(SUI_KEY), ["robinhood"]);
    assert.deepEqual(await sourcesFor("shared-order"), ["coinbase", "seed"]);
    const kept = await sqlQuery<{
      external_id: string;
      sleeve: string | null;
      venue: string | null;
      payload: { sleeve?: string; venue?: string };
    }>(
      `SELECT external_id, sleeve, venue, payload
       FROM fills
       WHERE external_id = ANY($1::text[])
       ORDER BY external_id`,
      [RETAGGED_FILL_EXTERNAL_IDS],
    );
    assert.equal(kept.length, 2);
    for (const row of kept) {
      assert.equal(row.sleeve, "rh-agentic");
      assert.equal(row.venue, "robinhood");
      assert.equal(row.payload.sleeve, "rh-agentic");
      assert.equal(row.payload.venue, "robinhood");
    }
    const rows = await rhRows();
    assert.equal(net(rows, "XRP"), "465.208");
    assert.equal(net(rows, "SUI"), "0");
    const xrp = buildLotsLedger({
      fills: rows.filter((row) => row.symbol === "XRP"),
      ticker: "XRP",
      sleeve: "rh-agentic",
      quantity: "465.208",
    });
    assert.equal(xrp.openShares, "465.208");
    assert.equal(xrp.status, "matched");

    const printsAfter = await sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
      `SELECT ticker, sleeve_id, quantity FROM sleeve_prints ORDER BY ticker, sleeve_id`,
    );
    assert.deepEqual(printsAfter, printsBefore);

    const second: unknown[][] = [];
    for (const statement of statements) second.push(await sqlQuery(statement));
    assert.equal((second[0] as unknown[]).length, 0);
    assert.equal((second[1] as unknown[]).length, 0);
    assert.equal((second[2] as unknown[]).length, 0);
    const remaining = second[3] as { multi_source_external_ids: number }[];
    assert.equal(Number(remaining[0]?.multi_source_external_ids), 1);
    const skipped = await applyMigrations([migration]);
    assert.deepEqual(skipped.applied, []);
    assert.equal(skipped.skipped.includes("015_dedupe_retagged_fills"), true);
    assert.deepEqual(await sourcesFor("shared-order"), ["coinbase", "seed"]);
  });

  it("retags a lone seed row and does not duplicate coinbase or cb-agentic fills", async () => {
    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS);
    await insertFill({
      source: "seed",
      externalId: XRP_KEY,
      symbol: "XRP",
      side: "sell",
      quantity: "10",
      price: "1.36756",
      sleeve: "rh-agentic",
      venue: "robinhood",
      payload: trade({
        time: "2026-09-18T16:48:58Z",
        symbol: "XRP",
        side: "sell",
        quantity: "10",
        price: "1.36756",
        orderId: XRP_SELL,
        sleeve: "rh-agentic",
        venue: "robinhood",
        idempotencyKey: XRP_KEY,
      }),
    });
    const migration = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "015_dedupe_retagged_fills");
    assert.ok(migration);
    for (const statement of splitSqlStatements(migration.sql)) await sqlQuery(statement);
    assert.deepEqual(await sourcesFor(XRP_KEY), ["robinhood"]);
    const second = [];
    for (const statement of splitSqlStatements(migration.sql)) second.push(await sqlQuery(statement));
    assert.equal(second[0]?.length, 0);
    assert.equal(second[1]?.length, 0);
    assert.equal(second[2]?.length, 0);

    const loaded = await loadFillsEnvelope();
    assert.ok(loaded);
    const coinbaseIds = [
      "coinbase:6bab89a3-fdbb-4768-92f4-dbb5654bf1f3",
      "coinbase:4ef87d64-62b4-42f1-ac48-7db6941d5ba8",
    ];
    for (const id of coinbaseIds) assert.deepEqual(await sourcesFor(id), ["coinbase"]);
    await saveFillsEnvelope(loaded);
    for (const id of coinbaseIds) assert.deepEqual(await sourcesFor(id), ["coinbase"]);

    await sqlQuery(`UPDATE fills SET source = 'seed' WHERE external_id = $1`, [coinbaseIds[0]]);
    const flipped = await loadFillsEnvelope();
    assert.ok(flipped);
    const coinbaseFill = flipped.fills.find(
      (row): row is Fill => row.kind !== "bet" && row.orderId === "6bab89a3-fdbb-4768-92f4-dbb5654bf1f3",
    );
    assert.equal(coinbaseFill?.venue, "coinbase");
    await saveFillsEnvelope(flipped);
    assert.deepEqual(await sourcesFor(coinbaseIds[0] ?? ""), ["coinbase"]);
    assert.equal(
      (await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills WHERE external_id = $1`, [coinbaseIds[0]]))[0]?.n,
      "1",
    );

    const agentic: Fill = {
      time: "2026-10-09T15:21:33-05:00",
      symbol: "SUI",
      side: "buy",
      quantity: "1.2",
      price: "1.0601340274",
      orderId: "cb-agentic-sui-1",
      result: "filled",
      venue: "coinbase",
      sleeve: "cb-agentic",
      idempotencyKey: "coinbase:cb-agentic-sui-1",
    };
    const withAgentic = { ...flipped, fills: [...flipped.fills, agentic] };
    await saveFillsEnvelope(withAgentic);
    await saveFillsEnvelope(withAgentic);
    assert.deepEqual(await sourcesFor("coinbase:cb-agentic-sui-1"), ["coinbase"]);
    await sqlQuery(`UPDATE fills SET source = 'seed' WHERE external_id = 'coinbase:cb-agentic-sui-1'`);
    const reloaded = await loadFillsEnvelope();
    assert.ok(reloaded);
    await saveFillsEnvelope(reloaded);
    assert.deepEqual(await sourcesFor("coinbase:cb-agentic-sui-1"), ["coinbase"]);
    assert.equal(
      (
        await sqlQuery<{ n: string }>(
          `SELECT count(*)::text AS n FROM fills WHERE external_id = 'coinbase:cb-agentic-sui-1'`,
        )
      )[0]?.n,
      "1",
    );
  });

  it("applies 015 when 016 is already recorded", async () => {
    setSqlClientForTests(await postgres());
    const first = await migrateMigrations(without(["015_dedupe_retagged_fills"]));
    assert.equal(first.applied.includes("016_build_items"), true);
    assert.equal(first.applied.includes("015_dedupe_retagged_fills"), false);
    const second = await migrate();
    assert.deepEqual(second.applied, ["015_dedupe_retagged_fills"]);
    assert.equal(second.skipped.includes("016_build_items"), true);
    const third = await migrate();
    assert.deepEqual(third.applied, []);
    assert.equal(third.skipped.includes("015_dedupe_retagged_fills"), true);
    assert.equal(third.skipped.includes("016_build_items"), true);
  });
});
