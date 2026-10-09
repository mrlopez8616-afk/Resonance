import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { POST as postFill } from "@/app/api/fills/route";
import { GET as getSleeves } from "@/app/api/sleeves/route";
import { ETN_SLEEVES } from "@/data/etn-sleeves";
import { NVDA_SLEEVES } from "@/data/nvda-sleeves";
import { parseCalendarEvent } from "@/lib/calendar-event";
import { createEmptyFillsEnvelope, ingestFillIntoEnvelope } from "@/lib/fills-store-core";
import { nextAiCatalystLine } from "@/lib/home-lines";
import { assembleLiveFace } from "@/lib/live-face";
import { nodePageHref, nodesOnParent, parentAggregate } from "@/lib/node-parents";
import { applyFillToSleevePrints } from "@/lib/sleeve-apply";
import { valueCardFromFace } from "@/lib/value-card";
import {
  AI_STOCK_TICKERS,
  RETIRED_AI_TICKERS,
  retiredAiNodeHref,
  retiringHeldLine,
  retiringHeldTickers,
  sleevesForEquityCard,
} from "@/lib/ai-stocks";
import { FillIngestError, parseFillEvent } from "@/lib/fill-event";

const NOW = "2026-10-09T15:00:00.000Z";
const SECRET = "ai-stocks-test-secret";
const HUBB_HELD = [{ quantity: "0.039688" }];
const RETIRED = new Set<string>(RETIRED_AI_TICKERS);

function packet(ticker: string, side: "buy" | "sell", orderId: string) {
  return {
    venue: "robinhood",
    orderId,
    ticker,
    side,
    qty: "0.01",
    price: "100.00",
    sleeve: "rh-agentic",
    filledAt: "2026-10-09T10:00:00-05:00",
    result: "filled",
  };
}

function envSnapshot() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    VERCEL: process.env.VERCEL,
    RESONANCE_FILLS_FILE: process.env.RESONANCE_FILLS_FILE,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
  };
}

function restore(previous: ReturnType<typeof envSnapshot>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("AI Stocks eight", () => {
  it("accepts the four new tickers and ETN and HUBB sells, and still rejects junk", () => {
    for (const ticker of AI_STOCK_TICKERS) {
      const event = parseFillEvent(packet(ticker, "buy", `buy-${ticker}`));
      assert.equal(event.ticker, ticker);
      assert.equal(event.side, "buy");
    }
    for (const ticker of RETIRED_AI_TICKERS) {
      const event = parseFillEvent(packet(ticker, "sell", `sell-${ticker}`));
      assert.equal(event.ticker, ticker);
      assert.equal(event.side, "sell");
    }
    const xrp = parseFillEvent(packet("XRP", "sell", "trim-xrp"));
    assert.equal(xrp.ticker, "XRP");
    assert.equal(xrp.side, "sell");
    assert.throws(
      () => parseFillEvent(packet("DOGE", "buy", "junk")),
      (error: unknown) =>
        error instanceof FillIngestError &&
        error.status === 400 &&
        /ticker must be one of the locked nodes/.test(error.message) &&
        /retiring book \(ETN HUBB\)/.test(error.message),
    );
  });

  it("applies a new buy from zero and an ETN sell down to zero, once", () => {
    const buy = parseFillEvent(packet("NVDA", "buy", "nvda-once"));
    const first = ingestFillIntoEnvelope(createEmptyFillsEnvelope(NOW), buy, NOW);
    assert.equal(first.deduped, false);
    assert.equal(first.applied, true);
    assert.equal(first.envelope.sleevePrints.NVDA?.["rh-agentic"], "0.01");
    const again = ingestFillIntoEnvelope(first.envelope, buy, NOW);
    assert.equal(again.deduped, true);
    assert.equal(again.applied, false);
    assert.equal(
      again.envelope.fills.filter((row) => row.orderId === "nvda-once").length,
      1,
    );

    const sold = applyFillToSleevePrints(
      {},
      parseFillEvent({
        ...packet("ETN", "sell", "etn-close"),
        qty: ETN_SLEEVES[0]?.quantity,
      }),
    );
    assert.equal(sold.applied, true);
    assert.equal(sold.nextQuantity, "0");
    assert.deepEqual(retiringHeldTickers({ ETN: [{ quantity: "0" }], HUBB: HUBB_HELD }), ["HUBB"]);
    assert.equal(retiringHeldLine(retiringHeldTickers({ ETN: ETN_SLEEVES, HUBB: HUBB_HELD })), "ETN, HUBB still held");
  });

  it("shows no position when a child has no sleeve and sums only the eight", () => {
    const empty = assembleLiveFace("NVDA", sleevesForEquityCard(NVDA_SLEEVES), {
      usd: 180,
      source: "test",
      fetchedAt: NOW,
    });
    assert.equal(empty.sleeves.length, 0);
    assert.equal(empty.totalUsd, null);
    assert.deepEqual(valueCardFromFace(empty), {
      headline: null,
      priceLine: "$180.000 live",
      label: "no position",
    });

    const held = assembleLiveFace(
      "NVDA",
      [{ id: "rh-agentic", label: "RH Agentic", quantity: "2", source: "robinhood-config", manual: false }],
      { usd: 10, source: "test", fetchedAt: NOW },
    );
    assert.equal(held.totalUsd, 20);

    assert.deepEqual(
      nodesOnParent([], "ai-stocks").map((node) => node.ticker),
      [...AI_STOCK_TICKERS, "+"],
    );
    assert.equal(
      nodesOnParent([], "ai-stocks").some((node) => node.ticker === "ETN" || node.ticker === "HUBB"),
      false,
    );

    const sum = parentAggregate(
      "ai-stocks",
      [],
      {
        PWR: 1,
        VRT: 1,
        GEV: 1,
        CEG: 1,
        NVDA: 19,
        TSM: 19,
        TSLA: 19,
        SPCX: 19,
        ETN: 500,
        HUBB: 500,
      },
      null,
      "live",
    );
    assert.equal(sum.paintedCount, 8);
    assert.equal(sum.valuedCount, 8);
    assert.equal(sum.liveUsd, 80);
    assert.equal(nodePageHref("NVDA"), "/n/ai-stocks/nvda");
    assert.equal(nodePageHref("TSM"), "/n/ai-stocks/tsm");
    assert.equal(nodePageHref("TSLA"), "/n/ai-stocks/tsla");
    assert.equal(nodePageHref("SPCX"), "/n/ai-stocks/spcx");
    assert.equal(nodePageHref("ETN"), null);
    assert.equal(nodePageHref("HUBB"), null);
    assert.equal(retiredAiNodeHref("ai-stocks", "etn"), "/n/ai-stocks");
    assert.equal(retiredAiNodeHref("ai-stocks", "hubb"), "/n/ai-stocks");
    assert.equal(retiringHeldLine(["ETN", "HUBB"]), "ETN, HUBB still held");
    assert.equal(retiringHeldLine([]), null);
  });

  it("looks up a new catalyst and skips a retired one", () => {
    const event = parseCalendarEvent({
      kind: "catalyst",
      node: "NVDA",
      writer: "agent",
      start: "2026-11-19T00:00:00-06:00",
      title: "NVIDIA earnings",
      status: "tentative",
      source_url: "https://example.com/nvda",
    });
    assert.equal(event.node, "NVDA");
    const line = nextAiCatalystLine(
      [
        event,
        {
          ...event,
          id: "etn-old",
          node: "ETN",
          title: "Eaton earnings",
          start: "2026-10-10T00:00:00-05:00",
        },
      ],
      new Date("2026-10-09T15:00:00.000Z"),
    );
    assert.equal(line, "NVDA earnings · 19 Nov");
  });
});

describe("fills and sleeves routes for the new books", { concurrency: false }, () => {
  const previous = envSnapshot();
  let dir = "";

  after(async () => {
    restore(previous);
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("posts each new ticker and the retiring sells once, and rejects junk", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "resonance-fills-"));
    delete process.env.DATABASE_URL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    process.env.RESONANCE_FILLS_FILE = path.join(dir, "fills.json");
    process.env.RESONANCE_SYNC_SECRET = SECRET;

    async function post(body: unknown) {
      return postFill(
        new Request("http://localhost/api/fills", {
          method: "POST",
          headers: {
            authorization: `Bearer ${SECRET}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
    }

    for (const ticker of [...AI_STOCK_TICKERS, ...RETIRED_AI_TICKERS]) {
      const side = RETIRED.has(ticker) ? "sell" : "buy";
      const body = packet(ticker, side, `route-${ticker}`);
      const first = await post(body);
      assert.equal(first.status, 200, `${ticker} first ${await first.clone().text()}`);
      const created = (await first.json()) as { deduped: boolean; idempotencyKey: string };
      assert.equal(created.deduped, false);
      const second = await post(body);
      assert.equal(second.status, 200);
      const replay = (await second.json()) as { deduped: boolean; idempotencyKey: string };
      assert.equal(replay.deduped, true);
      assert.equal(replay.idempotencyKey, created.idempotencyKey);
    }

    const xrp = await post(packet("XRP", "sell", "route-xrp-trim"));
    assert.equal(xrp.status, 200);

    const junk = await post(packet("DOGE", "buy", "route-doge"));
    assert.equal(junk.status, 400);
    const junkBody = (await junk.json()) as { error: string };
    assert.match(junkBody.error, /ticker must be one of the locked nodes/);

    const stored = JSON.parse(await readFile(process.env.RESONANCE_FILLS_FILE, "utf8")) as {
      fills: { orderId?: string }[];
    };
    for (const ticker of AI_STOCK_TICKERS) {
      assert.equal(stored.fills.filter((row) => row.orderId === `route-${ticker}`).length, 1);
    }
    assert.equal(stored.fills.filter((row) => row.orderId === "route-ETN").length, 1);
    assert.equal(stored.fills.filter((row) => row.orderId === "route-HUBB").length, 1);

    const sleeves = await getSleeves(
      new Request("http://localhost/api/sleeves?ticker=NVDA", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    assert.equal(sleeves.status, 200);
    const book = (await sleeves.json()) as { ok: boolean; sleeves: { quantity: string }[] };
    assert.equal(book.ok, true);
    assert.equal(book.sleeves[0]?.quantity, "0.01");

    const missing = await getSleeves(
      new Request("http://localhost/api/sleeves?ticker=DOGE", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    assert.equal(missing.status, 404);
  });
});
