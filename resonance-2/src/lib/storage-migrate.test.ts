import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { DataType, newDb } from "pg-mem";
import { POST as migrateRoute } from "@/app/api/storage/migrate/route";
import { GET as statusRoute } from "@/app/api/storage/status/route";
import { setSqlClientForTests, type SqlClient } from "@/lib/pg/client";
import { migrate, migrationLockStatement } from "@/lib/pg/migrate";
import { runProductionMigrate, shouldMigrateOnBuild } from "@/lib/pg/prebuild";
import { readStorageStatus } from "@/lib/pg/status";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

const SECRET = "test-sync-secret";
const DATABASE_URL = "postgres://resonance:secret@ep-test.us-east-2.aws.neon.tech/neondb";

function createMemorySql(): SqlClient {
  const db = newDb();
  db.public.registerFunction({
    name: "pg_advisory_xact_lock",
    args: [DataType.bigint],
    returns: DataType.bigint,
    implementation: () => null,
  });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  const clientPromise = pool.connect();
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const client = await clientPromise;
      const result = await client.query(text, [...params]);
      return (result.rows ?? []) as T[];
    },
  };
}

function migrateRequest(authorization?: string): Request {
  return new Request("https://resonance3.vercel.app/api/storage/migrate", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

describe("storage migrate", { concurrency: false }, () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    secret: process.env.RESONANCE_SYNC_SECRET,
    blob: process.env.BLOB_READ_WRITE_TOKEN,
    vercel: process.env.VERCEL,
    vercelEnv: process.env.VERCEL_ENV,
    betsFile: process.env.RESONANCE_BETS_FILE,
  };

  after(() => {
    restore("DATABASE_URL", previous.databaseUrl);
    restore("RESONANCE_SYNC_SECRET", previous.secret);
    restore("BLOB_READ_WRITE_TOKEN", previous.blob);
    restore("VERCEL", previous.vercel);
    restore("VERCEL_ENV", previous.vercelEnv);
    restore("RESONANCE_BETS_FILE", previous.betsFile);
    setSqlClientForTests(null);
  });

  beforeEach(() => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.RESONANCE_BETS_FILE;
    setSqlClientForTests(createMemorySql());
  });

  it("rejects a migrate call without the bearer and when Postgres is unset", async () => {
    const missing = await migrateRoute(migrateRequest());
    assert.equal(missing.status, 401);

    const wrong = await migrateRoute(migrateRequest("Bearer not-the-secret"));
    assert.equal(wrong.status, 401);

    delete process.env.DATABASE_URL;
    const unconfigured = await migrateRoute(migrateRequest(`Bearer ${SECRET}`));
    assert.equal(unconfigured.status, 503);
    assert.equal((await unconfigured.json()).error, "Postgres is not configured");
  });

  it("applies migrations once and locks the transaction", async () => {
    const statements: string[] = [];
    const inner = createMemorySql();
    setSqlClientForTests({
      async query(text, params) {
        statements.push(text.trim());
        return inner.query(text, params);
      },
    });

    const first = await migrateRoute(migrateRequest(`Bearer ${SECRET}`));
    assert.equal(first.status, 200);
    const appliedBody = await first.json();
    assert.deepEqual(Object.keys(appliedBody).sort(), ["applied", "skipped"]);
    assert.deepEqual(appliedBody.applied, ["001_domain_tables"]);
    assert.deepEqual(appliedBody.skipped, []);

    const second = await migrateRoute(migrateRequest(`Bearer ${SECRET}`));
    assert.equal(second.status, 200);
    const skippedBody = await second.json();
    assert.deepEqual(skippedBody.applied, []);
    assert.deepEqual(skippedBody.skipped, ["001_domain_tables"]);

    const lock = migrationLockStatement();
    const firstLock = statements.indexOf(lock);
    const firstBegin = statements.indexOf("BEGIN");
    const firstCommit = statements.indexOf("COMMIT");
    assert.ok(firstBegin >= 0 && firstLock > firstBegin);
    assert.ok(firstCommit > firstLock);
    assert.ok(statements.slice(firstLock, firstCommit).some((sql) => /CREATE TABLE/i.test(sql)));
  });

  it("holds the advisory lock so a second migrate waits", async () => {
    const events: string[] = [];
    let held = false;
    const waiters: Array<() => void> = [];
    let releaseWork: () => void = () => {};
    const workGate = new Promise<void>((resolve) => {
      releaseWork = resolve;
    });
    let paused = false;

    setSqlClientForTests({
      async query(text) {
        const sql = text.replace(/\s+/g, " ").trim();
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
          if (sql === "COMMIT" || sql === "ROLLBACK") {
            held = false;
            events.push(sql.toLowerCase());
            waiters.shift()?.();
          }
          return [];
        }
        if (sql.includes("pg_advisory_xact_lock")) {
          if (held) {
            events.push("wait");
            await new Promise<void>((resolve) => waiters.push(resolve));
          }
          held = true;
          events.push("lock");
          return [];
        }
        if (/^CREATE TABLE/i.test(sql) && !paused) {
          paused = true;
          events.push("ddl");
          await workGate;
        }
        return [];
      },
    });

    const pending = Promise.all([migrate(), migrate()]);
    const started = Date.now();
    while (!events.includes("wait")) {
      if (Date.now() - started > 2000) {
        throw new Error(`lock was not contended: ${events.join(",")}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const beforeRelease = events.indexOf("commit");
    assert.equal(beforeRelease, -1);
    assert.equal(events.filter((event) => event === "lock").length, 1);
    releaseWork();
    await pending;
    const firstCommit = events.indexOf("commit");
    assert.equal(events.slice(0, firstCommit).filter((event) => event === "lock").length, 1);
    assert.ok(events.slice(0, firstCommit).includes("wait"));
    assert.ok(events.slice(firstCommit + 1).includes("lock"));
  });

  it("rolls back when a statement fails", async () => {
    const events: string[] = [];
    setSqlClientForTests({
      async query(text) {
        const sql = text.trim();
        if (sql === "ROLLBACK") events.push("rollback");
        if (/^CREATE TABLE/i.test(sql)) throw new Error(`boom ${DATABASE_URL}`);
        return [];
      },
    });
    await assert.rejects(migrate(), (error: unknown) => {
      assert.equal(isStorageUnavailable(error), true);
      if (isStorageUnavailable(error)) {
        assert.match(error.reason, /boom/);
        assert.doesNotMatch(error.reason, /neon\.tech/);
        assert.doesNotMatch(error.reason, /secret/);
      }
      return true;
    });
    assert.deepEqual(events, ["rollback"]);
  });

  it("reports schema status without secrets", async () => {
    await migrate();
    const migrated = await readStorageStatus();
    assert.equal(migrated.backend, "postgres");
    assert.equal(migrated.reachable, true);
    assert.equal(migrated.schema.migrated, true);
    assert.equal(migrated.schema.applied, 1);
    assert.deepEqual(migrated.schema.pending, []);

    const response = await statusRoute();
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes("neon.tech"), false);
    assert.equal(JSON.stringify(body).includes("secret"), false);
    assert.equal(JSON.stringify(body).includes("postgres://"), false);

    setSqlClientForTests(createMemorySql());
    const fresh = await readStorageStatus();
    assert.equal(fresh.reachable, true);
    assert.equal(fresh.schema.migrated, false);
    assert.equal(fresh.schema.applied, 0);
    assert.deepEqual(fresh.schema.pending, ["001_domain_tables"]);

    setSqlClientForTests({
      async query() {
        throw new Error(`connect failed ${DATABASE_URL}`);
      },
    });
    const down = await readStorageStatus();
    assert.equal(down.backend, "postgres");
    assert.equal(down.reachable, false);
    assert.equal(down.schema.migrated, false);
    const encoded = JSON.stringify(down);
    assert.equal(encoded.includes("neon.tech"), false);
    assert.equal(encoded.includes("secret"), false);
    assert.equal(encoded.includes("postgres://"), false);

    delete process.env.DATABASE_URL;
    process.env.BLOB_READ_WRITE_TOKEN = "blob-token";
    const blob = await readStorageStatus();
    assert.deepEqual(blob, {
      backend: "blob",
      schema: { migrated: false, applied: 0, pending: ["001_domain_tables"] },
      reachable: true,
    });

    delete process.env.BLOB_READ_WRITE_TOKEN;
    const file = await readStorageStatus();
    assert.equal(file.backend, "file");
    assert.equal(file.reachable, true);

    process.env.VERCEL = "1";
    const none = await readStorageStatus();
    assert.equal(none.backend, "file");
    assert.equal(none.reachable, false);
  });

  it("migrates on production builds only and never logs the url", async () => {
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "production", DATABASE_URL }), true);
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "preview", DATABASE_URL }), false);
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "development", DATABASE_URL }), false);
    assert.equal(shouldMigrateOnBuild({ DATABASE_URL }), false);
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "production" }), false);
    assert.equal(shouldMigrateOnBuild({ VERCEL_ENV: "production", DATABASE_URL: "  " }), false);

    let calls = 0;
    const previewLog: string[] = [];
    const preview = await runProductionMigrate({
      env: { VERCEL_ENV: "preview", DATABASE_URL },
      migrate: async () => {
        calls += 1;
        return { applied: [], skipped: [] };
      },
      log: (line) => previewLog.push(line),
    });
    assert.equal(preview, 0);
    assert.equal(calls, 0);
    assert.equal(previewLog.join("\n").includes("neon.tech"), false);
    assert.equal(previewLog.join("\n").includes("postgres://"), false);
    assert.match(previewLog.join("\n"), /not a production build/);

    const local = await runProductionMigrate({
      env: { DATABASE_URL },
      migrate: async () => {
        calls += 1;
        return { applied: [], skipped: [] };
      },
      log: () => {},
    });
    assert.equal(local, 0);
    assert.equal(calls, 0);

    const appliedLog: string[] = [];
    const ok = await runProductionMigrate({
      env: { VERCEL_ENV: "production", DATABASE_URL },
      migrate: async () => ({ applied: ["001_domain_tables"], skipped: ["002_later"] }),
      log: (line) => appliedLog.push(line),
    });
    assert.equal(ok, 0);
    assert.deepEqual(appliedLog, [
      "db:migrate applied: 001_domain_tables.sql",
      "db:migrate skipped: 002_later.sql",
    ]);
    assert.equal(appliedLog.join("\n").includes("neon.tech"), false);

    const failureLog: string[] = [];
    const failed = await runProductionMigrate({
      env: { VERCEL_ENV: "production", DATABASE_URL },
      migrate: async () => {
        throw new Error(`connect failed ${DATABASE_URL}`);
      },
      error: (line) => failureLog.push(line),
    });
    assert.equal(failed, 1);
    assert.match(failureLog.join("\n"), /connect failed postgres:\/\/redacted/);
    assert.equal(failureLog.join("\n").includes("neon.tech"), false);
    assert.equal(failureLog.join("\n").includes("secret"), false);
    assert.equal(failureLog.join("\n").includes("resonance"), false);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
