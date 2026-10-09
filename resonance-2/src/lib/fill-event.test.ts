import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fill } from "@/data/fills";
import {
  FillIngestError,
  eventToFill,
  fillIdempotencyKey,
  fillMatchesEvent,
  parseFillEvent,
} from "./fill-event";

const mondayPacket = {
  venue: "Robinhood",
  orderId: "Aa-1111-BB",
  ticker: "sui",
  side: "BUY",
  qty: "2.5",
  price: "1.10",
  sleeve: "rh-agentic",
  filledAt: "2026-09-21T08:30:00-05:00",
  result: "filled",
  note: "Monday Agentic SUI→6 AI",
};

describe("fill event parse + idempotency", () => {
  it("normalizes venue, ticker, side, and the idempotency key", () => {
    const event = parseFillEvent(mondayPacket);
    assert.equal(event.venue, "robinhood");
    assert.equal(event.ticker, "SUI");
    assert.equal(event.side, "buy");
    assert.equal(event.sleeve, "rh-agentic");
    assert.equal(event.idempotencyKey, "robinhood:aa-1111-bb");
    assert.equal(fillIdempotencyKey("robinhood", "Aa-1111-BB"), "robinhood:aa-1111-bb");
  });

  it("accepts existing Fill field aliases and a { fill } wrapper", () => {
    const event = parseFillEvent({
      fill: {
        venue: "coinbase",
        tradeId: "trade-99",
        symbol: "XRP",
        side: "sell",
        quantity: "1.5",
        price: "0",
        sleeveTarget: "coinbase",
        time: "2026-09-19T12:00:00Z",
      },
    });
    assert.equal(event.ticker, "XRP");
    assert.equal(event.qty, "1.5");
    assert.equal(event.orderId, "trade-99");
    assert.equal(event.idempotencyKey, "coinbase:trade-99");
    assert.equal(eventToFill(event).symbol, "XRP");
  });

  it("refuses flare-vault before any store write", () => {
    assert.throws(
      () =>
        parseFillEvent({
          ...mondayPacket,
          sleeve: "flare-vault",
        }),
      (error: unknown) =>
        error instanceof FillIngestError &&
        error.status === 400 &&
        /flare-vault/.test(error.message),
    );
  });

  it("refuses venue / sleeve mismatches and unknown tickers", () => {
    assert.throws(
      () => parseFillEvent({ ...mondayPacket, sleeve: "coinbase" }),
      /not valid for venue/,
    );
    assert.throws(
      () =>
        parseFillEvent({
          ...mondayPacket,
          venue: "coinbase",
          sleeve: "rh-agentic",
        }),
      /not valid for venue/,
    );
    assert.throws(
      () =>
        parseFillEvent({
          ...mondayPacket,
          ticker: "XRP",
          sleeve: "cb-agentic",
        }),
      /not valid for venue/,
    );
    const agentic = parseFillEvent({
      venue: "coinbase",
      orderId: "cb-agentic-xrp-1",
      ticker: "XRP",
      side: "buy",
      qty: "1",
      price: "1.40",
      sleeve: "cb-agentic",
      filledAt: "2026-10-09T12:00:00-05:00",
    });
    assert.equal(agentic.venue, "coinbase");
    assert.equal(agentic.sleeve, "cb-agentic");
    assert.equal(agentic.idempotencyKey, "coinbase:cb-agentic-xrp-1");
    assert.throws(
      () => parseFillEvent({ ...mondayPacket, ticker: "DOGE" }),
      /locked nodes \(BTC ETH SOL XRP SUI FLR PWR VRT GEV CEG NVDA TSM TSLA SPCX HBAR\)/,
    );
  });

  it("keeps the three historical XLM fills and refuses a new XLM order", () => {
    for (const orderId of [
      "6abbe0e4-575c-4abe-a90e-90368b43a1b6",
      "6abbe113-41cb-4aa8-9e7c-0a986335b95a",
      "6abed758-0215-4703-8d11-c412686df9be",
    ]) {
      const event = parseFillEvent({
        venue: "robinhood",
        orderId,
        ticker: "XLM",
        side: orderId.startsWith("6abed758") ? "sell" : "buy",
        qty: "1",
        price: "0.22",
        sleeve: "rh-agentic",
        filledAt: "2026-09-29T12:01:40-04:00",
      });
      assert.equal(event.ticker, "XLM");
      assert.equal(eventToFill(event).symbol, "XLM");
    }
    assert.throws(
      () =>
        parseFillEvent({
          ...mondayPacket,
          orderId: "new-xlm-order",
          ticker: "XLM",
        }),
      /locked nodes \(BTC ETH SOL XRP SUI FLR PWR VRT GEV CEG NVDA TSM TSLA SPCX HBAR\)/,
    );
  });

  it("matches a seed row by order id even without venue", () => {
    const event = parseFillEvent({
      venue: "robinhood",
      orderId: "6aad6b7a-415a-4895-b43c-72c0eca79a55",
      ticker: "XRP",
      side: "sell",
      qty: "10",
      price: "1.36756",
      sleeve: "rh-agentic",
      filledAt: "2026-09-18T11:48:58-05:00",
    });
    const seed: Fill = {
      time: "2026-09-18T11:48:58-05:00",
      symbol: "XRP",
      side: "sell",
      quantity: "10",
      price: "1.36756",
      orderId: "6aad6b7a-415a-4895-b43c-72c0eca79a55",
      result: "filled",
    };
    assert.equal(fillMatchesEvent(seed, event), true);
  });

  it("parses an internal sleeve transfer and rejects a bad one", () => {
    const body = {
      kind: "transfer",
      venue: "coinbase",
      orderId: "transfer:cb-agentic->coinbase:SUI:2026-10-09T16:59",
      idempotencyKey: "coinbase:transfer:cb-agentic->coinbase:sui:2026-10-09t16:59",
      ticker: "SUI",
      quantity: "1.2",
      fromSleeve: "cb-agentic",
      toSleeve: "coinbase",
      filledAt: "2026-10-09T16:59:00-05:00",
      result: "filled",
      note: "Coinbase portfolio transfer Agentic d757d013 to Default 5aba0d3b. Not a trade.",
    };
    const event = parseFillEvent(body);
    assert.equal(event.kind, "transfer");
    assert.equal(
      event.idempotencyKey,
      "coinbase:transfer:cb-agentic->coinbase:sui:2026-10-09t16:59",
    );
    assert.equal(
      event.idempotencyKey,
      fillIdempotencyKey("coinbase", "transfer:cb-agentic->coinbase:SUI:2026-10-09T16:59"),
    );
    if (event.kind !== "transfer") return;
    assert.equal(event.fromSleeve, "cb-agentic");
    assert.equal(event.toSleeve, "coinbase");
    assert.equal(event.qty, "1.2");
    const fill = eventToFill(event);
    assert.equal(fill.kind, "transfer");
    assert.equal(fill.quantity, "1.2");
    assert.equal("side" in fill, false);
    assert.equal("price" in fill, false);
    const alias = parseFillEvent({ ...body, kind: undefined, side: "transfer" });
    assert.equal(alias.kind, "transfer");
    assert.equal(alias.idempotencyKey, event.idempotencyKey);

    assert.throws(
      () => parseFillEvent({ ...body, idempotencyKey: undefined }),
      /idempotencyKey is required/,
    );
    assert.throws(
      () => parseFillEvent({ ...body, fromSleeve: "coinbase" }),
      /must be different/,
    );
    assert.throws(
      () => parseFillEvent({ ...body, fromSleeve: "flare-vault" }),
      /flare-vault/,
    );
    assert.throws(
      () => parseFillEvent({ ...body, fromSleeve: "rh-main" }),
      /not valid for venue/,
    );
    assert.throws(
      () => parseFillEvent({ ...body, quantity: "0" }),
      /positive decimal/,
    );
    assert.throws(
      () => parseFillEvent({ ...body, backfill: true }),
      /backfill/,
    );
  });
});
