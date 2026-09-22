import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Fill } from "@/data/fills";
import {
  fillDeskHref,
  fillDeskIsActive,
  filterFills,
  nodesWithValue,
  parseFillDeskQuery,
  quantityHasValue,
} from "./fill-desk";
import { LIVE_SLEEVE_SEEDS } from "./sleeve-apply";

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
  });

  it("lists every node with a non-zero sleeve print or fill quantity", () => {
    assert.equal(quantityHasValue("0"), false);
    assert.equal(quantityHasValue("0.000"), false);
    assert.equal(quantityHasValue("TBD"), false);
    assert.equal(quantityHasValue("0.003917"), true);

    assert.deepEqual(
      nodesWithValue([], LIVE_SLEEVE_SEEDS).map((node) => node.ticker),
      ["XRP", "SUI", "PWR", "ETN", "VRT", "GEV", "CEG", "HUBB"],
    );
    assert.equal(
      nodesWithValue([], { SUI: [{ quantity: "0" }] }).length,
      0,
    );

    const btcFill: Fill = {
      time: "2026-09-01T00:00:00Z",
      symbol: "btc",
      side: "buy",
      quantity: "0.01",
      price: "1",
      orderId: "btc-1",
      result: "filled",
    };
    const zeroSol: Fill = { ...btcFill, symbol: "SOL", quantity: "0", orderId: "sol-0" };
    const nodes = nodesWithValue([btcFill, zeroSol, rows[0]], {
      XRP: [{ quantity: "0" }, { quantity: "28273" }],
      SUI: [{ quantity: "0" }],
    });
    assert.deepEqual(
      nodes.map((node) => `${node.ticker}:${node.mark}`),
      ["BTC:fills", "XRP:sleeve", "SUI:fills"],
    );
  });
});
