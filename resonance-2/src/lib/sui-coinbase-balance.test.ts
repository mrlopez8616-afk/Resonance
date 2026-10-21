import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { SUI_COINBASE_BALANCE_SQL, EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { applyMigrations } from "@/lib/pg/migrate";
import { readSuiCoinbaseBalance, resetSuiCoinbaseCacheForTests } from "@/lib/sui-coinbase-balance";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AS_OF_ENV = {
  COINBASE_API_KEY_NAME: process.env.COINBASE_API_KEY_NAME,
  COINBASE_API_KEY_SECRET: process.env.COINBASE_API_KEY_SECRET,
};

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

describe("sui coinbase balance store", () => {
  before(() => {
    setSqlClientForTests(memorySql());
  });

  after(() => {
    setSqlClientForTests(null);
    resetSuiCoinbaseCacheForTests();
    if (AS_OF_ENV.COINBASE_API_KEY_NAME === undefined) delete process.env.COINBASE_API_KEY_NAME;
    else process.env.COINBASE_API_KEY_NAME = AS_OF_ENV.COINBASE_API_KEY_NAME;
    if (AS_OF_ENV.COINBASE_API_KEY_SECRET === undefined) delete process.env.COINBASE_API_KEY_SECRET;
    else process.env.COINBASE_API_KEY_SECRET = AS_OF_ENV.COINBASE_API_KEY_SECRET;
  });

  it("registers migration 034 and stores one SUI row", async () => {
    const file = readFileSync(path.join(root, "db/migrations/034_sui_coinbase_balance.sql"), "utf8");
    assert.equal(SUI_COINBASE_BALANCE_SQL, file);
    assert.equal(file.includes("INSERT"), false);
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "035_merge_edmonton_buckley");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "034_sui_coinbase_balance");
    assert.equal(embedded?.sql, file);

    await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === "001_domain_tables" || entry.id === "034_sui_coinbase_balance"));
    delete process.env.COINBASE_API_KEY_NAME;
    delete process.env.COINBASE_API_KEY_SECRET;
    resetSuiCoinbaseCacheForTests();
    const missing = await readSuiCoinbaseBalance({ coinbase: "33.7", cbAgentic: "0" });
    assert.deepEqual(missing, {
      quantities: { coinbase: "33.7", cbAgentic: "0" },
      fresh: false,
      asOf: null,
    });

    await sqlQuery(
      `INSERT INTO sui_coinbase_balance (ticker, coinbase_qty, cb_agentic_qty, observed_at)
       VALUES ('SUI', '49.050865', '0', '2026-10-20T16:32:00.000Z')`,
    );
    const stored = await readSuiCoinbaseBalance({ coinbase: "33.7", cbAgentic: "0" });
    assert.equal(stored.fresh, false);
    assert.deepEqual(stored.quantities, { coinbase: "49.050865", cbAgentic: "0" });
    assert.equal(stored.asOf, "2026-10-20T16:32:00.000Z");
    const again = await sqlQuery(
      `INSERT INTO sui_coinbase_balance (ticker, coinbase_qty, cb_agentic_qty, observed_at)
       VALUES ('SUI', '49.1', '1', '2026-10-21T16:32:00.000Z')
       ON CONFLICT (ticker) DO UPDATE
       SET coinbase_qty = EXCLUDED.coinbase_qty,
           cb_agentic_qty = EXCLUDED.cb_agentic_qty,
           observed_at = EXCLUDED.observed_at`,
    );
    assert.equal(again.length >= 0, true);
    const rows = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM sui_coinbase_balance`);
    assert.equal(rows[0]?.n, "1");
    await assert.rejects(
      sqlQuery(
        `INSERT INTO sui_coinbase_balance (ticker, coinbase_qty, cb_agentic_qty, observed_at)
         VALUES ('XRP', '1', '1', '2026-10-20T16:32:00.000Z')`,
      ),
    );
    const kept = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM sui_coinbase_balance`);
    assert.equal(kept[0]?.n, "1");
    const ticker = await sqlQuery<{ ticker: string }>(`SELECT ticker FROM sui_coinbase_balance`);
    assert.equal(ticker[0]?.ticker, "SUI");
  });
});
