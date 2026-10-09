import assert from "node:assert/strict";
import { isValidElement, type ReactNode } from "react";
import { describe, it } from "node:test";
import { PositionChartView, LotsTable, PositionRollupView } from "@/components/position-book";
import { bookTotals } from "./position-lots";
import {
  assembleNodePosition,
  buildLotsLedger,
  buildPositionChart,
  coinbaseAgenticUnknownLine,
  rollupHoldingBooks,
  totalsWithUnknownHolding,
  vaultUnknownLine,
  xrpAgenticUnknownLine,
  type LedgerFill,
} from "./position-lots";

function fill(row: Partial<LedgerFill> & Pick<LedgerFill, "time" | "side" | "quantity" | "price">): LedgerFill {
  return {
    symbol: "NVDA",
    sleeve: "rh-agentic",
    result: "filled",
    ...row,
  };
}

const buys: LedgerFill[] = [
  fill({ time: "2026-10-01T15:00:00Z", side: "buy", quantity: "3", price: "100" }),
  fill({ time: "2026-10-02T15:00:00Z", side: "buy", quantity: "2", price: "120" }),
  fill({ time: "2026-10-03T15:00:00Z", side: "buy", quantity: "4", price: "110" }),
];

const sold = [
  ...buys,
  fill({ time: "2026-10-06T15:00:00Z", side: "sell", quantity: "4", price: "130" }),
];

describe("FIFO lots", () => {
  it("closes the oldest lot first and keeps the remainder labeled", () => {
    const ledger = buildLotsLedger({
      fills: sold,
      ticker: "NVDA",
      sleeve: "rh-agentic",
      quantity: "5",
      livePrice: 130,
    });
    assert.equal(ledger.status, "matched");
    assert.equal(ledger.openShares, "5");
    assert.equal(ledger.gapShares, null);
    assert.equal(ledger.note, null);
    assert.deepEqual(
      ledger.openLots.map((lot) => lot.sharesLabel),
      ["4", "1 of 2"],
    );
    assert.deepEqual(
      ledger.openLots.map((lot) => lot.price),
      ["110", "120"],
    );
    assert.equal(ledger.closedLots.length, 1);
    assert.equal(ledger.closedLots[0]?.originalQty, "3");
    assert.equal(ledger.closedLots[0]?.price, "100");
    const totals = bookTotals(ledger, 130, "5");
    assert.equal(totals.costUsd, 560);
    assert.equal(totals.averageUsd, 112);
    assert.equal(totals.valueUsd, 650);
    assert.equal(totals.pnlUsd, 90);
    assert.equal(totals.partial, false);
  });

  it("shows a gap row when fills explain less than the sleeve", () => {
    const ledger = buildLotsLedger({
      fills: sold,
      ticker: "NVDA",
      sleeve: "rh-agentic",
      quantity: "7",
      livePrice: 10,
    });
    assert.equal(ledger.status, "short");
    assert.equal(ledger.gapShares, "2");
    assert.equal(ledger.openLots.length, 2);
    const totals = bookTotals(ledger, 10, "7");
    assert.equal(totals.partial, true);
    assert.equal(totals.partialLabel, "known lots");
    assert.equal(totals.costUsd, 560);
    assert.equal(totals.sharesLabel, "5");
  });

  it("refuses to guess lots when fills explain more than the sleeve", () => {
    const ledger = buildLotsLedger({
      fills: sold,
      ticker: "NVDA",
      sleeve: "rh-agentic",
      quantity: "4",
      livePrice: 10,
    });
    assert.equal(ledger.status, "over");
    assert.equal(ledger.note, "fills don't match holdings");
    assert.deepEqual(ledger.openLots, []);
    assert.equal(ledger.costUsd, null);
    const totals = bookTotals(ledger, 10, "4");
    assert.equal(totals.partialLabel, "entry unknown");
    assert.equal(totals.costUsd, null);
    assert.equal(totals.valueUsd, 40);
  });

  it("ignores a null sleeve and never counts the vault", () => {
    const ledger = buildLotsLedger({
      fills: [
        ...sold,
        fill({ time: "2026-10-04T15:00:00Z", side: "buy", quantity: "9", price: "1", sleeve: undefined }),
        fill({
          time: "2026-09-01T15:00:00Z",
          symbol: "XRP",
          side: "buy",
          quantity: "28281",
          price: "0.5",
          sleeve: "flare-vault",
        }),
      ],
      ticker: "NVDA",
      sleeve: "rh-agentic",
      quantity: "5",
      livePrice: 130,
    });
    assert.equal(ledger.status, "matched");
    assert.equal(ledger.openShares, "5");
    assert.equal(ledger.costUsd, 560);
    assert.equal(vaultUnknownLine("28281"), "Flare / Xaman vault · manual · entry unknown");
    assert.equal(vaultUnknownLine("0"), null);
    assert.equal(coinbaseAgenticUnknownLine("10"), "Coinbase Agentic · 10 · entry unknown");
    assert.equal(coinbaseAgenticUnknownLine("0"), null);
    assert.equal(
      xrpAgenticUnknownLine("SUI", [{ id: "coinbase", quantity: "33.7" }]),
      null,
    );
  });

  it("marks XRP partial for Coinbase Agentic and leaves the Default book off", () => {
    const fills = [
      fill({
        time: "2026-09-01T15:00:00Z",
        symbol: "XRP",
        side: "buy",
        quantity: "51.601",
        price: "1.40",
        sleeve: "rh-agentic",
      }),
    ];
    const sleeves = [
      { id: "rh-agentic", quantity: "51.601" },
      { id: "cb-agentic", quantity: "10" },
      { id: "flare-vault", quantity: "28281" },
    ];
    const position = assembleNodePosition({
      fills,
      ticker: "XRP",
      sleeves,
      priceUsd: 2,
      closes: [],
      today: "2026-10-09",
      vaultQuantity: "28281",
    });
    assert.ok(position);
    assert.equal(position.ledger.status, "matched");
    assert.equal(position.ledger.costUsd, 72.24);
    assert.equal(position.unknownLine, "Coinbase Agentic · 10 · entry unknown");
    assert.equal(position.vaultLine, "Flare / Xaman vault · manual · entry unknown");
    const totals = totalsWithUnknownHolding(bookTotals(position.ledger, 2, position.quantity), position.unknownLine);
    assert.equal(totals.partial, true);
    assert.equal(totals.partialLabel, "partial");
    assert.equal(totals.costUsd, 72.24);
    const text = collectText(
      LotsTable({
        ledger: position.ledger,
        totals,
        liveLabel: null,
        vaultLine: position.vaultLine,
        unknownLine: position.unknownLine,
      }),
    ).join(" ");
    assert.match(text, /Coinbase Agentic · 10 · entry unknown/);
    assert.match(text, /Total · partial/);
    assert.equal(text.includes("628"), false);
    assert.equal(text.includes("coinbase"), false);
    const rollup = rollupHoldingBooks({
      tickers: ["XRP"],
      fills,
      sleeves: { XRP: sleeves },
      prices: { XRP: 2 },
      closes: {},
      today: "2026-10-09",
    });
    assert.equal(rollup.partial, true);
    assert.equal(rollup.rows[0]?.partial, true);
    assert.equal(rollup.rows[0]?.valueUsd, 123.2);
    assert.equal(rollup.rows[0]?.costUsd, 72.24);
    assert.equal(JSON.stringify(rollup).includes("628"), false);
  });

  it("puts markers on fill days and withholds a chart from ETN and HUBB", () => {
    const ledger = buildLotsLedger({
      fills: sold,
      ticker: "NVDA",
      sleeve: "rh-agentic",
      quantity: "5",
      livePrice: 130,
    });
    const closes = [
      { day: "2026-10-01", close: 100 },
      { day: "2026-10-02", close: 110 },
      { day: "2026-10-06", close: 120 },
      { day: "2026-10-08", close: 130 },
    ];
    const chart = buildPositionChart({
      ticker: "NVDA",
      ledger,
      closes,
      quantity: "5",
      today: "2026-10-08",
    });
    assert.equal(chart?.mode, "matched");
    assert.deepEqual(
      chart?.markers.map((marker) => `${marker.day}:${marker.side}`),
      ["2026-10-01:buy", "2026-10-02:buy", "2026-10-03:buy", "2026-10-06:sell"],
    );
    assert.equal(
      buildPositionChart({ ticker: "ETN", ledger, closes, quantity: "5", today: "2026-10-08" }),
      null,
    );
    assert.equal(
      buildPositionChart({ ticker: "HUBB", ledger, closes, quantity: "5", today: "2026-10-08" }),
      null,
    );
  });

  it("falls back to current holdings when the entry is unknown", () => {
    const ledger = buildLotsLedger({
      fills: [],
      ticker: "SUI",
      sleeve: "coinbase",
      quantity: "33.7",
      livePrice: 2,
    });
    assert.equal(ledger.status, "short");
    const closes = Array.from({ length: 5 }, (_, index) => ({
      day: `2026-10-0${index + 4}`,
      close: 2,
    }));
    const chart = buildPositionChart({
      ticker: "SUI",
      ledger,
      closes,
      quantity: "33.7",
      today: "2026-10-08",
    });
    assert.equal(chart?.mode, "holdings");
    assert.equal(chart?.caption, "at current holdings");
    assert.equal(chart?.entry, "entry unknown");
    assert.deepEqual(chart?.markers, []);
    assert.equal(chart?.points.at(-1)?.costUsd, null);
  });

  it("rolls a parent up from matched cost only and flags a partial book", () => {
    const rollup = rollupHoldingBooks({
      tickers: ["NVDA", "SUI"],
      fills: sold,
      sleeves: {
        NVDA: [{ id: "rh-agentic", quantity: "5" }],
        SUI: [{ id: "coinbase", quantity: "33.7" }],
      },
      prices: { NVDA: 130, SUI: 2 },
      closes: {
        NVDA: [
          { day: "2026-10-01", close: 100 },
          { day: "2026-10-08", close: 130 },
        ],
        SUI: [
          { day: "2026-10-07", close: 2 },
          { day: "2026-10-08", close: 2 },
        ],
      },
      today: "2026-10-08",
    });
    assert.equal(rollup.partial, true);
    assert.equal(rollup.rows.find((row) => row.ticker === "NVDA")?.costUsd, 560);
    assert.equal(rollup.rows.find((row) => row.ticker === "SUI")?.costUsd, null);
    assert.equal(rollup.rows.find((row) => row.ticker === "SUI")?.valueUsd, 67.4);
    assert.equal(rollup.costUsd, 560);
    assert.equal(rollup.valueUsd, 717.4);
    assert.equal(rollup.pnlUsd, 90);
    const text = collectText(PositionRollupView({ rollup })).join(" ");
    assert.match(text, /Total · partial/);
    assert.match(text, /entry unknown/);
    const view = PositionRollupView({ rollup });
    assert.equal(isValidElement(view), true);
    const lines = collectClass(view, "rollup-line");
    assert.equal(lines >= 2, true);
  });
});

function collectPaths(node: ReactNode, found: { className: string; d: string }[] = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectPaths(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const props = node.props as { children?: ReactNode; className?: string; d?: string };
  if (node.type === "path" && typeof props.d === "string") {
    found.push({ className: String(props.className ?? ""), d: props.d });
  }
  collectPaths(props.children, found);
  return found;
}

function collectClass(node: ReactNode, className: string, count = { n: 0 }): number {
  if (Array.isArray(node)) {
    for (const child of node) collectClass(child, className, count);
    return count.n;
  }
  if (!isValidElement(node)) return count.n;
  const props = node.props as { children?: ReactNode; className?: string };
  if (typeof props.className === "string" && props.className.split(" ").includes(className)) count.n += 1;
  collectClass(props.children, className, count);
  return count.n;
}

function collectText(node: ReactNode, found: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return found;
  if (typeof node === "string" || typeof node === "number") {
    found.push(String(node));
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  collectText((node.props as { children?: ReactNode }).children, found);
  return found;
}

describe("position chart geometry", () => {
  it("closes the area on the bottom edge and lists the open lots", () => {
    const ledger = buildLotsLedger({
      fills: sold,
      ticker: "NVDA",
      sleeve: "rh-agentic",
      quantity: "5",
      livePrice: 130,
    });
    const chart = buildPositionChart({
      ticker: "NVDA",
      ledger,
      closes: [
        { day: "2026-10-01", close: 100 },
        { day: "2026-10-08", close: 130 },
      ],
      quantity: "5",
      today: "2026-10-08",
    });
    assert.ok(chart);
    const paths = collectPaths(PositionChartView({ chart, totals: bookTotals(ledger, 130, "5") }));
    const area = paths.find((path) => path.className.includes("position-area"));
    const line = paths.find((path) => path.className.includes("position-value"));
    assert.ok(area);
    assert.ok(line);
    assert.equal(line.d.includes("Z"), false);
    assert.match(area.d, /L[0-9.]+ 168\.00 L[0-9.]+ 168\.00 Z$/);
    const text = collectText(
      LotsTable({
        ledger,
        totals: bookTotals(ledger, 130, "5"),
        liveLabel: null,
        vaultLine: vaultUnknownLine("28281"),
      }),
    ).join(" ");
    assert.match(text, /1 of 2/);
    assert.match(text, /Flare \/ Xaman vault/);
    assert.equal(text.includes("fills don't match holdings"), false);
  });
});
