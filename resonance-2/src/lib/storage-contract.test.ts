import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { newDb } from "pg-mem";
import { betSeed, parseBetPostBody } from "@/lib/bets";
import {
  loadBetsStore,
  loadBetsStoreFresh,
  postStoredBets,
  settleStoredBets,
} from "@/lib/bets-store";
import { detectBetsBackend } from "@/lib/bets-store-core";
import { resetBlobReadCacheForTests, setBlobSdkForTests } from "@/lib/blob-read";
import { writeStoredCalendarEvent } from "@/lib/calendar-store";
import { detectCalendarBackend } from "@/lib/calendar-store-core";
import { ingestStoredFill, loadFillsStoreFresh } from "@/lib/fills-store";
import { detectFillsBackend } from "@/lib/fills-store-core";
import { fightResultSeed } from "@/lib/fight-results";
import { loadFightResultsStoreFresh } from "@/lib/fight-results-store";
import { detectFightResultsBackend } from "@/lib/fight-results-store-core";
import { setSqlClientForTests, sqlQuery, postgresFailureReason, type SqlClient } from "@/lib/pg/client";
import { saveFightResults, loadFightResults } from "@/lib/pg/envelopes";
import { importBlobDocuments, ImportError } from "@/lib/pg/import-blob";
import { migrate } from "@/lib/pg/migrate";
import { replayOutage } from "@/lib/pg/replay";
import { storeLabel } from "@/lib/store-page";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

const mondayFill = {
  venue: "Robinhood",
  orderId: "contract-sui-order",
  ticker: "sui",
  side: "BUY",
  qty: "1",
  price: "1.10",
  sleeve: "rh-agentic",
  filledAt: "2026-09-21T08:30:00-05:00",
  result: "filled",
};

function createMemorySql(): SqlClient {
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

function streamFrom(text: string): ReadableStream<Uint8Array> {
  const stream = new Response(text).body;
  if (!stream) throw new Error("Response body missing");
  return stream;
}

describe("storage contract", { concurrency: false }, () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    blob: process.env.BLOB_READ_WRITE_TOKEN,
    vercel: process.env.VERCEL,
  };

  after(() => {
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.blob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous.blob;
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    setSqlClientForTests(null);
    setBlobSdkForTests(null);
    resetBlobReadCacheForTests();
  });

  describe("postgres", () => {
    let queries = 0;

    before(() => {
      process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.VERCEL;
    });

    beforeEach(async () => {
      queries = 0;
      resetBlobReadCacheForTests();
      const inner = createMemorySql();
      setSqlClientForTests({
        async query(text, params) {
          queries += 1;
          return inner.query(text, params);
        },
      });
      await migrate();
    });

    it("prefers DATABASE_URL and keeps the blob path when it is absent", () => {
      assert.equal(
        detectBetsBackend({
          DATABASE_URL: "postgres://local/db",
          BLOB_READ_WRITE_TOKEN: "token",
        }),
        "postgres",
      );
      assert.equal(detectFillsBackend({ BLOB_READ_WRITE_TOKEN: "token" }), "blob");
      assert.equal(detectCalendarBackend({ VERCEL: "1" }), "none");
      assert.equal(
        detectFightResultsBackend({
          DATABASE_URL: "postgres://local/db",
          BLOB_READ_WRITE_TOKEN: "token",
        }),
        "postgres",
      );
      assert.equal(storeLabel("live", "postgres"), "durable store");
      assert.equal(
        postgresFailureReason(new Error("connect failed postgres://user:secret@host/db")),
        "connect failed postgres://redacted",
      );
    });

    it("seeds on read, does not clobber a stored row, and dedupes post and settle", async () => {
      const first = await loadBetsStoreFresh();
      assert.equal(first.backend, "postgres");
      assert.equal(first.configured, true);
      assert.equal(first.envelope.bets.length, betSeed().length);

      const nolan = first.envelope.bets.find((bet) => bet.id === "ufc-332-nolan");
      assert.ok(nolan);
      const edited = { ...nolan, stake: "1.11" };
      await sqlQuery(`UPDATE bets SET payload = $1::jsonb, stake = $2 WHERE id = $3`, [
        JSON.stringify(edited),
        "1.11",
        edited.id,
      ]);
      resetBlobReadCacheForTests();
      const kept = await loadBetsStoreFresh();
      assert.equal(
        kept.envelope.bets.find((bet) => bet.id === "ufc-332-nolan")?.stake,
        "1.11",
      );

      const duplicate = await postStoredBets([
        parseBetPostBody({
          orderId: nolan.orderId ?? nolan.id,
          id: nolan.id,
          event: nolan.event,
          fight: nolan.fight,
          fightSlug: nolan.fightSlug,
          pick: nolan.pick,
          stake: "9.99",
          payout: nolan.payout,
          oddsPct: nolan.oddsPct,
          time: nolan.time,
        })[0],
      ]);
      assert.equal(duplicate.results[0]?.deduped, true);
      assert.equal(duplicate.results[0]?.bet.stake, "1.11");

      const extra = parseBetPostBody({
        orderId: "contract-extra-order",
        id: "contract-extra",
        event: nolan.event,
        fight: nolan.fight,
        fightSlug: nolan.fightSlug,
        pick: nolan.pick,
        stake: "3.00",
        payout: "5.00",
        oddsPct: nolan.oddsPct,
        time: nolan.time,
      })[0];
      const posted = await postStoredBets([extra]);
      assert.equal(posted.results[0]?.deduped, false);
      const again = await postStoredBets([extra]);
      assert.equal(again.results[0]?.deduped, true);
      assert.equal(again.envelope.bets.filter((bet) => bet.id === "contract-extra").length, 1);

      const settled = await settleStoredBets([{ id: "ufc-332-nolan", status: "lost" }]);
      assert.equal(settled.results[0]?.deduped, false);
      assert.equal(settled.results[0]?.bet.status, "lost");
      const resettled = await settleStoredBets([{ id: "ufc-332-nolan", status: "lost" }]);
      assert.equal(resettled.results[0]?.deduped, true);
      const history = await sqlQuery<{ external_id: string }>(
        `SELECT external_id FROM settlements WHERE bet_id = $1`,
        ["ufc-332-nolan"],
      );
      assert.equal(history.length, 1);
    });

    it("caches a display read and drops it after a successful write", async () => {
      await loadBetsStore();
      const afterFirst = queries;
      await loadBetsStore();
      assert.equal(queries, afterFirst);
      await settleStoredBets([{ id: "ufc-332-nolan", status: "won", payout: "7.12" }]);
      const seen = await loadBetsStore();
      assert.equal(
        seen.envelope.bets.find((bet) => bet.id === "ufc-332-nolan")?.status,
        "won",
      );
    });

    it("dedupes a fill onto the operator log and a calendar id", async () => {
      const seeded = await loadFillsStoreFresh();
      assert.equal(seeded.backend, "postgres");
      assert.ok(seeded.envelope.fills.length > 0);
      const written = await ingestStoredFill(mondayFill);
      assert.equal(written.deduped, false);
      const repeat = await ingestStoredFill(mondayFill);
      assert.equal(repeat.deduped, true);
      const log = await sqlQuery<{ n: number | string }>(
        `SELECT count(*)::int AS n FROM operator_log`,
      );
      assert.equal(Number(log[0]?.n), repeat.envelope.fills.length);

      const event = {
        id: "build-storage-contract",
        lane: "build",
        writer: "agent",
        start: "2026-10-06T09:00:00-05:00",
        title: "Storage contract",
        status: "awaiting",
      };
      const created = await writeStoredCalendarEvent(event);
      assert.equal(created.deduped, false);
      const same = await writeStoredCalendarEvent(event);
      assert.equal(same.deduped, true);
      const renamed = await writeStoredCalendarEvent({ ...event, title: "Storage contract v2" });
      assert.equal(renamed.updated, true);
      assert.equal(renamed.deduped, false);
    });

    it("refuses a suspended blob and upserts a readable one without duplicating", async () => {
      await assert.rejects(
        () =>
          importBlobDocuments({
            dryRun: false,
            read: async () => ({ status: "unavailable", reason: "Blob store returned 403." }),
          }),
        (error: unknown) => {
          assert.ok(error instanceof ImportError);
          assert.equal(error.status, 503);
          assert.match(error.message, /suspended or unreadable/);
          assert.match(error.message, /403/);
          return true;
        },
      );
      const bets = await sqlQuery<{ id: string }>(`SELECT id FROM bets`);
      assert.equal(bets.length, 0);

      const nolan = betSeed().find((bet) => bet.id === "ufc-332-nolan");
      assert.ok(nolan);
      const body = JSON.stringify({
        version: 1,
        updatedAt: "2026-10-03T12:00:00.000Z",
        seededAt: "2026-10-03T12:00:00.000Z",
        bets: [nolan],
      });
      const read = async (pathname: string) =>
        pathname.endsWith("bets.json")
          ? { status: "ok" as const, text: body }
          : { status: "missing" as const };
      const imported = await importBlobDocuments({ dryRun: false, read });
      assert.equal(imported.bets.inserted, 1);
      const second = await importBlobDocuments({ dryRun: false, read });
      assert.equal(second.bets.inserted, 0);
      assert.equal(second.bets.unchanged, 1);
      const changed = JSON.stringify({
        version: 1,
        updatedAt: "2026-10-03T12:00:00.000Z",
        seededAt: "2026-10-03T12:00:00.000Z",
        bets: [{ ...nolan, stake: "8.00" }],
      });
      const dry = await importBlobDocuments({
        dryRun: true,
        read: async (pathname: string) =>
          pathname.endsWith("bets.json")
            ? { status: "ok" as const, text: changed }
            : { status: "missing" as const },
      });
      assert.equal(dry.dryRun, true);
      assert.equal(dry.bets.updated, 1);
      const stored = await sqlQuery<{ payload: { stake?: string } }>(
        `SELECT payload FROM bets WHERE id = $1`,
        [nolan.id],
      );
      assert.equal(stored[0]?.payload.stake, nolan.stake);
    });

    it("replays outage rows twice without doubling settlements", async () => {
      const nolan = betSeed().find((bet) => bet.id === "ufc-332-nolan");
      assert.ok(nolan);
      const file = {
        bets: [
          {
            orderId: "outage-order",
            id: "outage-nolan",
            event: nolan.event,
            fight: nolan.fight,
            fightSlug: nolan.fightSlug,
            pick: nolan.pick,
            stake: "3.50",
            payout: "6.00",
            oddsPct: nolan.oddsPct,
            time: nolan.time,
          },
        ],
        settlements: [{ id: "ufc-332-nolan", status: "lost" as const }],
        calendar: [
          {
            id: "build-outage-replay",
            lane: "build",
            writer: "agent",
            start: "2026-10-06T10:00:00-05:00",
            title: "Outage replay",
            status: "awaiting",
          },
        ],
      };
      const dry = await replayOutage(file, { dryRun: true });
      assert.equal(dry.bets.inserted, 1);
      assert.equal(dry.settlements.inserted, 1);
      assert.equal((await sqlQuery(`SELECT id FROM bets`)).length, 0);

      const first = await replayOutage(file);
      assert.equal(first.bets.inserted, 1);
      assert.equal(first.settlements.inserted, 1);
      assert.equal(first.calendar.inserted, 1);
      assert.equal(first.failures.length, 0);
      const second = await replayOutage(file);
      assert.equal(second.bets.deduped, 1);
      assert.equal(second.settlements.deduped, 1);
      assert.equal(second.calendar.deduped, 1);
      const history = await sqlQuery(`SELECT external_id FROM settlements WHERE bet_id = $1`, [
        "ufc-332-nolan",
      ]);
      assert.equal(history.length, 1);
      const tickets = await sqlQuery(`SELECT id FROM bets WHERE id = $1`, ["outage-nolan"]);
      assert.equal(tickets.length, 1);
    });

    it("stores a fight result once so PR #50 can upsert by slug", async () => {
      const row = {
        event: "UFC 332",
        fightSlug: "eric-nolan-court-mcgee",
        winner: "Eric Nolan",
        method: "KO/TKO",
        round: 3,
        time: "3:26",
        status: "final",
        source: "Hub confirmed",
      };
      const first = await saveFightResults([row]);
      assert.equal(first.inserted, 1);
      const second = await saveFightResults([row]);
      assert.equal(second.unchanged, 1);
      assert.equal(second.inserted, 0);
      const loaded = await loadFightResults();
      assert.equal(loaded.length, 1);
      assert.equal(loaded[0]?.time, "3:26");
      assert.equal(loaded[0]?.winner, "Eric Nolan");
    });

    it("seeds fight results on read and keeps the clock column", async () => {
      const first = await loadFightResultsStoreFresh();
      assert.equal(first.backend, "postgres");
      assert.equal(first.seeded, true);
      assert.equal(first.envelope.results.length, fightResultSeed().length);
      const sample = fightResultSeed()[0];
      assert.ok(sample);
      const clock = await sqlQuery<{ clock: string }>(
        `SELECT clock FROM fight_results WHERE fight_slug = $1`,
        [sample.fightSlug],
      );
      assert.equal(clock[0]?.clock, sample.time);
      const second = await loadFightResultsStoreFresh();
      assert.equal(second.seeded, false);
      assert.equal(second.envelope.results.length, first.envelope.results.length);
    });

    it("skips a migration that already ran and fails soft when postgres is down", async () => {
      const again = await migrate();
      assert.deepEqual(again.applied, []);
      assert.ok(again.skipped.includes("001_domain_tables"));

      setSqlClientForTests({
        async query() {
          throw new Error("connect ECONNREFUSED postgres://user:secret@host/db");
        },
      });
      await assert.rejects(loadBetsStore(), (error: unknown) => {
        assert.equal(isStorageUnavailable(error), true);
        if (isStorageUnavailable(error)) {
          assert.match(error.reason, /postgres:\/\/redacted/);
          assert.doesNotMatch(error.reason, /secret/);
        }
        return true;
      });
    });
  });

  describe("blob fallback", () => {
    let body: string | null = null;
    let mode: "ok" | "missing" | "403" = "missing";
    let gets = 0;

    before(() => {
      delete process.env.DATABASE_URL;
      delete process.env.VERCEL;
      process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
      setBlobSdkForTests({
        async get(_pathname, options) {
          gets += 1;
          assert.equal(options.access, "private");
          assert.equal(options.useCache, false);
          if (mode === "403") {
            const error = new Error("Failed to fetch blob: 403 Forbidden. This store has been suspended.");
            throw error;
          }
          if (mode === "missing" || body === null) return null;
          return { statusCode: 200, stream: streamFrom(body) };
        },
        async put(_pathname, text) {
          body = text;
          mode = "ok";
        },
      });
    });

    beforeEach(() => {
      resetBlobReadCacheForTests();
      body = null;
      mode = "missing";
      gets = 0;
    });

    it("still seeds through blob and dedupes post and settle", async () => {
      const loaded = await loadBetsStoreFresh();
      assert.equal(loaded.backend, "blob");
      assert.equal(loaded.envelope.bets.length, betSeed().length);
      const nolan = loaded.envelope.bets.find((bet) => bet.id === "ufc-332-nolan");
      assert.ok(nolan);
      const post = parseBetPostBody({
        orderId: nolan.orderId ?? nolan.id,
        id: nolan.id,
        event: nolan.event,
        fight: nolan.fight,
        fightSlug: nolan.fightSlug,
        pick: nolan.pick,
        stake: "9.99",
        payout: nolan.payout,
        oddsPct: nolan.oddsPct,
        time: nolan.time,
      })[0];
      const written = await postStoredBets([post]);
      assert.equal(written.backend, "blob");
      assert.equal(written.results[0]?.deduped, true);
      assert.equal(written.results[0]?.bet.stake, nolan.stake);
      const settled = await settleStoredBets([{ id: nolan.id, status: "lost" }]);
      assert.equal(settled.results[0]?.deduped, false);
      const repeat = await settleStoredBets([{ id: nolan.id, status: "lost" }]);
      assert.equal(repeat.results[0]?.deduped, true);
      assert.equal(repeat.results[0]?.bet.realizedPnl, settled.results[0]?.bet.realizedPnl);
    });

    it("keeps a 403 off the book", async () => {
      mode = "403";
      await assert.rejects(loadBetsStore(), isStorageUnavailable);
      assert.equal(gets, 1);
    });
  });
});
