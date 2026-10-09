import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { newDb } from "pg-mem";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate, splitSqlStatements } from "@/lib/pg/migrate";

const MIGRATION_ID = "009_reset_rh_agentic_sleeves";

const EXPECTED_ROWS: readonly (readonly [string, string, string])[] = [
  ["XRP", "rh-agentic", "492.828"],
  ["SUI", "rh-agentic", "0"],
  ["PWR", "rh-agentic", "0.027119"],
  ["ETN", "rh-agentic", "0.043380"],
  ["VRT", "rh-agentic", "0.075844"],
  ["GEV", "rh-agentic", "0.018766"],
  ["CEG", "rh-agentic", "0.065243"],
  ["HUBB", "rh-agentic", "0.039688"],
  ["HBAR", "rh-agentic", "0"],
];

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

function resetSql(): string {
  const migration = EMBEDDED_MIGRATIONS.find((entry) => entry.id === MIGRATION_ID);
  assert.ok(migration);
  const statements = splitSqlStatements(migration.sql);
  assert.equal(statements.length, 1);
  return statements[0] ?? "";
}

describe("rh-agentic sleeve reset", { concurrency: false }, () => {
  after(() => {
    setSqlClientForTests(null);
  });

  it("touches only sleeve_id rh-agentic and these nine tickers", () => {
    const statement = resetSql();
    assert.match(statement, /^INSERT INTO sleeve_prints \(ticker, sleeve_id, quantity\) VALUES/i);
    assert.match(statement, /ON CONFLICT \(ticker, sleeve_id\) DO UPDATE SET quantity = EXCLUDED\.quantity$/);
    const rows = [...statement.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']*)'\s*\)/g)].map(
      (match) => [match[1], match[2], match[3]] as const,
    );
    assert.deepEqual(rows, EXPECTED_ROWS);
    assert.deepEqual(
      [...new Set(rows.map((row) => row[1]))],
      ["rh-agentic"],
    );
    assert.deepEqual(
      rows.map((row) => row[0]),
      ["XRP", "SUI", "PWR", "ETN", "VRT", "GEV", "CEG", "HUBB", "HBAR"],
    );
  });

  it("records 009 once and leaves the same quantities when run again", async () => {
    setSqlClientForTests(memorySql());
    const first = await migrate();
    assert.equal(first.applied.includes(MIGRATION_ID), true);

    const recorded = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM schema_migrations WHERE id = $1`,
      [MIGRATION_ID],
    );
    assert.equal(recorded[0]?.n, "1");

    const loaded = async () =>
      sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
        `SELECT ticker, sleeve_id, quantity FROM sleeve_prints ORDER BY ticker, sleeve_id`,
      );
    const afterFirst = await loaded();
    assert.deepEqual(
      afterFirst.map((row) => [row.ticker, row.sleeve_id, row.quantity]),
      [
        ...EXPECTED_ROWS.map((row) => [...row]),
        ["XRP", "cb-agentic", "10"],
      ].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
    );

    const second = await migrate();
    assert.equal(second.applied.includes(MIGRATION_ID), false);
    assert.equal(second.skipped.includes(MIGRATION_ID), true);
    const recordedAgain = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM schema_migrations WHERE id = $1`,
      [MIGRATION_ID],
    );
    assert.equal(recordedAgain[0]?.n, "1");
    assert.deepEqual(await loaded(), afterFirst);

    await sqlQuery(resetSql());
    assert.deepEqual(await loaded(), afterFirst);
    await sqlQuery(resetSql());
    assert.deepEqual(await loaded(), afterFirst);
  });
});
