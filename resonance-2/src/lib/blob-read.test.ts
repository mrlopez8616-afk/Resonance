import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { BLOB_TAGS, resetBlobReadCacheForTests, setBlobSdkForTests } from "./blob-read";
import { asBetWriteError, loadBetsStore, loadBetsStoreFresh, settleStoredBets } from "./bets-store";
import { asFightResultWriteError, loadFightResultsStore } from "./fight-results-store";
import { loadFillsStore } from "./fills-store";
import { loadCalendarStore } from "./calendar-store";
import { loadOperatorFills } from "./sleeve-prints";
import { loadBetsForPage, loadCalendarForPage, loadFightResultsForPage } from "./store-page";
import {
  STORAGE_UNAVAILABLE_BANNER,
  isStorageUnavailable,
} from "./storage-unavailable";

const TOKEN_KEY = "BLOB_READ_WRITE_TOKEN";
let previousToken: string | undefined;
let previousDatabaseUrl: string | undefined;
let mode: "ok" | "missing" | "403" = "missing";
let body: string | null = null;
let gets = 0;
let puts = 0;
const useCacheFlags: boolean[] = [];

function streamFrom(text: string): ReadableStream<Uint8Array> {
  const stream = new Response(text).body;
  if (!stream) throw new Error("Response body missing");
  return stream;
}

function installSdk(): void {
  setBlobSdkForTests({
    async get(_pathname, options) {
      gets += 1;
      useCacheFlags.push(options.useCache);
      assert.equal(options.access, "private");
      if (mode === "403") {
        const error = new Error("Failed to fetch blob: 403 Forbidden");
        error.name = "BlobError";
        throw error;
      }
      if (mode === "missing" || body === null) return null;
      return { statusCode: 200, stream: streamFrom(body) };
    },
    async put(_pathname, text) {
      puts += 1;
      body = text;
      mode = "ok";
    },
  });
}

before(() => {
  previousToken = process.env[TOKEN_KEY];
  previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  process.env[TOKEN_KEY] = "vercel_blob_rw_test";
  installSdk();
});

after(() => {
  if (previousToken === undefined) delete process.env[TOKEN_KEY];
  else process.env[TOKEN_KEY] = previousToken;
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  setBlobSdkForTests(null);
  resetBlobReadCacheForTests();
});

beforeEach(() => {
  resetBlobReadCacheForTests();
  mode = "missing";
  body = null;
  gets = 0;
  puts = 0;
  useCacheFlags.length = 0;
});

describe("blob reads", () => {
  it("does not seed when the blob SDK throws 403", async () => {
    mode = "403";
    await assert.rejects(loadBetsStore(), (error: unknown) => {
      assert.equal(isStorageUnavailable(error), true);
      assert.ok(error instanceof Error);
      assert.equal(error.message, STORAGE_UNAVAILABLE_BANNER);
      if (isStorageUnavailable(error)) {
        assert.match(error.reason, /403/);
      }
      return true;
    });
    assert.equal(puts, 0);
    assert.equal(gets, 1);

    const page = await loadBetsForPage();
    assert.equal(page.status, "unavailable");
    assert.equal("bets" in page, false);
    assert.equal(gets, 1);

    const mapped = asBetWriteError(
      await loadBetsStoreFresh().then(
        () => null,
        (error: unknown) => error,
      ),
    );
    assert.equal(mapped.status, 503);
    assert.equal(mapped.message, STORAGE_UNAVAILABLE_BANNER);
    assert.match(mapped.reason ?? "", /403/);
    assert.equal(gets, 2);
    assert.equal(puts, 0);
    assert.deepEqual(useCacheFlags, [false, false]);
  });

  it("does not seed fight results when the blob SDK throws 403", async () => {
    mode = "403";
    await assert.rejects(loadFightResultsStore(), isStorageUnavailable);
    assert.equal(puts, 0);
    assert.equal(gets, 1);

    const page = await loadFightResultsForPage();
    assert.equal(page.status, "unavailable");
    assert.equal("results" in page, false);
    assert.equal(gets, 1);

    const mapped = asFightResultWriteError(
      await loadFightResultsStore().then(
        () => null,
        (error: unknown) => error,
      ),
    );
    assert.equal(mapped.status, 503);
    assert.equal(mapped.message, STORAGE_UNAVAILABLE_BANNER);
    assert.match(mapped.reason ?? "", /403/);
    assert.equal(puts, 0);
  });

  it("seeds a missing blob, then serves the cached book without another get", async () => {
    const first = await loadBetsStore();
    assert.equal(first.configured, true);
    assert.ok(first.envelope.bets.length > 0);
    assert.equal(gets, 1);
    assert.equal(puts, 1);

    const second = await loadBetsStore();
    assert.equal(second.envelope.updatedAt, first.envelope.updatedAt);
    assert.equal(gets, 1);
    assert.equal(puts, 1);

    const fresh = await loadBetsStoreFresh();
    assert.equal(fresh.envelope.bets.length, first.envelope.bets.length);
    assert.equal(gets, 2);
    assert.ok(useCacheFlags.every((flag) => flag === false));
  });

  it("revalidates the bets tag on a successful settle so the next read is fresh", async () => {
    await loadBetsStore();
    assert.equal(gets, 1);

    const settled = await settleStoredBets([{ id: "ufc-332-nolan", status: "lost" }]);
    assert.equal(settled.results[0]?.deduped, false);
    assert.ok(gets > 1);
    const afterWrite = gets;

    await loadBetsStore();
    assert.equal(gets, afterWrite + 1);

    const again = await settleStoredBets([{ id: "ufc-332-nolan", status: "lost" }]);
    assert.equal(again.results[0]?.deduped, true);
    const afterDedupedRead = gets;
    await loadBetsStore();
    assert.equal(gets, afterDedupedRead);
  });

  it("dedupes concurrent display reads of one blob", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = 0;
    setBlobSdkForTests({
      async get() {
        entered += 1;
        gets += 1;
        await gate;
        return null;
      },
      async put(_pathname, text) {
        puts += 1;
        body = text;
        mode = "ok";
      },
    });

    const first = loadBetsStore();
    const second = loadBetsStore();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(entered, 1);
    release?.();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.envelope.bets.length, b.envelope.bets.length);
    assert.equal(gets, 1);
    installSdk();
  });

  it("keeps a fills 403 off the live book and a calendar 403 off the durable label", async () => {
    mode = "403";
    await assert.rejects(loadFillsStore(), isStorageUnavailable);
    assert.equal(puts, 0);
    const fills = await loadOperatorFills();
    assert.equal(fills.status, "seed-only");
    assert.notEqual(fills.status, "live");
    assert.equal(gets, 1);

    await assert.rejects(loadCalendarStore(), isStorageUnavailable);
    const calendar = await loadCalendarForPage();
    assert.equal(calendar.status, "seed-only");
    assert.equal(calendar.storeLabel, "seed-only");
    assert.ok(calendar.events.length > 0);
    assert.equal(puts, 0);
  });

  it("names the cache tags used for revalidation", () => {
    assert.equal(BLOB_TAGS.bets, "resonance-blob-bets");
    assert.equal(BLOB_TAGS.fills, "resonance-blob-fills");
    assert.equal(BLOB_TAGS.calendar, "resonance-blob-calendar");
    assert.equal(BLOB_TAGS.fightResults, "resonance-blob-fight-results");
    assert.equal(BLOB_TAGS.fightBreakdowns, "resonance-blob-fight-breakdowns");
  });
});
