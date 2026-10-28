import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { BUCKLEY_EVENT_SLUG, BUCKLEY_EVENT_TITLE } from "@/lib/fight-event-alias";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { patchEdmontonEventPayloads } from "@/lib/pg/edmonton-event-merge";
import { applyMigrations, splitSqlStatements } from "@/lib/pg/migrate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION_ID = "035_merge_edmonton_buckley";

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

describe("edmonton event merge", { concurrency: false }, () => {
  after(() => {
    setSqlClientForTests(null);
  });

  it("backs up Edmonton rows, moves them onto Buckley, and changes nothing the second time", async () => {
    const file = readFileSync(path.join(root, "db/migrations/035_merge_edmonton_buckley.sql"), "utf8");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === MIGRATION_ID);
    assert.equal(embedded?.sql, file);
    assert.equal(splitSqlStatements(file).some((statement) => /^delete\b/i.test(statement)), false);
    assert.equal(EMBEDDED_MIGRATIONS.at(-4)?.id, MIGRATION_ID);
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "038_backup_runs");

    setSqlClientForTests(memorySql());
    await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id !== MIGRATION_ID));

    await sqlQuery(
      `INSERT INTO bets (
         id, order_id, event, fight, fight_slug, pick, stake, odds_pct, payout, status,
         venue, ticker, placed_at, payload
       ) VALUES
       (
         'ed-bet', 'ed-bet', 'UFC Fight Night: Edmonton', 'A One vs B Two', 'a-one-vs-b-two',
         'A One', 1, 55, 1.8, 'open', 'coinbase-predict', 'UFC', '2026-10-17T23:00:00Z',
         '{"id":"ed-bet","event":"UFC Fight Night: Edmonton","stake":"1.00","realizedPnl":"-1.00"}'::jsonb
       ),
       (
         'other-bet', 'other-bet', 'UFC 325', 'C vs D', 'c-vs-d',
         'C', 2, 50, 4, 'won', 'coinbase-predict', 'UFC', '2026-10-01T23:00:00Z',
         '{"id":"other-bet","event":"UFC 325","stake":"2.00"}'::jsonb
       )`,
    );
    await sqlQuery(
      `INSERT INTO fight_breakdowns (event_slug, fight_slug, a_name, b_name) VALUES
       ('ufc-edmonton', 'a-one-vs-b-two', 'A One', 'B Two'),
       ('ufc-fight-night-buckley-vs-malott', 'a-one-vs-b-two', 'A One', 'B Two'),
       ('ufc-edmonton', 'c-vs-d', 'C', 'D')`,
    );
    await sqlQuery(
      `INSERT INTO fight_results (fight_slug, event, winner, method, round, clock, status, payload)
       VALUES (
         'a-one-vs-b-two', 'ufc-edmonton', 'A One', 'KO', 1, '1:11', 'final',
         '{"event":"ufc-edmonton","fightSlug":"a-one-vs-b-two","winner":"A One","realizedPnl":"1.50"}'::jsonb
       )`,
    );
    await sqlQuery(
      `INSERT INTO calendar_entries (id, kind, start_at, title, status, writer, event_slug, payload)
       VALUES (
         'cal-ed', 'fight', '2026-10-17T23:00:00Z', 'UFC Fight Night: Edmonton', 'scheduled', 'agent',
         'ufc-edmonton',
         '{"id":"cal-ed","title":"UFC Fight Night: Edmonton","eventSlug":"ufc-edmonton"}'::jsonb
       )`,
    );

    const applied = await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === MIGRATION_ID));
    assert.deepEqual(applied.applied, [MIGRATION_ID]);

    const bet = await sqlQuery<{ event: string; payload: { event?: string; realizedPnl?: string } }>(
      `SELECT event, payload FROM bets WHERE id = 'ed-bet'`,
    );
    assert.equal(bet[0]?.event, BUCKLEY_EVENT_TITLE);
    assert.equal(bet[0]?.payload.event, BUCKLEY_EVENT_TITLE);
    assert.equal(bet[0]?.payload.realizedPnl, "-1.00");
    const other = await sqlQuery<{ event: string; payload: { event?: string } }>(
      `SELECT event, payload FROM bets WHERE id = 'other-bet'`,
    );
    assert.equal(other[0]?.event, "UFC 325");
    assert.equal(other[0]?.payload.event, "UFC 325");

    const breakdowns = await sqlQuery<{ event_slug: string; fight_slug: string }>(
      `SELECT event_slug, fight_slug FROM fight_breakdowns ORDER BY event_slug, fight_slug`,
    );
    assert.deepEqual(breakdowns, [
      { event_slug: "ufc-edmonton", fight_slug: "a-one-vs-b-two" },
      { event_slug: BUCKLEY_EVENT_SLUG, fight_slug: "a-one-vs-b-two" },
      { event_slug: BUCKLEY_EVENT_SLUG, fight_slug: "c-vs-d" },
    ]);

    const result = await sqlQuery<{ event: string; payload: { event?: string; realizedPnl?: string } }>(
      `SELECT event, payload FROM fight_results WHERE fight_slug = 'a-one-vs-b-two'`,
    );
    assert.equal(result[0]?.event, BUCKLEY_EVENT_SLUG);
    assert.equal(result[0]?.payload.event, BUCKLEY_EVENT_SLUG);
    assert.equal(result[0]?.payload.realizedPnl, "1.50");

    const calendar = await sqlQuery<{
      event_slug: string;
      title: string;
      payload: { eventSlug?: string; title?: string };
    }>(`SELECT event_slug, title, payload FROM calendar_entries WHERE id = 'cal-ed'`);
    assert.equal(calendar[0]?.event_slug, BUCKLEY_EVENT_SLUG);
    assert.equal(calendar[0]?.title, "UFC Fight Night: Edmonton");
    assert.equal(calendar[0]?.payload.eventSlug, BUCKLEY_EVENT_SLUG);
    assert.equal(calendar[0]?.payload.title, "UFC Fight Night: Edmonton");

    const backup = await sqlQuery<{ table_name: string; n: string }>(
      `SELECT table_name, count(*)::text AS n
       FROM fight_event_merge_backup
       WHERE migration_id = $1
       GROUP BY table_name
       ORDER BY table_name`,
      [MIGRATION_ID],
    );
    assert.deepEqual(backup, [
      { table_name: "bets", n: "1" },
      { table_name: "calendar_entries", n: "1" },
      { table_name: "fight_breakdowns", n: "2" },
      { table_name: "fight_results", n: "1" },
    ]);

    const skipped = await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === MIGRATION_ID));
    assert.deepEqual(skipped.applied, []);
    assert.deepEqual(skipped.skipped, [MIGRATION_ID]);

    for (const statement of splitSqlStatements(file)) {
      if (/^create table/i.test(statement)) continue;
      await sqlQuery(statement);
    }
    const patched = await patchEdmontonEventPayloads();
    assert.deepEqual(patched, { bets: 0, results: 0, calendar: 0 });
    const backupAfter = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fight_event_merge_backup WHERE migration_id = $1`,
      [MIGRATION_ID],
    );
    assert.equal(backupAfter[0]?.n, "5");
    const still = await sqlQuery<{ event_slug: string }>(
      `SELECT event_slug FROM fight_breakdowns
       WHERE event_slug = 'ufc-edmonton' AND fight_slug = 'a-one-vs-b-two'`,
    );
    assert.equal(still.length, 1);
    const kept = await sqlQuery<{ event: string }>(`SELECT event FROM bets WHERE id = 'other-bet'`);
    assert.equal(kept[0]?.event, "UFC 325");
  });
});
