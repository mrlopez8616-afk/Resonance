import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fills as seedFills } from "@/data/fills";
import { HBAR_AGENTIC_TOKENS } from "@/data/hbar-sleeves";
import { POSITION_LOG_FILLS } from "@/data/position-log-fills";
import { parseFillDeskQuery, filterFills, nodesWithValue } from "./fill-desk";
import { parseFillEvent } from "./fill-event";
import { addDecimal, subtractDecimal } from "./decimal";
import { listFills } from "./fills";
import { mergeSleeveBook, seedBookForTicker } from "./sleeve-apply";
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

  it("refuses an XRP Main fill and does not write flare-vault", () => {
    const seeded = createSeededFillsEnvelope();
    assert.throws(
      () =>
        ingestFillIntoEnvelope(
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
        ),
      /sleeve rh-main is not on the XRP face/,
    );
    assert.equal(seeded.sleevePrints.XRP?.["rh-main"], undefined);
    assert.equal(seeded.sleevePrints.XRP?.["flare-vault"], undefined);
    assert.equal(
      seeded.fills.some((fill) => fill.orderId === "xrp-main-1"),
      false,
    );
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
      assert.equal(written.fill.side, body.side);
      assert.equal(written.fill.quantity, body.qty);
      assert.equal(written.fill.price, body.price);
      assert.equal(written.fill.sleeve, "rh-agentic");
      assert.equal(written.fill.venue, "robinhood");
      envelope = written.envelope;
    }

    assert.equal(envelope.sleevePrints.HBAR, undefined);
    assert.equal(envelope.sleevePrints.XLM, undefined);
    assert.equal(seedBookForTicker("XLM"), null);
    assert.equal(
      mergeSleeveBook("HBAR", envelope.sleevePrints)[0]?.quantity,
      HBAR_AGENTIC_TOKENS,
    );
    assert.equal(mergeSleeveBook("XLM", envelope.sleevePrints).length, 0);
    assert.equal(HBAR_AGENTIC_TOKENS, "0");
    assert.equal(addDecimal(addDecimal("3846.51", "3963.14"), "38.26"), "7847.91");
    assert.equal(addDecimal(addDecimal("438.01", "409.10"), "3.95"), "851.06");
    assert.equal(subtractDecimal("1910.31", "1910.31"), "0");

    const buyNotionals = { HBAR: "0", XLM: "0" };
    for (const body of POSITION_LOG_FILLS) {
      if (body.side !== "buy") continue;
      buyNotionals[body.ticker] = addDecimal(
        buyNotionals[body.ticker],
        body.notional,
      );
    }
    assert.equal(buyNotionals.HBAR, "851.06");
    assert.equal(buyNotionals.XLM, "438.01");
    const xlmSell = POSITION_LOG_FILLS.find(
      (row) => row.ticker === "XLM" && row.side === "sell",
    );
    assert.equal(xlmSell?.orderId, "6abed758-0215-4703-8d11-c412686df9be");
    assert.equal(xlmSell?.qty, "1910.31");
    assert.equal(xlmSell?.price, "0.216176882");
    assert.equal(xlmSell?.notional, "412.96");
    assert.equal(xlmSell?.filledAt, "2026-10-01T17:57:44-04:00");

    const listed = listFills(envelope.fills);
    assert.deepEqual(
      filterFills(listed, parseFillDeskQuery({ ticker: "HBAR" })).map(
        (fill) => fill.orderId,
      ),
      [
        "6abed82c-87a4-49c7-9bd7-083c6a543efd",
        "6abed771-773a-43df-9015-3bf44caf9938",
        "6abbe0d2-3966-4255-9e10-8c160f667d88",
      ],
    );
    assert.deepEqual(
      filterFills(listed, parseFillDeskQuery({ ticker: "XLM" })).map(
        (fill) => fill.orderId,
      ),
      [
        "6abed758-0215-4703-8d11-c412686df9be",
        "6abbe113-41cb-4aa8-9e7c-0a986335b95a",
        "6abbe0e4-575c-4abe-a90e-90368b43a1b6",
      ],
    );
    assert.equal(
      filterFills(listed, parseFillDeskQuery({ ticker: "XLM" }))[0]?.side,
      "sell",
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
      "0",
    );
    assert.equal(
      mergeSleeveBook("XLM", withoutFlag.envelope.sleevePrints).length,
      0,
    );
    assert.equal(
      nodesWithValue(listed, {
        HBAR: mergeSleeveBook("HBAR", envelope.sleevePrints),
      })
        .map((node) => String(node.ticker))
        .includes("XLM"),
      false,
    );
    assert.equal(
      filterFills(listed, parseFillDeskQuery({})).some((fill) => fill.symbol === "XLM"),
      true,
    );

    const roundTrip = parseFillsEnvelope(JSON.parse(JSON.stringify(envelope)));
    assert.ok(roundTrip);
    const again = ensureSeededFillsEnvelope(roundTrip, "2026-09-30T18:00:00.000Z");
    assert.equal(again.seeded, false);
    assert.equal(again.envelope.fills.length, envelope.fills.length);
    assert.deepEqual(again.envelope.sleevePrints, {});
    assert.equal(
      again.envelope.fills.filter((fill) => fill.symbol === "XLM").length,
      3,
    );
  });

  it("keeps a stored XLM fill when the ticker is not a floor node", () => {
    const parsed = parseFillsEnvelope({
      version: 1,
      updatedAt: "2026-10-01T22:00:00.000Z",
      seededAt: "2026-10-01T22:00:00.000Z",
      fills: [
        {
          time: "2026-10-01T17:57:44-04:00",
          symbol: "XLM",
          side: "sell",
          quantity: "1910.31",
          price: "0.216176882",
          orderId: "6abed758-0215-4703-8d11-c412686df9be",
          result: "filled",
          venue: "robinhood",
          sleeve: "rh-agentic",
          logOnly: true,
        },
      ],
      sleevePrints: { XLM: { "rh-agentic": "1" } },
    });
    assert.ok(parsed);
    assert.equal(parsed.fills[0]?.symbol, "XLM");
    assert.equal(parsed.sleevePrints.XLM, undefined);
    assert.equal(
      filterFills(listFills(parsed.fills), parseFillDeskQuery({ ticker: "XLM" })).length,
      1,
    );
    assert.doesNotThrow(() => nodesWithValue(parsed.fills, {}));
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
    assert.equal(later.envelope.sleevePrints.HBAR?.["rh-agentic"], "1");
    assert.equal(later.envelope.sleevePrints.XLM, undefined);
  });

  it("logs a backfill without changing sleeves", () => {
    const seeded = createSeededFillsEnvelope("2026-09-19T00:00:00.000Z");
    const body = {
      venue: "robinhood",
      orderId: "hist-sui-1",
      ticker: "SUI",
      side: "buy",
      qty: "24",
      price: "1.10",
      sleeve: "rh-agentic",
      filledAt: "2026-09-01T08:30:00-05:00",
      backfill: true,
    };
    const written = ingestFillIntoEnvelope(
      seeded,
      parseFillEvent(body),
      "2026-10-08T12:00:00.000Z",
    );
    assert.equal(written.deduped, false);
    assert.equal(written.applied, false);
    assert.equal(written.backfill, true);
    assert.equal(written.fill.kind, undefined);
    assert.equal(written.fill.backfill, true);
    assert.equal(written.fill.logOnly, undefined);
    assert.equal(written.envelope.fills.length, seedFills.length + 1);
    assert.deepEqual(written.envelope.sleevePrints, {});

    const retry = ingestFillIntoEnvelope(written.envelope, parseFillEvent(body));
    assert.equal(retry.deduped, true);
    assert.equal(retry.applied, false);
    assert.equal(retry.backfill, true);
    assert.equal(retry.envelope.fills.length, written.envelope.fills.length);
    assert.deepEqual(retry.envelope.sleevePrints, {});

    const roundTrip = parseFillsEnvelope(JSON.parse(JSON.stringify(written.envelope)));
    const stored = roundTrip?.fills.find((fill) => fill.orderId === "hist-sui-1");
    assert.ok(stored);
    assert.equal(stored.kind, undefined);
    assert.equal(stored.backfill, true);
  });

  it("still applies a normal fill when backfill is absent", () => {
    const seeded = createSeededFillsEnvelope("2026-09-19T00:00:00.000Z");
    const written = ingestFillIntoEnvelope(
      seeded,
      parseFillEvent({
        venue: "robinhood",
        orderId: "live-sui-1",
        ticker: "SUI",
        side: "buy",
        qty: "2",
        price: "1.10",
        sleeve: "rh-agentic",
        filledAt: "2026-09-21T08:30:00-05:00",
        backfill: false,
        historical: false,
      }),
      "2026-09-21T13:30:00.000Z",
    );
    assert.equal(written.applied, true);
    assert.equal(written.deduped, false);
    assert.equal(written.backfill, undefined);
    assert.equal(written.fill.kind, undefined);
    assert.equal(written.fill.backfill, undefined);
    assert.equal(written.envelope.sleevePrints.SUI?.["rh-agentic"], "2");
  });

  it("applies the same order id once", () => {
    const seeded = createSeededFillsEnvelope("2026-09-19T00:00:00.000Z");
    const event = mondayBuy("once-sui");
    const first = ingestFillIntoEnvelope(seeded, event, "2026-09-21T13:30:00.000Z");
    assert.equal(first.applied, true);
    assert.equal(first.deduped, false);
    assert.equal(first.envelope.sleevePrints.SUI?.["rh-agentic"], "2");

    const second = ingestFillIntoEnvelope(first.envelope, event);
    assert.equal(second.deduped, true);
    assert.equal(second.applied, false);
    assert.equal(second.backfill, undefined);
    assert.equal(second.envelope.fills.length, first.envelope.fills.length);
    assert.equal(second.envelope.sleevePrints.SUI?.["rh-agentic"], "2");
    assert.equal(second.fill.orderId, first.fill.orderId);
  });

  it("treats historical: true as a backfill alias", () => {
    const seeded = createSeededFillsEnvelope("2026-09-19T00:00:00.000Z");
    const written = ingestFillIntoEnvelope(
      seeded,
      parseFillEvent({
        fill: {
          venue: "robinhood",
          orderId: "hist-alias-1",
          ticker: "SUI",
          side: "sell",
          qty: "3",
          price: "1.05",
          sleeve: "rh-agentic",
          filledAt: "2026-09-02T08:30:00-05:00",
        },
        historical: true,
      }),
      "2026-10-08T12:00:00.000Z",
    );
    assert.equal(written.deduped, false);
    assert.equal(written.applied, false);
    assert.equal(written.backfill, true);
    assert.equal(written.fill.kind, undefined);
    assert.equal(written.fill.backfill, true);
    assert.equal(written.fill.side, "sell");
    assert.equal(written.fill.quantity, "3");
    assert.deepEqual(written.envelope.sleevePrints, {});
    assert.equal(
      mergeSleeveBook("SUI", written.envelope.sleevePrints).find(
        (row) => row.id === "rh-agentic",
      )?.quantity,
      seedBookForTicker("SUI")?.find((row) => row.id === "rh-agentic")?.quantity,
    );
  });

  it("still refuses a backfill aimed at a sleeve that is not on the face", () => {
    const seeded = createSeededFillsEnvelope();
    assert.throws(
      () =>
        ingestFillIntoEnvelope(
          seeded,
          parseFillEvent({
            venue: "robinhood",
            orderId: "hist-xrp-main",
            ticker: "XRP",
            side: "buy",
            qty: "1",
            price: "1.40",
            sleeve: "rh-main",
            filledAt: "2026-09-21T09:00:00-05:00",
            backfill: true,
          }),
        ),
      /sleeve rh-main is not on the XRP face/,
    );
    assert.equal(
      seeded.fills.some((fill) => fill.orderId === "hist-xrp-main"),
      false,
    );
    assert.deepEqual(seeded.sleevePrints, {});
  });

  it("picks blob, local file, or none on Vercel the same way Phase Zero does", () => {
    assert.equal(
      detectFillsBackend({
        DATABASE_URL: "postgres://local/db",
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x",
      }),
      "postgres",
    );
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
