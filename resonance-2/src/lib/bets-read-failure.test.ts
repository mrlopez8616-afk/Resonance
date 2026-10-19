import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { loadBetsStoreFresh } from "@/lib/bets-store";
import { resetBlobReadCacheForTests } from "@/lib/blob-read";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { ownerBetFailureDetail } from "@/lib/store-page";
import { isStorageUnavailable, StorageUnavailableError } from "@/lib/storage-unavailable";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const secretUrl = "postgres://user:secret@host/db";

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

function captureErrors(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  return {
    lines,
    restore() {
      console.error = original;
    },
  };
}

function assertRedacted(text: string): void {
  assert.equal(text.includes("secret"), false);
  assert.equal(text.includes(secretUrl), false);
  assert.match(text, /postgres:\/\/redacted/);
}

describe("bets read failure", { concurrency: false }, () => {
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
    resetBlobReadCacheForTests();
  });

  it("logs a redacted reason from sqlQuery and keeps it off the thrown banner", async () => {
    setSqlClientForTests({
      async query() {
        throw new Error(`connect failed ${secretUrl}`);
      },
    });
    const captured = captureErrors();
    try {
      await assert.rejects(
        () => sqlQuery("SELECT 1"),
        (error: unknown) => {
          assert.ok(error instanceof StorageUnavailableError);
          assert.equal(error.reason, "connect failed postgres://redacted");
          assert.equal(error.message.includes("secret"), false);
          return true;
        },
      );
    } finally {
      captured.restore();
    }
    const logged = captured.lines.join("\n");
    assert.match(logged, /postgres query failed/);
    assertRedacted(logged);
  });

  it("shows the Postgres reason only to the owner outside public mode", () => {
    const reason = 'relation "bets" does not exist';
    assert.equal(ownerBetFailureDetail(reason, { role: "owner", publicMode: false }), reason);
    assert.equal(
      ownerBetFailureDetail(reason, { role: "owner", publicMode: true }),
      "Bet book is unavailable.",
    );
    assert.equal(
      ownerBetFailureDetail(reason, { role: "operator", publicMode: false }),
      "Bet book is unavailable.",
    );
    assert.equal(
      ownerBetFailureDetail(reason, { role: null, publicMode: false }),
      "Bet book is unavailable.",
    );
    assert.equal(
      ownerBetFailureDetail("   ", { role: "owner", publicMode: false }),
      "Bet book is unavailable.",
    );
    const ownerLine = ownerBetFailureDetail(`connect failed postgres://redacted`, {
      role: "owner",
      publicMode: false,
    });
    assert.match(ownerLine, /postgres:\/\/redacted/);
    assert.equal(ownerLine.includes("secret"), false);
    const hidden = ownerBetFailureDetail(reason, { role: null, publicMode: false });
    assert.equal(hidden.includes("bets"), false);
  });

  it("returns the bets it read when the seed write fails", async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    resetBlobReadCacheForTests();
    const inner = memorySql();
    setSqlClientForTests(inner);
    await migrate();
    setSqlClientForTests({
      async query(text, params) {
        if (/^\s*(insert|update|delete)\b/i.test(text)) {
          throw new Error(`write failed ${secretUrl}`);
        }
        return inner.query(text, params);
      },
    });
    const captured = captureErrors();
    try {
      const loaded = await loadBetsStoreFresh();
      assert.equal(loaded.backend, "postgres");
      assert.equal(loaded.configured, true);
      assert.ok(loaded.envelope.bets.length > 0);
    } finally {
      captured.restore();
    }
    const logged = captured.lines.join("\n");
    assert.match(logged, /bets write failed/);
    assert.equal(logged.includes("bets read failed"), false);
    assertRedacted(logged);
  });

  it("returns and logs a redacted reason when the bets read fails", async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    resetBlobReadCacheForTests();
    setSqlClientForTests({
      async query() {
        throw new Error(`relation "bets" does not exist ${secretUrl}`);
      },
    });
    const captured = captureErrors();
    try {
      await assert.rejects(
        () => loadBetsStoreFresh(),
        (error: unknown) => {
          assert.ok(isStorageUnavailable(error));
          assert.match(error.reason, /does not exist/);
          assertRedacted(error.reason);
          assert.equal(error.message.includes("secret"), false);
          return true;
        },
      );
    } finally {
      captured.restore();
    }
    const logged = captured.lines.join("\n");
    assert.match(logged, /bets read failed/);
    assert.match(logged, /postgres query failed/);
    assertRedacted(logged);
  });

  it("passes the owner line through the fight pages and leaves careers off the bets read", () => {
    const fights = readFileSync(path.join(root, "src/app/fights/page.tsx"), "utf8");
    const event = readFileSync(path.join(root, "src/app/fights/[event]/page.tsx"), "utf8");
    const fight = readFileSync(path.join(root, "src/app/fights/[event]/[fight]/page.tsx"), "utf8");
    for (const source of [fights, event, fight]) {
      assert.match(source, /betBookLine/);
      assert.equal(source.includes("Bet book is unavailable."), false);
    }
    assert.equal(fight.split("await betBookLine").length - 1, 2);
    assert.match(fights, /Bet book is seed-only/);

    const betsStore = readFileSync(path.join(root, "src/lib/bets-store.ts"), "utf8");
    assert.equal(betsStore.includes("fighter-careers"), false);
    assert.equal(betsStore.includes("embedded-migrations"), false);
    assert.equal(/\bmigrate\(/.test(betsStore), false);
    const envelopes = readFileSync(path.join(root, "src/lib/pg/envelopes.ts"), "utf8");
    const loadStart = envelopes.indexOf("export async function loadBetsEnvelope");
    const saveStart = envelopes.indexOf("export async function saveBetsEnvelope");
    const load = envelopes.slice(loadStart, saveStart);
    assert.equal(/fighters|fighter_fights/.test(load), false);
  });
});
