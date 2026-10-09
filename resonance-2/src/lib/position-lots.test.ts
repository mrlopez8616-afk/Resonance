import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isValidElement, type ReactNode } from "react";
import { describe, it } from "node:test";
import { PositionBook, PositionChartView, LotsTable, PositionRollupView } from "@/components/position-book";
import { formatTotalUnits, totalSleeveQuantity } from "@/lib/live-face";
import { bookTotals, positionBookTotals } from "./position-lots";
import {
  assembleNodePosition,
  buildLotsLedger,
  buildPositionChart,
  cbAgenticLotLines,
  coinbaseAgenticUnknownLine,
  displayLotBooks,
  rollupHoldingBooks,
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
    const totals = positionBookTotals({
      ledger: position.ledger,
      livePrice: 2,
      sleeveShares: position.quantity,
      unknownShares: position.unknownShares,
      vaultShares: position.vaultShares,
    });
    assert.equal(totals.partial, true);
    assert.equal(totals.partialLabel, "partial");
    assert.equal(totals.presentation, "known");
    assert.equal(totals.costUsd, 72.24);
    assert.equal(position.unknownShares, "10");
    const text = collectText(
      LotsTable({
        ledger: position.ledger,
        totals,
        liveLabel: null,
        vaultLine: position.vaultLine,
        unknownHolding: { name: "Coinbase Agentic", shares: "10", valueLabel: "$20.00" },
      }),
    ).join(" ");
    assert.match(text, /Coinbase Agentic · entry unknown/);
    assert.match(text, /10 shares/);
    assert.match(text, /\$20\.00/);
    assert.match(text, /Total · partial/);
    assert.match(text, /cost\s+\$72\.24/);
    assert.equal(text.includes("$0.00"), false);
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
    assert.equal(rollup.rows[0]?.valueUsd, 56685.2);
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
    assert.equal(chart?.caption, "Value at current holdings · entry unknown");
    assert.equal(chart?.entry, null);
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
    assert.equal(text.includes("$0.00"), false);
  });

  it("prints an all-unknown total as shares and value, with one chart caption", () => {
    const sleeves = [
      { id: "rh-agentic", quantity: "492.828" },
      { id: "cb-agentic", quantity: "10" },
      { id: "flare-vault", quantity: "28281" },
    ];
    const closes = [
      { day: "2026-10-07", close: 1.39 },
      { day: "2026-10-08", close: 1.39 },
    ];
    const position = assembleNodePosition({
      fills: [],
      ticker: "XRP",
      sleeves,
      priceUsd: 1.39,
      closes,
      today: "2026-10-08",
      vaultQuantity: "28281",
    });
    assert.ok(position);
    assert.equal(position.ledger.costUsd, null);
    const book = PositionBook({
      ledger: position.ledger,
      chart: position.chart,
      quantity: position.quantity,
      livePrice: 1.39,
      vaultLine: position.vaultLine,
      unknownShares: position.unknownShares,
      vaultShares: position.vaultShares,
    });
    const text = collectText(book).join(" ");
    assert.match(text, /Total · partial · 28,783\.828 · ~\$40\.0k · entry unknown/);
    assert.match(text, /Coinbase Agentic · entry unknown/);
    assert.match(text, /10 shares/);
    assert.match(text, /492\.828\s+shares/);
    assert.match(text, /Flare \/ Xaman vault · manual · entry unknown/);
    assert.equal(text.includes("$0.00"), false);
    assert.equal(text.includes("Total · partial 0"), false);
    const caption = "Value at current holdings · entry unknown";
    assert.equal(text.split(caption).length - 1, 1);
    assert.equal(collectClass(book, "position-caption"), 1);

    const stock = assembleNodePosition({
      fills: [],
      ticker: "NVDA",
      sleeves: [{ id: "rh-agentic", quantity: "4" }],
      priceUsd: 10,
      closes,
      today: "2026-10-08",
    });
    assert.ok(stock);
    const stockText = collectText(
      PositionBook({
        ledger: stock.ledger,
        chart: stock.chart,
        quantity: stock.quantity,
        livePrice: 10,
        vaultLine: null,
      }),
    ).join(" ");
    assert.match(stockText, /Total · partial · 4\.000 · ~\$40\.00 · entry unknown/);
    assert.equal(stockText.includes("$0.00"), false);
    assert.equal(stockText.split(caption).length - 1, 1);

    const sui = buildLotsLedger({
      fills: [
        fill({
          time: "2026-09-18T17:49:23Z",
          symbol: "SUI",
          side: "buy",
          quantity: "16.8",
          price: "0.8020710385",
          sleeve: "coinbase",
        }),
        fill({
          time: "2026-09-18T17:51:58Z",
          symbol: "SUI",
          side: "buy",
          quantity: "16.9",
          price: "0.8019",
          sleeve: "coinbase",
        }),
      ],
      ticker: "SUI",
      sleeve: "coinbase",
      quantity: "33.7",
      livePrice: 1.058,
    });
    const suiText = collectText(
      PositionBook({
        ledger: sui,
        chart: null,
        quantity: "33.7",
        livePrice: 1.058,
        vaultLine: null,
      }),
    ).join(" ");
    assert.match(suiText, /cost\s+\$/);
    assert.equal(suiText.includes("$0.00"), false);
    assert.equal(suiText.includes("Total · partial"), false);

    const unknownRollup = rollupHoldingBooks({
      tickers: ["SUI", "NVDA"],
      fills: [],
      sleeves: {
        SUI: [{ id: "coinbase", quantity: "33.7" }],
        NVDA: [{ id: "rh-agentic", quantity: "4" }],
      },
      prices: { SUI: 2, NVDA: 10 },
      closes: {
        SUI: closes,
        NVDA: closes,
      },
      today: "2026-10-08",
    });
    assert.equal(unknownRollup.costUsd, null);
    assert.equal(unknownRollup.pnlUsd, null);
    const rollupText = collectText(PositionRollupView({ rollup: unknownRollup })).join(" ");
    assert.match(rollupText, /Total · partial/);
    assert.match(rollupText, /entry unknown/);
    assert.equal(rollupText.includes("$0.00"), false);
    assert.equal(collectClass(PositionRollupView({ rollup: unknownRollup }), "position-caption"), 1);
  });

  it("reduces the XRP transfer lot without a cost and costs the SUI buy", () => {
    const xrp = cbAgenticLotLines({
      ticker: "XRP",
      quantity: "9",
      livePrice: 1.3896,
      fills: [
        {
          time: "2026-10-09T15:21:28-05:00",
          symbol: "XRP",
          side: "sell",
          quantity: "1",
          price: "1.3896",
          sleeve: "cb-agentic",
          result: "filled",
        },
      ],
    });
    assert.equal(xrp.length, 1);
    assert.equal(xrp[0]?.secondary, "entry unknown · 9 of 10");
    assert.equal(xrp[0]?.pnlUsd, null);
    assert.equal(xrp[0]?.pnlPct, null);
    const sui = cbAgenticLotLines({
      ticker: "SUI",
      quantity: "1.2",
      livePrice: 1.2,
      fills: [
        {
          time: "2026-10-09T15:21:33-05:00",
          symbol: "SUI",
          side: "buy",
          quantity: "1.2",
          price: "1.0601340274",
          sleeve: "cb-agentic",
          result: "filled",
        },
      ],
    });
    assert.equal(sui.length, 1);
    assert.match(sui[0]?.secondary ?? "", /1\.2 @ \$1\.06/);
    assert.notEqual(sui[0]?.pnlUsd, null);
    const text = collectText(
      LotsTable({
        ledger: buildLotsLedger({
          fills: [],
          ticker: "XRP",
          sleeve: "rh-agentic",
          quantity: "51.601",
          livePrice: 1.3896,
        }),
        totals: positionBookTotals({
          ledger: buildLotsLedger({
            fills: [],
            ticker: "XRP",
            sleeve: "rh-agentic",
            quantity: "51.601",
            livePrice: 1.3896,
          }),
          livePrice: 1.3896,
          sleeveShares: "51.601",
          unknownShares: "9",
          vaultShares: "28281",
        }),
        liveLabel: null,
        vaultLine: "Flare / Xaman vault · manual · entry unknown",
        agenticLines: xrp,
      }),
    ).join(" ");
    assert.match(text, /entry unknown · 9 of 10/);
    assert.equal(text.includes("$0.00"), false);
  });

  it("counts every sleeve in the total so the shares match the header", () => {
    const suiSleeves = [
      { id: "rh-agentic", quantity: "0" },
      { id: "coinbase", quantity: "33.7" },
      { id: "cb-agentic", quantity: "1.2" },
    ];
    const suiFills: LedgerFill[] = [
      fill({
        time: "2026-09-18T17:49:23Z",
        symbol: "SUI",
        side: "buy",
        quantity: "16.8",
        price: "0.8020710385",
        sleeve: "coinbase",
      }),
      fill({
        time: "2026-09-18T17:51:58Z",
        symbol: "SUI",
        side: "buy",
        quantity: "16.9",
        price: "0.8019",
        sleeve: "coinbase",
      }),
      fill({
        time: "2026-10-09T20:21:33Z",
        symbol: "SUI",
        side: "buy",
        quantity: "1.2",
        price: "1.0601340274",
        sleeve: "cb-agentic",
      }),
    ];
    const sui = assembleNodePosition({
      fills: suiFills,
      ticker: "SUI",
      sleeves: suiSleeves,
      priceUsd: 1.058,
      closes: [],
      today: "2026-10-09",
    });
    assert.ok(sui);
    const suiHeader = formatTotalUnits(totalSleeveQuantity(suiSleeves));
    assert.equal(suiHeader, "34.900");
    assert.equal(formatTotalUnits(sui.holdingUnits), suiHeader);
    const suiText = collectText(
      PositionBook({
        ledger: sui.ledger,
        chart: null,
        quantity: sui.quantity,
        livePrice: 1.058,
        vaultLine: sui.vaultLine,
        unknownShares: sui.unknownShares,
        vaultShares: sui.vaultShares,
        agenticLines: sui.agenticLines,
        books: displayLotBooks(sui.books, sui.agenticLines.length > 0),
        holdingUnits: sui.holdingUnits,
        addedCostUsd: sui.addedCostUsd,
        unexplained: sui.unexplained,
      }),
    ).join(" ");
    assert.match(suiText, /34\.900/);
    assert.match(suiText, /16\.8/);
    assert.match(suiText, /16\.9/);
    assert.match(suiText, /Coinbase Agentic/);
    assert.match(suiText, /1\.2 @/);
    assert.equal(suiText.includes("Total · partial"), false);

    const xrpSleeves = [
      { id: "rh-agentic", quantity: "51.601" },
      { id: "cb-agentic", quantity: "10" },
      { id: "flare-vault", quantity: "28281" },
    ];
    const xrp = assembleNodePosition({
      fills: [
        fill({
          time: "2026-09-01T15:00:00Z",
          symbol: "XRP",
          side: "buy",
          quantity: "51.601",
          price: "1.40",
          sleeve: "rh-agentic",
        }),
      ],
      ticker: "XRP",
      sleeves: xrpSleeves,
      priceUsd: 1.4,
      closes: [],
      today: "2026-10-09",
      vaultQuantity: "28281",
    });
    assert.ok(xrp);
    const xrpHeader = formatTotalUnits(totalSleeveQuantity(xrpSleeves));
    assert.equal(xrpHeader, "28,342.601");
    assert.equal(formatTotalUnits(xrp.holdingUnits), xrpHeader);
    const xrpText = collectText(
      PositionBook({
        ledger: xrp.ledger,
        chart: null,
        quantity: xrp.quantity,
        livePrice: 1.4,
        vaultLine: xrp.vaultLine,
        unknownShares: xrp.unknownShares,
        vaultShares: xrp.vaultShares,
        agenticLines: xrp.agenticLines,
        books: displayLotBooks(xrp.books, xrp.agenticLines.length > 0),
        holdingUnits: xrp.holdingUnits,
        addedCostUsd: xrp.addedCostUsd,
        unexplained: xrp.unexplained,
      }),
    ).join(" ");
    assert.match(xrpText, /28,342\.601/);
    assert.match(xrpText, /RH Agentic/);
    assert.match(xrpText, /Coinbase Agentic/);
    assert.match(xrpText, /Flare \/ Xaman vault · manual · entry unknown/);
    assert.match(xrpText, /Total · partial/);
    const suiRollup = rollupHoldingBooks({
      tickers: ["SUI"],
      fills: suiFills,
      sleeves: { SUI: suiSleeves },
      prices: { SUI: 2 },
      closes: {},
      today: "2026-10-09",
    });
    assert.equal(suiRollup.partial, false);
    assert.equal(suiRollup.rows[0]?.valueUsd, 69.8);
    assert.equal(suiRollup.rows[0]?.partial, false);
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
  if (typeof node.type === "function") {
    collectClass((node.type as (props: unknown) => ReactNode)(node.props), className, count);
    return count.n;
  }
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
  const type = node.type;
  if (typeof type === "function") {
    collectText((type as (props: unknown) => ReactNode)(node.props), found);
    return found;
  }
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

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function fixtureJson(name: string): { fills?: LedgerFill[]; sleeves?: { id: string; quantity: string }[] } {
  return JSON.parse(readFileSync(path.join(fixtureDir, name), "utf8"));
}

describe("SUI portfolio transfer lots", () => {
  const liveFills = fixtureJson("fills-before.json").fills ?? [];
  const suiBefore = fixtureJson("sui-sleeves-before.json").sleeves ?? [];
  const xrpSleeves = fixtureJson("xrp-sleeves-before.json").sleeves ?? [];
  const transfer: LedgerFill = {
    kind: "transfer",
    time: "2026-10-09T16:59:00-05:00",
    symbol: "SUI",
    quantity: "1.2",
    fromSleeve: "cb-agentic",
    toSleeve: "coinbase",
    result: "filled",
  };
  const suiAfter = [
    { id: "rh-agentic", quantity: "0" },
    { id: "coinbase", quantity: "34.9" },
    { id: "cb-agentic", quantity: "0" },
  ];

  function positioned(
    ticker: string,
    fills: readonly LedgerFill[],
    sleeves: readonly { id: string; quantity: string }[],
  ) {
    const position = assembleNodePosition({
      fills,
      ticker,
      sleeves,
      priceUsd: null,
      closes: [],
      today: "2026-10-09",
    });
    assert.ok(position);
    const totals = positionBookTotals({
      ledger: position.ledger,
      livePrice: null,
      sleeveShares: position.quantity,
      unknownShares: position.unknownShares,
      vaultShares: position.vaultShares,
      holdingUnits: position.holdingUnits,
      addedCostUsd: position.addedCostUsd,
      unexplained: position.unexplained,
    });
    return { position, totals };
  }

  it("keeps the 1.2 lot's date and cost on coinbase with no realized P/L", () => {
    const before = positioned("SUI", liveFills, suiBefore);
    const after = positioned("SUI", [...liveFills, transfer], suiAfter);
    assert.equal(before.totals.costUsd, 28.3);
    assert.equal(after.totals.costUsd, 28.3);
    assert.equal(after.position.holdingUnits, 34.9);
    assert.equal(after.totals.partial, false);
    assert.deepEqual(after.position.agenticLines, []);
    const coinbase = after.position.books.find((book) => book.id === "coinbase");
    assert.ok(coinbase);
    assert.equal(coinbase.ledger.status, "matched");
    assert.equal(coinbase.quantity, "34.9");
    assert.equal(coinbase.ledger.openShares, "34.9");
    assert.equal(coinbase.ledger.costUsd, 28.3);
    const realized = coinbase.ledger.closedLots.reduce((sum, lot) => sum + lot.realizedPnlUsd, 0);
    assert.equal(realized, 0);
    assert.deepEqual(coinbase.ledger.closedLots, []);
    assert.deepEqual(
      coinbase.ledger.openLots.map((lot) => `${lot.sharesLabel} @ ${lot.price}`),
      ["1.2 @ 1.0601340274", "16.9 @ 0.8019", "16.8 @ 0.8020710385"],
    );
    assert.equal(
      after.position.books.some((book) => book.id === "cb-agentic"),
      false,
    );
  });

  it("sells the September lots before the transferred October lot", () => {
    const sold = buildLotsLedger({
      fills: [
        ...liveFills,
        transfer,
        {
          time: "2026-10-09T18:00:00-05:00",
          symbol: "SUI",
          side: "sell",
          quantity: "16.8",
          price: "1",
          sleeve: "coinbase",
          result: "filled",
        },
      ],
      ticker: "SUI",
      sleeve: "coinbase",
      quantity: "18.1",
    });
    assert.equal(sold.status, "matched");
    assert.equal(sold.closedLots[0]?.price, "0.8020710385");
    assert.equal(sold.closedLots[0]?.originalQty, "16.8");
    assert.deepEqual(
      sold.openLots.map((lot) => lot.price),
      ["1.0601340274", "0.8019"],
    );
  });

  it("mismatches a transfer the source lots cannot cover", () => {
    const ledger = buildLotsLedger({
      fills: [
        {
          time: "2026-10-09T15:21:33-05:00",
          symbol: "SUI",
          side: "buy",
          quantity: "1.2",
          price: "1.0601340274",
          sleeve: "cb-agentic",
          result: "filled",
        },
        {
          kind: "transfer",
          time: "2026-10-09T16:59:00-05:00",
          symbol: "SUI",
          quantity: "2",
          fromSleeve: "cb-agentic",
          toSleeve: "coinbase",
          result: "filled",
        },
      ],
      ticker: "SUI",
      sleeve: "coinbase",
      quantity: "2",
    });
    assert.equal(ledger.status, "over");
    assert.equal(ledger.note, "fills don't match holdings");
  });

  it("leaves the XRP position identical to the pre-transfer book", () => {
    const before = positioned("XRP", liveFills, xrpSleeves);
    const after = positioned("XRP", [...liveFills, transfer], xrpSleeves);
    assert.deepEqual(after, before);
    const digest = createHash("sha256")
      .update(JSON.stringify({ position: before.position, totals: before.totals }))
      .digest("hex");
    assert.equal(digest, "c7b22ee138811c17f5fee0a067c4a840fd9e37faa31bbe3540fe1eb774775692");
  });
});
