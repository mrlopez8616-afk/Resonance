import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { setSqlClientForTests, type SqlClient } from "@/lib/pg/client";
import {
  clearCryptoChartMemoryForTests,
  expireCryptoChartForTests,
  loadXrpTriggerCloses,
  readSharedXrpTrigger,
  readXrpDailyCloseCache,
  resetCryptoChartForTests,
  xrpTriggerAgeLabel,
} from "@/lib/price-history";

const originalFetch = globalThis.fetch;
type Stored = { source: string; fetched_at: string; payload: unknown };
const rows = new Map<string, Stored>();

function memorySql(): SqlClient {
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const key = String(params[0] ?? "");
      if (text.includes("INSERT INTO market_quotes")) {
        rows.set(key, {
          source: String(params[1]),
          fetched_at: String(params[2]),
          payload: JSON.parse(String(params[3])) as unknown,
        });
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

const older = Date.parse("2026-10-26T00:00:00.000Z") / 1000;
const newer = Date.parse("2026-10-27T00:00:00.000Z") / 1000;

function krakenChart() {
  return json({
    error: [],
    result: {
      XXRPZUSD: [
        [older, "1.10", "1.20", "1.00", "1.11", "1.05", "10", 1],
        [newer, "1.20", "1.40", "1.10", "1.32", "1.25", "10", 1],
      ],
      last: newer,
    },
  });
}

after(() => {
  globalThis.fetch = originalFetch;
  resetCryptoChartForTests();
  setSqlClientForTests(null);
  rows.clear();
});

describe("XRP trigger quote cache", () => {
  it("uses Kraken when CoinGecko fails and keeps that print when both fail later", async () => {
    resetCryptoChartForTests();
    rows.clear();
    setSqlClientForTests(memorySql());
    const urls: string[] = [];
    let fail = false;
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("coingecko")) return new Response("limited", { status: 429 });
      if (url.includes("kraken")) return fail ? new Response("down", { status: 502 }) : krakenChart();
      throw new Error(`unexpected ${url}`);
    };
    const first = await loadXrpTriggerCloses();
    const second = await loadXrpTriggerCloses();
    assert.deepEqual(first, [
      { day: "2026-10-26", close: 1.11 },
      { day: "2026-10-27", close: 1.32 },
    ]);
    assert.deepEqual(second, first);
    assert.equal(urls.filter((url) => url.includes("kraken")).length, 1);
    assert.equal(urls.filter((url) => url.includes("coingecko")).length, 1);
    const cached = readXrpDailyCloseCache(Date.now());
    assert.ok(cached);
    fail = true;
    expireCryptoChartForTests();
    const kept = await loadXrpTriggerCloses();
    assert.deepEqual(kept, first);
    const afterFail = readXrpDailyCloseCache(Date.now());
    assert.equal(afterFail?.fetchedAt, cached.fetchedAt);
    assert.ok((afterFail?.ageMs ?? 0) > 15 * 60 * 1000 || afterFail?.fetchedAt === cached.fetchedAt);

    clearCryptoChartMemoryForTests();
    const calls = urls.length;
    const shared = await readSharedXrpTrigger();
    assert.deepEqual(shared?.closes, first);
    assert.equal(shared?.fetchedAt, cached.fetchedAt);
    assert.equal(shared?.source, "Kraken");
    assert.equal(urls.length, calls);
    const label = xrpTriggerAgeLabel(new Date(Date.parse(cached.fetchedAt) + 60 * 60 * 1000));
    assert.equal(label, "stale · 1h");
  });

  it("reports nothing when no feed and no stored print exists", async () => {
    resetCryptoChartForTests();
    rows.clear();
    setSqlClientForTests(memorySql());
    globalThis.fetch = async () => new Response("limited", { status: 429 });
    assert.equal(await loadXrpTriggerCloses(), null);
    assert.equal(readXrpDailyCloseCache(Date.now()), null);
    assert.equal(await readSharedXrpTrigger(), null);
  });
});
