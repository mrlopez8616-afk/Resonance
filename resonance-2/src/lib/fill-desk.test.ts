import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fill } from "@/data/fills";
import {
  fillDeskHref,
  fillDeskIsActive,
  filterFills,
  parseFillDeskQuery,
  recentFills,
} from "./fill-desk";

const rows: Fill[] = [
  {
    time: "2026-09-21T08:30:00-05:00",
    symbol: "SUI",
    side: "buy",
    quantity: "8.931",
    price: "1.10",
    orderId: "sui-agentic",
    result: "filled",
    venue: "robinhood",
    sleeve: "rh-agentic",
    idempotencyKey: "robinhood:sui-agentic",
  },
  {
    time: "2026-09-18T11:49:18-05:00",
    symbol: "SUI",
    side: "buy",
    quantity: "16.931",
    price: "0.80729341",
    orderId: "sui-seed",
    result: "filled",
  },
  {
    time: "2026-09-18T11:48:58-05:00",
    symbol: "XRP",
    side: "sell",
    quantity: "10",
    price: "1.36756",
    orderId: "xrp-seed",
    result: "filled",
  },
  {
    time: "2026-09-19T16:00:00Z",
    symbol: "XRP",
    side: "buy",
    quantity: "1",
    price: "1.20",
    orderId: "xrp-cb",
    result: "filled",
    venue: "coinbase",
    sleeve: "coinbase",
    idempotencyKey: "coinbase:xrp-cb",
  },
];

describe("operator log desk", () => {
  it("keeps only the locked ticker and ignores doctrine outside the 12", () => {
    const query = parseFillDeskQuery({ ticker: " sui " });
    assert.deepEqual(
      filterFills(rows, query).map((fill) => fill.orderId),
      ["sui-agentic", "sui-seed"],
    );
    assert.equal(parseFillDeskQuery({ ticker: "DOGE" }).ticker, "");
    assert.equal(parseFillDeskQuery({ sleeve: "flare-vault" }).sleeve, "");
    assert.equal(parseFillDeskQuery({ source: "binance" }).source, "");
  });

  it("filters an inclusive date range on the printed calendar day", () => {
    const query = parseFillDeskQuery({ from: "2026-09-19", to: "2026-09-18" });
    assert.equal(query.from, "2026-09-18");
    assert.equal(query.to, "2026-09-19");
    assert.deepEqual(
      filterFills(rows, query).map((fill) => fill.orderId),
      ["sui-seed", "xrp-seed", "xrp-cb"],
    );
    assert.deepEqual(
      filterFills(rows, parseFillDeskQuery({ from: "2026-09-21" })).map(
        (fill) => fill.orderId,
      ),
      ["sui-agentic"],
    );
  });

  it("filters sleeve and source, including unset seed rows", () => {
    assert.deepEqual(
      filterFills(rows, parseFillDeskQuery({ sleeve: "rh-agentic" })).map(
        (fill) => fill.orderId,
      ),
      ["sui-agentic"],
    );
    assert.deepEqual(
      filterFills(rows, parseFillDeskQuery({ source: "unset" })).map(
        (fill) => fill.orderId,
      ),
      ["sui-seed", "xrp-seed"],
    );
    assert.deepEqual(
      filterFills(rows, parseFillDeskQuery({ sleeve: "coinbase", ticker: "XRP" })).map(
        (fill) => fill.orderId,
      ),
      ["xrp-cb"],
    );
  });

  it("does not reorder the store and builds one desk href", () => {
    const filtered = filterFills(rows, parseFillDeskQuery({}));
    assert.deepEqual(
      filtered.map((fill) => fill.orderId),
      rows.map((fill) => fill.orderId),
    );
    assert.equal(fillDeskIsActive(parseFillDeskQuery({})), false);
    assert.equal(
      fillDeskHref({ ticker: "xrp", source: "robinhood", sleeve: "flare-vault" }),
      "/log?ticker=XRP&source=robinhood",
    );
    assert.equal(fillDeskHref({ ticker: "NOPE" }), "/log");
    assert.deepEqual(
      recentFills(rows, 2).map((fill) => fill.orderId),
      ["sui-agentic", "sui-seed"],
    );
  });
});
