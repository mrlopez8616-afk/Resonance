import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { krakenDailyPrices, krakenTickerUsd } from "@/lib/kraken-public";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { setSqlClientForTests, type SqlClient } from "@/lib/pg/client";
import {
  expireSpotCacheForTests,
  fetchSpotUsd,
  readSharedSpotQuote,
  resetSpotCacheForTests,
} from "@/lib/spot-price";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const originalFetch = globalThis.fetch;

type Stored = { source: string; fetched_at: string; payload: unknown };
const rows = new Map<string, Stored>();

function memorySql(): SqlClient {
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const key = String(params[0] ?? "");
      if (text.includes("INSERT INTO market_quotes")) {
        const payload = JSON.parse(String(params[3])) as unknown;
        const next = { source: String(params[1]), fetched_at: String(params[2]), payload };
        const current = rows.get(key);
        if (!current || Date.parse(next.fetched_at) >= Date.parse(current.fetched_at)) rows.set(key, next);
        return [] as unknown as T[];
      }
      const row = rows.get(key);
      return (row ? [row] : []) as unknown as T[];
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function gecko(usd: number) {
  return json({ ripple: { usd, usd_24h_change: 1.5 }, sui: { usd, usd_24h_change: -0.4 } });
}

function kraken(usd: string) {
  return json({ error: [], result: { XXRPZUSD: { c: [usd, "1"], o: "9.99" } } });
}

after(() => {
  globalThis.fetch = originalFetch;
  resetSpotCacheForTests();
  setSqlClientForTests(null);
  rows.clear();
});

describe("spot quote cache", () => {
  it("keeps the market quote migration additive", () => {
    const file = readFileSync(join(root, "db/migrations/040_market_quotes.sql"), "utf8");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "040_market_quotes");
    assert.equal(embedded?.sql, file);
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "040_market_quotes");
    assert.equal(file.includes("INSERT"), false);
    assert.match(file, /CREATE TABLE IF NOT EXISTS market_quotes/);
  });

  it("reads a Kraken last price and does not turn today's open into a 24h change", () => {
    assert.equal(krakenTickerUsd({ error: [], result: { XXRPZUSD: { c: ["1.31754", "2"], o: "1.10" } } }), 1.31754);
    assert.throws(() => krakenTickerUsd({ error: ["EGeneral:Invalid arguments"] }), /Kraken/);
    const day = Date.parse("2026-10-27T00:00:00.000Z") / 1000;
    const prices = krakenDailyPrices({
      error: [],
      result: {
        XXRPZUSD: [
          [day, "1.20", "1.40", "1.10", "1.32", "1.25", "10", 1],
          [day - 86400, "1.10", "1.20", "1.00", "1.11", "1.05", "10", 1],
        ],
        last: day,
      },
    });
    assert.deepEqual(prices, [
      [(day - 86400) * 1000, 1.11],
      [day * 1000, 1.32],
    ]);
  });

  it("dedupes in-flight reads and reuses one fresh print", async () => {
    resetSpotCacheForTests();
    rows.clear();
    setSqlClientForTests(memorySql());
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = async () => {
      calls += 1;
      await gate;
      return gecko(1.25);
    };
    const first = fetchSpotUsd("XRP");
    const second = fetchSpotUsd("XRP");
    const other = fetchSpotUsd("SUI");
    release();
    const [xrp, shared, sui] = await Promise.all([first, second, other]);
    assert.equal(calls, 2);
    assert.equal(xrp.usd, 1.25);
    assert.equal(xrp.source, "CoinGecko");
    assert.equal(shared.fetchedAt, xrp.fetchedAt);
    assert.equal(sui.usd, 1.25);
    calls = 0;
    const again = await fetchSpotUsd("XRP");
    assert.equal(calls, 0);
    assert.equal(again.usd, 1.25);
    assert.equal(rows.get("spot:XRP")?.payload && (rows.get("spot:XRP")?.payload as { usd: number }).usd, 1.25);
  });

  it("falls back to Kraken when CoinGecko fails and skips a restricted Binance", async () => {
    resetSpotCacheForTests();
    rows.clear();
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("coingecko")) return new Response("limited", { status: 429 });
      if (url.includes("kraken")) return kraken("1.11");
      if (url.includes("binance")) return new Response("restricted", { status: 451 });
      throw new Error(`unexpected ${url}`);
    };
    const quote = await fetchSpotUsd("XRP");
    assert.equal(quote.source, "Kraken");
    assert.equal(quote.usd, 1.11);
    assert.equal(quote.change24hPct, null);
    assert.equal(urls.some((url) => url.includes("binance")), false);
    assert.equal(urls.filter((url) => url.includes("coingecko")).length, 1);
  });

  it("returns the last real print when every feed fails, and a shared read does not fetch", async () => {
    resetSpotCacheForTests();
    rows.clear();
    setSqlClientForTests(memorySql());
    let calls = 0;
    globalThis.fetch = async (input) => {
      calls += 1;
      const url = String(input);
      if (calls === 1 && url.includes("coingecko")) return gecko(1.4);
      if (url.includes("coingecko")) return new Response("limited", { status: 429 });
      if (url.includes("kraken")) return new Response("down", { status: 502 });
      if (url.includes("binance")) return new Response("restricted", { status: 451 });
      throw new Error(`unexpected ${url}`);
    };
    const fresh = await fetchSpotUsd("XRP");
    assert.equal(fresh.usd, 1.4);
    assert.equal(fresh.source, "CoinGecko");
    expireSpotCacheForTests();
    const callsAfterFresh = calls;
    const stale = await fetchSpotUsd("XRP");
    assert.equal(stale.usd, 1.4);
    assert.equal(stale.fetchedAt, fresh.fetchedAt);
    assert.equal(stale.source, "CoinGecko");
    assert.ok(calls > callsAfterFresh);
    const callsAfterMiss = calls;
    const held = await fetchSpotUsd("XRP");
    assert.equal(held.fetchedAt, fresh.fetchedAt);
    assert.equal(calls, callsAfterMiss);

    resetSpotCacheForTests();
    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("health must not fetch");
    };
    const shared = await readSharedSpotQuote("XRP");
    assert.equal(shared?.usd, 1.4);
    assert.equal(shared?.fetchedAt, fresh.fetchedAt);
    assert.equal(calls, 0);
    const quiet = await readSharedSpotQuote("HBAR");
    assert.equal(quiet, null);
    assert.equal(calls, 0);
  });
});
