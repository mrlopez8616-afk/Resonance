import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { GET, POST } from "@/app/api/cron/brokers/route";
import { PWR_SLEEVES } from "@/data/pwr-sleeves";
import { SUI_SLEEVES } from "@/data/sui-sleeves";
import { XRP_SLEEVES } from "@/data/xrp-sleeves";
import {
  BROKER_CRON_JOBS,
  BROKER_SYNC_STALE_MS,
  applyBrokerPositions,
  brokerSyncNoteLines,
  brokerSyncResponse,
  coinbaseReadPath,
  describeBrokerSync,
  isHobbyBrokerSchedule,
  ordersFromCoinbaseFills,
  positionsFromCoinbase,
  positionsFromRobinhoodHoldings,
  readRobinhoodCredentials,
  robinhoodEquityMark,
  robinhoodReadPath,
  syncIsStale,
  tickerSyncLine,
} from "@/lib/broker-sync";
import { readCoinbaseSnapshot } from "@/lib/broker-sync-coinbase";
import { runScheduledBrokerSync } from "@/lib/broker-sync-run";
import { signRobinhoodMessage } from "@/lib/broker-sync-robinhood";
import { overlayStoredBrokerBooks, saveBrokerSnapshot, saveBrokerStatus } from "@/lib/broker-sync-store";
import { readCoinbaseCredentials, type CoinbasePortfolioRef } from "@/lib/coinbase-portfolio";
import { hasMoneyText } from "@/lib/public-mode";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { BROKER_SYNC_SQL, EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOW = new Date("2026-11-04T19:00:00.000Z");
const DEFAULT_ID = "11111111-1111-4111-8111-111111111111";
const AGENTIC_ID = "22222222-2222-4222-8222-222222222222";

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const portfolios: CoinbasePortfolioRef[] = [
  { uuid: DEFAULT_ID, name: "Default", type: "DEFAULT" },
  { uuid: AGENTIC_ID, name: "Agentic", type: "CONSUMER" },
];

function responseFor(url: string): Response {
  if (url.endsWith("/api/v3/brokerage/portfolios")) {
    return jsonResponse({
      portfolios: [
        { uuid: DEFAULT_ID, name: "Default", type: "DEFAULT" },
        { uuid: AGENTIC_ID, name: "Agentic", type: "CONSUMER" },
      ],
    });
  }
  if (url.endsWith(`/portfolios/${DEFAULT_ID}`)) {
    return jsonResponse({
      breakdown: {
        spot_positions: [
          { asset: "SUI", total_balance_crypto: 40.5 },
          { asset: "XRP", total_balance_crypto: 9 },
          { asset: "SUI", total_balance_crypto: 1.25 },
        ],
      },
    });
  }
  if (url.endsWith(`/portfolios/${AGENTIC_ID}`)) {
    return jsonResponse({
      breakdown: {
        spot_positions: [
          { asset: "XRP", total_balance_crypto: 4 },
          { asset: "SUI", total_balance_crypto: 0.5 },
        ],
      },
    });
  }
  if (url.includes("/api/v3/brokerage/accounts")) {
    return jsonResponse({
      accounts: [{ available_balance: { value: "15.25", currency: "USD" } }],
    });
  }
  if (url.includes("/orders/historical/fills")) {
    return jsonResponse({
      fills: [
        {
          trade_id: "trade-1",
          product_id: "SUI-USD",
          side: "BUY",
          size: "1.25",
          price: "1.10",
          trade_time: "2026-11-04T18:00:00Z",
        },
      ],
    });
  }
  if (url.includes("/crypto/trading/holdings/")) {
    return jsonResponse({
      results: [{ asset_code: "XRP", total_quantity: "3.5" }, { asset_code: "BTC", total_quantity: "1" }],
    });
  }
  if (url.includes("/crypto/trading/accounts/")) {
    return jsonResponse({
      results: [{ buying_power: "8.00", buying_power_currency: "USD" }],
    });
  }
  if (url.includes("/crypto/trading/orders/")) {
    return jsonResponse({
      results: [
        {
          id: "order-1",
          symbol: "XRP-USD",
          side: "buy",
          state: "filled",
          filled_asset_quantity: "3.5",
          average_price: "0.50",
          updated_at: "2026-11-04T18:30:00Z",
        },
      ],
    });
  }
  return jsonResponse({ error: "unexpected" }, 404);
}

describe("broker read sync", () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
    COINBASE_API_KEY_NAME: process.env.COINBASE_API_KEY_NAME,
    COINBASE_API_KEY_SECRET: process.env.COINBASE_API_KEY_SECRET,
    ROBINHOOD_API_KEY: process.env.ROBINHOOD_API_KEY,
    ROBINHOOD_API_PRIVATE_KEY: process.env.ROBINHOOD_API_PRIVATE_KEY,
  };

  after(() => {
    setSqlClientForTests(null);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("keeps the migration, the Hobby schedules, and the read-only clients", () => {
    const file = readFileSync(path.join(root, "db/migrations/049_broker_sync.sql"), "utf8");
    assert.equal(BROKER_SYNC_SQL, file);
    assert.equal(EMBEDDED_MIGRATIONS.at(-2)?.id, "049_broker_sync");
    assert.equal(file.includes("INSERT"), false);
    const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const scheduled = vercel.crons.filter((cron) => cron.path === "/api/cron/brokers");
    assert.deepEqual(
      scheduled.map((cron) => cron.schedule),
      BROKER_CRON_JOBS.map((job) => job.schedule),
    );
    for (const job of BROKER_CRON_JOBS) assert.equal(isHobbyBrokerSchedule(job.schedule), true);
    assert.equal(coinbaseReadPath("/api/v3/brokerage/orders"), false);
    assert.equal(coinbaseReadPath("/api/v3/brokerage/portfolios"), true);
    assert.equal(robinhoodReadPath("/api/v1/crypto/trading/orders/order-1/cancel/"), false);
    assert.equal(robinhoodReadPath("/api/v1/crypto/trading/holdings/"), true);
    for (const name of ["src/lib/broker-sync-coinbase.ts", "src/lib/broker-sync-robinhood.ts"]) {
      const source = readFileSync(path.join(root, name), "utf8");
      assert.equal(source.includes("place_order"), false, name);
      assert.equal(source.includes("method: \"POST\""), false, name);
      assert.equal(source.includes("/cancel/"), false, name);
    }
    const page = readFileSync(path.join(root, "src/app/n/[parent]/page.tsx"), "utf8");
    const first = page.indexOf('if (parent.id === "fight-desk")');
    const second = page.indexOf('if (parent.id === "fight-desk")', first + 1);
    const publicBlock = page.slice(page.indexOf("if (await isPublicMode())"), second);
    assert.equal(publicBlock.includes("BrokerSyncNote"), false);
    assert.equal(publicBlock.includes("cashLine"), false);
  });

  it("marks a missing key as not configured and a failed or old read as stale", () => {
    assert.equal(readCoinbaseCredentials({}), null);
    assert.equal(readRobinhoodCredentials({ ROBINHOOD_API_KEY: " rh-api-example " }), null);
    const fresh = describeBrokerSync({
      label: "Coinbase",
      status: "ok",
      syncedAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
      now: NOW,
      orders: 2,
      balances: [{ currency: "USD", amount: "15.25" }],
    });
    assert.equal(fresh.stale, false);
    assert.match(fresh.line, /synced /);
    assert.match(fresh.line, /2 recent orders/);
    assert.equal(hasMoneyText(fresh.line), false);
    assert.equal(fresh.cashLine, "Cash USD 15.25");
    assert.equal(hasMoneyText(fresh.cashLine ?? ""), true);
    const old = describeBrokerSync({
      label: "Coinbase",
      status: "ok",
      syncedAt: new Date(NOW.getTime() - BROKER_SYNC_STALE_MS - 1000).toISOString(),
      now: NOW,
    });
    assert.equal(old.stale, true);
    assert.match(old.line, /stale · last synced/);
    const failed = describeBrokerSync({
      label: "Robinhood",
      status: "error",
      syncedAt: fresh.syncedAt,
      now: NOW,
    });
    assert.equal(failed.stale, true);
    const missing = describeBrokerSync({
      label: "Robinhood",
      status: "not_configured",
      syncedAt: null,
      now: NOW,
    });
    assert.equal(missing.stale, false);
    assert.equal(missing.line, "Robinhood · not configured");
    const equity = robinhoodEquityMark(NOW);
    assert.equal(equity.line, "Agentic trader · Robinhood stocks not configured");
    assert.equal(equity.stale, false);
    assert.equal(syncIsStale("not_configured", null, NOW), false);
    const view = {
      coinbase: fresh,
      robinhood: missing,
      equity,
    };
    assert.equal(hasMoneyText(tickerSyncLine("SUI", view) ?? ""), false);
    assert.equal(tickerSyncLine("NVDA", view), equity.line);
    assert.equal(tickerSyncLine("HBAR", view), null);
    const notes = brokerSyncNoteLines("crypto", view);
    assert.equal(notes.some((line) => line.startsWith("Cash ")), true);
    assert.equal(notes.some((line) => line.startsWith("Agentic trader")), true);
    assert.equal(brokerSyncNoteLines("ai-stocks", view).join(" "), equity.line);
    const body = JSON.stringify(brokerSyncResponse(view));
    assert.equal(body.includes("$"), false);
    assert.equal(body.includes("15.25"), false);
    assert.equal(body.includes("USD"), false);
  });

  it("maps Coinbase sleeves and Robinhood crypto without touching the vault or share books", () => {
    const positions = positionsFromCoinbase(portfolios, new Map([
      [
        DEFAULT_ID,
        {
          breakdown: {
            spot_positions: [
              { asset: "SUI", total_balance_crypto: "40.5" },
              { asset: "XRP", total_balance_crypto: "9" },
            ],
          },
        },
      ],
      [
        AGENTIC_ID,
        { breakdown: { spot_positions: [{ asset: "XRP", total_balance_crypto: "4" }] } },
      ],
    ]));
    assert.deepEqual(positions, [
      { sleeveId: "coinbase", ticker: "SUI", quantity: "40.5" },
      { sleeveId: "cb-agentic", ticker: "SUI", quantity: "0" },
      { sleeveId: "cb-agentic", ticker: "XRP", quantity: "4" },
    ]);
    const books = applyBrokerPositions(
      { XRP: XRP_SLEEVES, SUI: SUI_SLEEVES, PWR: PWR_SLEEVES },
      positions ?? [],
    );
    assert.equal(books.SUI.find((row) => row.id === "coinbase")?.quantity, "40.5");
    assert.equal(books.SUI.find((row) => row.id === "cb-agentic")?.quantity, "0");
    assert.equal(books.SUI.find((row) => row.id === "rh-agentic")?.quantity, "0");
    assert.equal(books.XRP.find((row) => row.id === "cb-agentic")?.quantity, "4");
    assert.equal(books.XRP.find((row) => row.id === "flare-vault")?.quantity, "28287");
    assert.equal(books.XRP.find((row) => row.id === "coinbase"), undefined);
    assert.equal(books.PWR.find((row) => row.id === "rh-agentic")?.quantity, PWR_SLEEVES[0]?.quantity);
    const rh = positionsFromRobinhoodHoldings({
      results: [{ asset_code: "XRP", total_quantity: "3.5" }, { asset_code: "BTC", total_quantity: "1" }],
    });
    assert.deepEqual(
      rh?.map((row) => row.quantity),
      ["3.5", "0", "0"],
    );
    const moved = applyBrokerPositions(
      {
        XRP: [
          ...XRP_SLEEVES,
          { id: "rh-main", label: "RH Main", quantity: "8", source: "robinhood-config" as const, manual: false },
        ],
      },
      rh ?? [],
    );
    assert.equal(moved.XRP.find((row) => row.id === "rh-agentic")?.quantity, "3.5");
    assert.equal(moved.XRP.find((row) => row.id === "rh-main")?.quantity, "8");
    assert.equal(moved.XRP.find((row) => row.id === "flare-vault")?.quantity, "28287");
    assert.equal(
      ordersFromCoinbaseFills({
        fills: [{ trade_id: "t", product_id: "SUI-USD", side: "BUY", size: "1", price: "2", trade_time: "2026-11-04T00:00:00Z" }],
      })?.[0]?.ticker,
      "SUI",
    );
    const signature = signRobinhoodMessage(
      "xQnTJVeQLmw1/Mg2YimEViSpw/SdJcgNXZ5kQkAXNPU=",
      "rh-api-6148effc-c0b1-486c-8940-a1d099456be6" +
        "1698708981" +
        "/api/v1/crypto/trading/orders/" +
        "POST" +
        "{'client_order_id': '131de903-5a9c-4260-abc1-28d562a5dcf0', 'side': 'buy', 'symbol': 'BTC-USD', 'type': 'market', 'market_order_config': {'asset_quantity': '0.1'}}",
    );
    assert.equal(
      signature,
      "q/nEtxp/P2Or3hph3KejBqnw5o9qeuQ+hYRnB56FaHbjDsNUY9KhB1asMxohDnzdVFSD7StaTqjSd9U9HvaRAw==",
    );
  });

  it("stores a read and leaves quantities alone when the key is removed", async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    setSqlClientForTests(memorySql());
    await migrate();
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(init?.method ?? "GET", "GET");
      const href = String(url);
      calls.push(href);
      return responseFor(href);
    }) as typeof fetch;
    const env = {
      COINBASE_API_KEY_NAME: "organizations/o/apiKeys/k",
      COINBASE_API_KEY_SECRET: pem,
      ROBINHOOD_API_KEY: "rh-api-example",
      ROBINHOOD_API_PRIVATE_KEY: "xQnTJVeQLmw1/Mg2YimEViSpw/SdJcgNXZ5kQkAXNPU=",
    };
    const ran = await runScheduledBrokerSync({ now: NOW, env, fetchImpl });
    assert.equal(ran.body.coinbase.status, "ok");
    assert.equal(ran.body.coinbase.stale, false);
    assert.equal(ran.body.robinhood.status, "ok");
    assert.equal(ran.body.equity.status, "not_configured");
    assert.equal(JSON.stringify(ran.body).includes("$"), false);
    assert.equal(JSON.stringify(ran.body).includes("15.25"), false);
    assert.equal(calls.some((url) => url.includes("POST")), false);
    assert.equal(calls.every((url) => !url.includes("cancel")), true);
    const sui = await sqlQuery<{ quantity: string }>(
      "SELECT quantity FROM broker_positions WHERE venue = 'coinbase' AND ticker = 'SUI' AND sleeve_id = 'coinbase'",
    );
    assert.equal(sui[0]?.quantity, "41.75");
    const xrp = await sqlQuery<{ quantity: string }>(
      "SELECT quantity FROM broker_positions WHERE venue = 'robinhood' AND ticker = 'XRP'",
    );
    assert.equal(xrp[0]?.quantity, "3.5");
    const overlaid = await overlayStoredBrokerBooks({
      XRP: XRP_SLEEVES,
      SUI: SUI_SLEEVES,
      PWR: PWR_SLEEVES,
    });
    assert.equal(overlaid.SUI.find((row) => row.id === "coinbase")?.quantity, "41.75");
    assert.equal(overlaid.XRP.find((row) => row.id === "rh-agentic")?.quantity, "3.5");
    assert.equal(overlaid.XRP.find((row) => row.id === "flare-vault")?.quantity, "28287");
    assert.equal(overlaid.PWR[0]?.quantity, PWR_SLEEVES[0]?.quantity);
    await saveBrokerStatus({
      venue: "coinbase",
      status: "not_configured",
      checkedAt: NOW.toISOString(),
      message: "not configured",
    });
    const cleared = await overlayStoredBrokerBooks({ SUI: SUI_SLEEVES });
    assert.equal(cleared.SUI.find((row) => row.id === "coinbase")?.quantity, SUI_SLEEVES.find((row) => row.id === "coinbase")?.quantity);
    await saveBrokerSnapshot(
      "coinbase",
      {
        positions: [{ sleeveId: "coinbase", ticker: "SUI", quantity: "41.75" }],
        balances: [],
        orders: [],
        ordersUnread: false,
        balancesUnread: false,
      },
      NOW,
    );
    await saveBrokerStatus({
      venue: "coinbase",
      status: "error",
      checkedAt: new Date(NOW.getTime() + 1000).toISOString(),
      message: "read failed",
    });
    const kept = await overlayStoredBrokerBooks({ SUI: SUI_SLEEVES });
    assert.equal(kept.SUI.find((row) => row.id === "coinbase")?.quantity, "41.75");
  });

  it("records not configured without calling a broker and stays closed when logged out", async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.CRON_SECRET = "cron-secret";
    delete process.env.COINBASE_API_KEY_NAME;
    delete process.env.COINBASE_API_KEY_SECRET;
    delete process.env.ROBINHOOD_API_KEY;
    delete process.env.ROBINHOOD_API_PRIVATE_KEY;
    setSqlClientForTests(memorySql());
    await migrate();
    const denied = await GET(new Request("https://resonance3.vercel.app/api/cron/brokers"));
    assert.equal(denied.status, 401);
    assert.equal((await denied.text()).includes("$"), false);
    let called = false;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof fetch;
    try {
      const allowed = await POST(
        new Request("https://resonance3.vercel.app/api/cron/brokers", {
          method: "POST",
          headers: { authorization: "Bearer cron-secret" },
        }),
      );
      assert.equal(allowed.status, 200);
      const body = (await allowed.json()) as {
        ok: boolean;
        coinbase: { status: string; stale: boolean };
        robinhood: { status: string };
        equity: { status: string };
      };
      assert.equal(body.ok, true);
      assert.equal(body.coinbase.status, "not_configured");
      assert.equal(body.coinbase.stale, false);
      assert.equal(body.robinhood.status, "not_configured");
      assert.equal(body.equity.status, "not_configured");
      assert.equal(called, false);
      const direct = await readCoinbaseSnapshot({
        credentials: { keyName: "organizations/o/apiKeys/k", keySecret: "not-a-key" },
        fetchImpl: (async () => jsonResponse({})) as typeof fetch,
      }).catch((error: unknown) => error);
      assert.ok(direct instanceof Error);
    } finally {
      globalThis.fetch = original;
    }
  });
});
