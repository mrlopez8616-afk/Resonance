import assert from "node:assert/strict";
import { isValidElement, type ReactNode } from "react";
import { describe, it } from "node:test";
import { ChildValueCard } from "@/components/child-value-card";
import type { CalendarEvent } from "@/data/calendar";
import { AI_STOCK_ROLES, aiStockRole } from "@/data/ai-stock-roles";
import { AI_STOCK_TICKERS } from "@/lib/ai-stocks";
import { assembleLiveFace } from "@/lib/live-face";
import { formatCompactUsd } from "@/lib/live-face";
import { HOME_QUOTE_MAX_AGE_MS, nextTickerCatalystLine } from "@/lib/home-lines";
import { positionCostFromFills } from "@/lib/position-cost";
import { holdingChildModel, positionLines, priceSpark } from "./child-card";

const NOW = new Date("2026-10-08T15:00:00.000Z");
const FRESH = new Date(NOW.getTime() - 30_000).toISOString();
const QUOTE = { usd: 2, source: "test", fetchedAt: FRESH };

function countTag(node: ReactNode, tag: string): number {
  if (Array.isArray(node)) return node.reduce((sum, child) => sum + countTag(child, tag), 0);
  if (!isValidElement(node)) return 0;
  const props = node.props as { children?: ReactNode };
  return (node.type === tag ? 1 : 0) + countTag(props.children, tag);
}

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
  if (isValidElement(node)) collectText((node.props as { children?: ReactNode }).children, found);
  return found;
}

function catalyst(
  partial: Partial<CalendarEvent> & Pick<CalendarEvent, "id" | "start" | "title">,
): CalendarEvent {
  return {
    kind: "catalyst",
    node: "NVDA",
    status: "confirmed",
    writer: "agent",
    ...partial,
  };
}

describe("child value card", () => {
  it("puts the position value on top and the live price under it", () => {
    const face = assembleLiveFace(
      "SUI",
      [{ id: "coinbase", label: "Coinbase", quantity: "10", source: "coinbase-config", manual: false }],
      QUOTE,
    );
    const model = holdingChildModel({
      face,
      changePct: 1.24,
      fetchedAt: FRESH,
      now: NOW,
      catalyst: "SUI · 20 Oct",
      history: [1.5, 1.8, 2],
    });
    assert.equal(face.totalUsd, 20);
    assert.equal(model.headline, face.totalUsdLabel);
    assert.equal(model.priceLine, "$2.000 live");
    assert.equal(model.label, null);
    assert.equal(model.lines[0]?.text, "+1.2%");
    assert.equal(model.lines[0]?.tone, "up");
    assert.equal(model.lines[1]?.text, "SUI · 20 Oct");
    assert.equal(model.spark?.tone, "up");
    assert.ok((model.spark?.prices.length ?? 0) >= 2);
  });

  it("shows the live price and no position, and never a zero headline", () => {
    const empty = holdingChildModel({
      face: assembleLiveFace("SUI", [], QUOTE),
      changePct: null,
      fetchedAt: null,
      now: NOW,
      catalyst: null,
      history: null,
    });
    assert.equal(empty.headline, null);
    assert.equal(empty.priceLine, "$2.000 live");
    assert.equal(empty.label, "no position");
    assert.deepEqual(empty.lines, []);
    assert.equal(empty.spark, null);

    const zero = holdingChildModel({
      face: assembleLiveFace(
        "SUI",
        [{ id: "book", label: "Book", quantity: "0", source: "robinhood-config", manual: false }],
        QUOTE,
      ),
      now: NOW,
      history: [2],
    });
    assert.equal(zero.headline, null);
    assert.equal(zero.label, "no position");
    assert.equal(JSON.stringify(zero).includes("$0"), false);
    assert.equal(zero.spark, null);
  });

  it("hides the day line, the catalyst, and the chart when that data is missing", () => {
    const face = assembleLiveFace(
      "SUI",
      [{ id: "coinbase", label: "Coinbase", quantity: "4", source: "coinbase-config", manual: false }],
      QUOTE,
    );
    const model = holdingChildModel({
      face,
      changePct: -4,
      fetchedAt: new Date(NOW.getTime() - HOME_QUOTE_MAX_AGE_MS - 5).toISOString(),
      now: NOW,
      catalyst: "  ",
      history: null,
    });
    assert.equal(model.headline, face.totalUsdLabel);
    assert.deepEqual(model.lines, []);
    assert.deepEqual(model.footerLines, []);
    assert.equal(model.spark, null);
    assert.equal(priceSpark([1.2]), null);
    assert.equal(priceSpark([]), null);
    const view = ChildValueCard({ model });
    assert.equal(countTag(view, "svg"), 0);
    const text = collectText(view).join(" ");
    assert.equal(text.includes("%"), false);
    assert.equal(text.includes("Oct"), false);
  });

  it("keeps the XRP headline as the sum and lists the vault separately as manual", () => {
    const face = assembleLiveFace(
      "XRP",
      [
        { id: "rh-agentic", label: "RH Agentic", quantity: "10", source: "robinhood-config", manual: false },
        { id: "flare-vault", label: "Flare vault", quantity: "5", source: "manual", manual: true },
      ],
      QUOTE,
    );
    assert.equal(face.totalUsd, 30);
    const model = holdingChildModel({
      face,
      changePct: -1.5,
      fetchedAt: FRESH,
      now: NOW,
      catalyst: null,
      history: [2.2, 2],
      treasury: true,
    });
    assert.equal(model.headline, face.totalUsdLabel);
    assert.equal(model.headline, formatCompactUsd(30));
    const agentic = model.lines.find((line) => line.text.startsWith("Agentic"));
    const vault = model.lines.find((line) => line.text.includes("manual"));
    assert.ok(agentic);
    assert.ok(vault);
    assert.equal(agentic?.text.includes("manual"), false);
    assert.equal(
      agentic?.text,
      `Agentic ${face.sleeves[0]?.quantityLabel} · ${formatCompactUsd(20)}`,
    );
    assert.equal(
      vault?.text,
      `Flare / Xaman vault ${face.sleeves[1]?.quantityLabel} · ${formatCompactUsd(10)} · manual`,
    );
    assert.notEqual(agentic?.text, vault?.text);
    const view = ChildValueCard({ model });
    const text = collectText(view);
    assert.equal(text.filter((line) => line.includes("manual")).length, 1);
    assert.equal(text.some((line) => line.startsWith("Agentic")), true);
    assert.equal(countTag(view, "svg"), 1);
    assert.equal(model.spark?.tone, "down");
  });

  it("fills the spark area down to the chart bottom, not across the endpoints", () => {
    const face = assembleLiveFace(
      "VRT",
      [{ id: "rh-agentic", label: "RH Agentic", quantity: "2", source: "robinhood-config", manual: false }],
      QUOTE,
    );
    const model = holdingChildModel({
      face,
      changePct: 1,
      fetchedAt: FRESH,
      now: NOW,
      history: [2.2, 2.4, 2],
    });
    assert.equal(model.spark?.tone, "down");
    const card = collectPaths(ChildValueCard({ model }));
    const page = collectPaths(ChildValueCard({ model, wide: true }));
    for (const [paths, height, lastX] of [
      [card, "44.00", "165.00"],
      [page, "64.00", "317.00"],
    ] as const) {
      const area = paths.find((path) => path.className.includes("price-spark-area"));
      const line = paths.find((path) => path.className.split(" ").includes("price-spark"));
      assert.ok(area);
      assert.ok(line);
      assert.equal(line.d.includes("Z"), false);
      assert.equal(line.d.includes(` ${height}`), false);
      assert.equal(area.className.includes("is-down"), true);
      assert.match(area.d, new RegExp(`L${lastX} ${height} L3\\.00 ${height} Z$`));
      const seriesEnd = line.d.slice(line.d.lastIndexOf("L"));
      assert.equal(seriesEnd.includes(height), false);
      assert.equal(area.d.startsWith(line.d), true);
    }
    assert.equal(countTag(ChildValueCard({ model: { ...model, spark: null } }), "svg"), 0);
  });
});

describe("AI stock glance", () => {
  it("hides cost and P/L unless the fills explain the sleeve quantity", () => {
    const fills = [
      {
        time: "2026-10-01T15:00:00Z",
        symbol: "NVDA",
        side: "buy" as const,
        quantity: "2",
        price: "100",
        sleeve: "rh-agentic",
        result: "filled",
      },
      {
        time: "2026-10-02T15:00:00Z",
        symbol: "NVDA",
        side: "buy" as const,
        quantity: "2",
        price: "120",
        sleeve: "rh-agentic",
        result: "filled",
      },
    ];
    const explained = positionCostFromFills({ fills, ticker: "NVDA", quantity: "4", priceUsd: 121 });
    assert.equal(explained?.averageLabel, "cost $110.00");
    assert.deepEqual(explained?.pnl, { text: "P/L +10.0%", tone: "up" });
    assert.equal(
      positionCostFromFills({ fills, ticker: "NVDA", quantity: "4", priceUsd: 99 })?.pnl?.text,
      "P/L -10.0%",
    );

    const sold = positionCostFromFills({
      fills: [
        ...fills,
        {
          time: "2026-10-03T15:00:00Z",
          symbol: "NVDA",
          side: "sell" as const,
          quantity: "1",
          price: "130",
          sleeve: "rh-agentic",
          result: "filled",
        },
      ],
      ticker: "NVDA",
      quantity: "3",
      priceUsd: 132,
    });
    assert.equal(sold?.averageLabel, "cost $113.33");
    assert.equal(sold?.pnl?.text, "P/L +16.5%");

    assert.equal(positionCostFromFills({ fills, ticker: "NVDA", quantity: "5", priceUsd: 121 }), null);
    assert.equal(
      positionCostFromFills({
        fills: [{ ...fills[0], sleeve: undefined, quantity: "4" }],
        ticker: "NVDA",
        quantity: "4",
        priceUsd: 121,
      }),
      null,
    );
    const sharesOnly = positionLines("4", null);
    assert.deepEqual(sharesOnly, [{ text: "4.000 shares" }]);
    assert.equal(sharesOnly.some((line) => /cost|P\/L/i.test(line.text)), false);
  });

  it("has a role line for each of the eight and hides a catalyst when none is upcoming", () => {
    for (const ticker of AI_STOCK_TICKERS) {
      const role = aiStockRole(ticker);
      assert.equal(role, AI_STOCK_ROLES[ticker]);
      assert.equal(typeof role, "string");
      assert.ok((role ?? "").length > 20);
    }
    assert.equal(aiStockRole("ETN"), null);
    assert.equal(aiStockRole("HUBB"), null);
    assert.equal(nextTickerCatalystLine([], "NVDA", NOW), null);
    assert.equal(
      nextTickerCatalystLine(
        [catalyst({ id: "past", start: "2026-09-01T00:00:00-05:00", title: "Old Nvidia earnings", node: "NVDA" })],
        "NVDA",
        NOW,
      ),
      null,
    );
    assert.equal(
      nextTickerCatalystLine(
        [catalyst({ id: "vrt", start: "2026-10-21T00:00:00-05:00", title: "Vertiv earnings", node: "VRT" })],
        "NVDA",
        NOW,
      ),
      null,
    );
    assert.equal(
      nextTickerCatalystLine(
        [catalyst({ id: "nvda", start: "2026-10-21T00:00:00-05:00", title: "Nvidia earnings", node: "NVDA" })],
        "NVDA",
        NOW,
      ),
      "NVDA earnings · 21 Oct",
    );
    assert.equal(
      nextTickerCatalystLine(
        [
          catalyst({ id: "xrp", start: "2026-10-11T00:00:00-05:00", title: "XRP day", node: "XRP" }),
          {
            id: "generic",
            lane: "capital",
            start: "2026-10-15T00:00:00-05:00",
            title: "Crypto summit",
            status: "scheduled",
            writer: "agent",
          },
        ],
        "SUI",
        NOW,
      ),
      null,
    );
  });
});
