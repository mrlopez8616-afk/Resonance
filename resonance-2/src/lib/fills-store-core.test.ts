import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fills as seedFills } from "@/data/fills";
import { HBAR_AGENTIC_TOKENS } from "@/data/hbar-sleeves";
import { POSITION_LOG_FILLS } from "@/data/position-log-fills";
import { XLM_AGENTIC_TOKENS } from "@/data/xlm-sleeves";
import { parseFillDeskQuery, filterFills } from "./fill-desk";
import { parseFillEvent } from "./fill-event";
import { addDecimal } from "./decimal";
import { listFills } from "./fills";
import { mergeSleeveBook } from "./sleeve-apply";
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
    assert.equal(
      empty.envelope.fills.length,
      seedFills.length + POSITION_LOG_FILLS.length,
    );
    assert.deepEqual(empty.envelope.sleevePrints, {});
    assert.equal(
      empty.envelope.fills.filter((fill) => fill.logOnly).length,
      POSITION_LOG_FILLS.length,
    );
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

  it("logs the HBAR and XLM position fills without moving the seed totals", () => {
    let envelope = createSeededFillsEnvelope("2026-09-29T16:00:00.000Z");
    for (const body of POSITION_LOG_FILLS) {
      const written = ingestFillIntoEnvelope(
        envelope,
        parseFillEvent(body),
        "2026-09-29T16:05:00.000Z",
      );
      assert.equal(written.deduped, false);
      assert.equal(written.applied, false);
      assert.equal(written.fill.logOnly, true);
      assert.equal(written.fill.orderId, body.orderId);
      assert.equal(written.fill.symbol, body.ticker);
      assert.equal(written.fill.quantity, body.qty);
      assert.equal(written.fill.price, body.price);
      assert.equal(written.fill.sleeve, "rh-agentic");
      assert.equal(written.fill.venue, "robinhood");
      envelope = written.envelope;
    }

    assert.equal(envelope.sleevePrints.HBAR, undefined);
    assert.equal(envelope.sleevePrints.XLM, undefined);
    assert.equal(
      mergeSleeveBook("HBAR", envelope.sleevePrints)[0]?.quantity,
      HBAR_AGENTIC_TOKENS,
    );
    assert.equal(
      mergeSleeveBook("XLM", envelope.sleevePrints)[0]?.quantity,
      XLM_AGENTIC_TOKENS,
    );
    assert.equal(HBAR_AGENTIC_TOKENS, "3846.51");
    assert.equal(XLM_AGENTIC_TOKENS, "1910.31");
    assert.equal(addDecimal("1891.36", "18.95"), "1910.31");

    const notionals = { HBAR: "0", XLM: "0" };
    for (const body of POSITION_LOG_FILLS) {
      notionals[body.ticker] = addDecimal(notionals[body.ticker], body.notional);
    }
    assert.equal(notionals.HBAR, "438.01");
    assert.equal(notionals.XLM, "438.01");

    const listed = listFills(envelope.fills);
    assert.deepEqual(
      filterFills(listed, parseFillDeskQuery({ ticker: "HBAR" })).map(
        (fill) => fill.orderId,
      ),
      ["6abbe0d2-3966-4255-9e10-8c160f667d88"],
    );
    assert.deepEqual(
      filterFills(listed, parseFillDeskQuery({ ticker: "XLM" })).map(
        (fill) => fill.orderId,
      ),
      [
        "6abbe113-41cb-4aa8-9e7c-0a986335b95a",
        "6abbe0e4-575c-4abe-a90e-90368b43a1b6",
      ],
    );

    for (const body of POSITION_LOG_FILLS) {
      const retry = ingestFillIntoEnvelope(envelope, parseFillEvent(body));
      assert.equal(retry.deduped, true);
      assert.equal(retry.applied, false);
      assert.equal(retry.envelope, envelope);
      assert.equal(retry.envelope.fills.length, envelope.fills.length);
    }

    const withoutFlag = ingestFillIntoEnvelope(
      envelope,
      parseFillEvent({
        venue: "robinhood",
        orderId: "6abbe0d2-3966-4255-9e10-8c160f667d88",
        ticker: "HBAR",
        side: "buy",
        qty: "3846.51",
        price: "0.11387193",
        sleeve: "rh-agentic",
        filledAt: "2026-09-29T12:01:22-04:00",
      }),
    );
    assert.equal(withoutFlag.deduped, true);
    assert.equal(withoutFlag.applied, false);
    assert.equal(withoutFlag.envelope.sleevePrints.HBAR, undefined);
    assert.equal(
      mergeSleeveBook("HBAR", withoutFlag.envelope.sleevePrints)[0]?.quantity,
      "3846.51",
    );
    assert.equal(
      mergeSleeveBook("XLM", withoutFlag.envelope.sleevePrints)[0]?.quantity,
      "1910.31",
    );

    const roundTrip = parseFillsEnvelope(JSON.parse(JSON.stringify(envelope)));
    assert.ok(roundTrip);
    const again = ensureSeededFillsEnvelope(roundTrip, "2026-09-30T18:00:00.000Z");
    assert.equal(again.seeded, false);
    assert.equal(again.envelope.fills.length, envelope.fills.length);
    assert.deepEqual(again.envelope.sleevePrints, {});
  });

  it("still applies a later HBAR order that is not in the position log", () => {
    let envelope = createSeededFillsEnvelope();
    for (const body of POSITION_LOG_FILLS) {
      envelope = ingestFillIntoEnvelope(envelope, parseFillEvent(body)).envelope;
    }
    const later = ingestFillIntoEnvelope(
      envelope,
      parseFillEvent({
        venue: "robinhood",
        orderId: "later-hbar-order",
        ticker: "HBAR",
        side: "buy",
        qty: "1",
        price: "0.11",
        sleeve: "rh-agentic",
        filledAt: "2026-09-30T09:00:00-05:00",
      }),
    );
    assert.equal(later.applied, true);
    assert.equal(later.fill.logOnly, undefined);
    assert.equal(later.envelope.sleevePrints.HBAR?.["rh-agentic"], "3847.51");
    assert.equal(later.envelope.sleevePrints.XLM, undefined);
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
