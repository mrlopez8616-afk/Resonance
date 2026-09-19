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
      () => parseFillEvent({ ...mondayPacket, ticker: "DOGE" }),
      /locked 12/,
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
});
