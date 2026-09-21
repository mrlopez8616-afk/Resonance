import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fills as seedFills } from "@/data/fills";
import { parseFillEvent } from "./fill-event";
import {
  createEmptyFillsEnvelope,
  createSeededFillsEnvelope,
  detectFillsBackend,
  ensureSeededFillsEnvelope,
  ingestFillIntoEnvelope,
  isFillsStoreConfigured,
  parseFillsEnvelope,
} from "./fills-store-core";

function mondayBuy(orderId = "monday-sui-6ai") {
  return parseFillEvent({
    venue: "robinhood",
    orderId,
    ticker: "SUI",
    side: "buy",
    qty: "2",
    price: "1.10",
    sleeve: "rh-agentic",
    filledAt: "2026-09-21T08:30:00-05:00",
    note: "Monday Agentic SUI→6 AI",
  });
}

describe("fills store core", () => {
  it("seeds the static fill log without applying sleeve math", () => {
    const empty = ensureSeededFillsEnvelope(createEmptyFillsEnvelope());
    assert.equal(empty.seeded, true);
    assert.equal(empty.envelope.fills.length, seedFills.length);
    assert.deepEqual(empty.envelope.sleevePrints, {});
    const again = ensureSeededFillsEnvelope(empty.envelope);
    assert.equal(again.seeded, false);
  });

  it("appends a fill, applies the sleeve, and dedupes retries", () => {
    const seeded = createSeededFillsEnvelope("2026-09-19T00:00:00.000Z");
    const first = ingestFillIntoEnvelope(
      seeded,
      mondayBuy(),
      "2026-09-21T13:30:00.000Z",
    );
    assert.equal(first.deduped, false);
    assert.equal(first.applied, true);
    assert.equal(first.envelope.fills.length, seedFills.length + 1);
    assert.equal(first.envelope.sleevePrints.SUI?.["rh-agentic"], "2");
    assert.equal(first.fill.idempotencyKey, "robinhood:monday-sui-6ai");

    const retry = ingestFillIntoEnvelope(first.envelope, mondayBuy());
    assert.equal(retry.deduped, true);
    assert.equal(retry.applied, false);
    assert.equal(retry.envelope.fills.length, first.envelope.fills.length);
    assert.equal(retry.envelope.sleevePrints.SUI?.["rh-agentic"], "2");
    assert.equal(retry.fill.orderId, first.fill.orderId);
  });

  it("dedupes a hub retry of a seed order id so history is not double-counted", () => {
    const seeded = createSeededFillsEnvelope();
    const seedRow = seedFills[0];
    assert.ok(seedRow);
    const result = ingestFillIntoEnvelope(
      seeded,
      parseFillEvent({
        venue: "robinhood",
        orderId: seedRow.orderId,
        ticker: seedRow.symbol,
        side: seedRow.side,
        qty: seedRow.quantity,
        price: seedRow.price,
        sleeve: "rh-agentic",
        filledAt: seedRow.time,
      }),
    );
    assert.equal(result.deduped, true);
    assert.deepEqual(result.envelope.sleevePrints, {});
  });

  it("does not write flare-vault into sleevePrints on a successful XRP Main fill", () => {
    const seeded = createSeededFillsEnvelope();
    const result = ingestFillIntoEnvelope(
      seeded,
      parseFillEvent({
        venue: "robinhood",
        orderId: "xrp-main-1",
        ticker: "XRP",
        side: "buy",
        qty: "1",
        price: "1.40",
        sleeve: "rh-main",
        filledAt: "2026-09-21T09:00:00-05:00",
      }),
    );
    assert.equal(result.envelope.sleevePrints.XRP?.["rh-main"], "588.718");
    assert.equal(result.envelope.sleevePrints.XRP?.["flare-vault"], undefined);
  });

  it("strips a tampered flare-vault override when parsing", () => {
    const parsed = parseFillsEnvelope({
      version: 1,
      updatedAt: "2026-09-19T00:00:00.000Z",
      seededAt: "2026-09-19T00:00:00.000Z",
      fills: seedFills,
      sleevePrints: {
        XRP: { "flare-vault": "1", "rh-agentic": "52" },
      },
    });
    assert.equal(parsed?.sleevePrints.XRP?.["flare-vault"], undefined);
    assert.equal(parsed?.sleevePrints.XRP?.["rh-agentic"], "52");
  });

  it("picks blob, local file, or none on Vercel the same way Phase Zero does", () => {
    assert.equal(
      detectFillsBackend({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x" }),
      "blob",
    );
    assert.equal(
      detectFillsBackend({ RESONANCE_FILLS_FILE: "/tmp/fills.json" }),
      "file",
    );
    assert.equal(detectFillsBackend({ VERCEL: "1" }), "none");
    assert.equal(detectFillsBackend({}), "file");
    assert.equal(isFillsStoreConfigured({ VERCEL: "1" }), false);
    assert.equal(isFillsStoreConfigured({ BLOB_READ_WRITE_TOKEN: "x" }), true);
  });
});
