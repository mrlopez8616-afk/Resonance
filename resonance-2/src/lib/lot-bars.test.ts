import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isValidElement, type ReactNode } from "react";
import { LotBarChart } from "@/components/lot-bar-chart";
import {
  barsFromClosedLots,
  barsFromOpenLots,
  barsFromRollup,
  lotBarPopoverLines,
  lotBarValueLabel,
  lotDateLabel,
  publicBarsForBook,
  publicBarsForRollup,
  publicLotChartModel,
  unknownEntryCaption,
  type ClosedLotBarInput,
  type OpenLotBarInput,
} from "@/lib/lot-bars";
import type { RollupRow } from "@/lib/position-lots";

function lot(partial: Partial<OpenLotBarInput> & Pick<OpenLotBarInput, "time" | "day">): OpenLotBarInput {
  return {
    remainingQty: "2",
    originalQty: "2",
    price: "1",
    entryUsd: 1,
    valueUsd: 3,
    pnlUsd: 2,
    pnlPct: 100,
    ...partial,
  };
}

function row(partial: Partial<RollupRow> & Pick<RollupRow, "ticker">): RollupRow {
  return {
    costUsd: 10,
    valueUsd: 12,
    pnlUsd: 2,
    pnlPct: 20,
    partial: false,
    ...partial,
  };
}

function classNameOf(node: ReactNode): string {
  if (!isValidElement(node)) return "";
  const props = node.props as { className?: string };
  return props.className ?? "";
}

function styleOf(node: ReactNode): { top?: number; maxWidth?: number; minWidth?: string } {
  if (!isValidElement(node)) return {};
  const props = node.props as { style?: { top?: number; maxWidth?: number; minWidth?: string } };
  return props.style ?? {};
}

function elementChildren(node: ReactNode): ReactNode[] {
  if (!isValidElement(node)) return [];
  const props = node.props as { children?: ReactNode };
  const children = props.children;
  if (children == null) return [];
  return Array.isArray(children) ? children : [children];
}

/** Dates sit in a row after the plot, and a value label stays out of that row. */
function assertDateRowBelowPlot(node: ReactNode) {
  const cols = findByClass(node, "lot-bars-cols");
  assert.ok(cols);
  assert.match(styleOf(cols).minWidth ?? "", /^max\(100%, \d+px\)$/);
  const columns = elementChildren(cols).filter((child) => classNameOf(child).includes("lot-bar-col"));
  assert.ok(columns.length >= 2);
  for (const column of columns) {
    const kids = elementChildren(column);
    const plotAt = kids.findIndex((child) => classNameOf(child).includes("lot-bar-plot"));
    const dateAt = kids.findIndex((child) => classNameOf(child).includes("lot-bar-date"));
    assert.ok(plotAt >= 0);
    assert.ok(dateAt > plotAt);
    const plot = kids[plotAt];
    assert.equal(findByClass(plot!, "lot-bar-date"), null);
    const fill = findByClass(plot!, "lot-bar-fill");
    const value = findByClass(plot!, "lot-bar-value");
    assert.ok(fill);
    assert.equal(styleOf(fill).maxWidth, 48);
    assert.ok(value);
    const tone = classNameOf(column);
    const barTop = styleOf(fill).top ?? 0;
    const labelTop = styleOf(value).top ?? 0;
    if (tone.includes("is-up")) assert.ok(labelTop < barTop);
    if (tone.includes("is-down")) {
      const height = (fill && isValidElement(fill) ? (fill.props as { style?: { height?: number } }).style?.height : 0) ?? 0;
      const labelBottom = labelTop + 13;
      assert.ok(labelBottom < 140);
      if (height >= 15) assert.ok(labelTop >= barTop);
    }
  }
}

function findByClass(node: ReactNode, className: string): ReactNode | null {
  if (node == null || typeof node === "boolean") return null;
  if (typeof node === "string" || typeof node === "number") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByClass(child, className);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (classNameOf(node).split(" ").includes(className)) return node;
  const type = node.type;
  if (typeof type === "function") {
    return findByClass((type as (props: unknown) => ReactNode)(node.props), className);
  }
  return findByClass((node.props as { children?: ReactNode }).children, className);
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
  const props = node.props as {
    children?: ReactNode;
    className?: string;
    "data-tone"?: string;
    "data-partial"?: string;
    "data-sold"?: string;
    "data-first"?: string;
    "data-badge"?: string;
  };
  if (props["data-tone"]) found.push(`tone ${props["data-tone"]}`);
  if (props["data-partial"]) found.push(`partial ${props["data-partial"]}`);
  if (props["data-sold"]) found.push(`sold ${props["data-sold"]}`);
  if (props["data-first"]) found.push(`first ${props["data-first"]}`);
  if (props["data-badge"]) found.push(`badge ${props["data-badge"]}`);
  collectText(props.children, found);
  return found;
}

describe("lot bars", () => {
  it("orders buys by date and maps sign, color, and a partial flag", () => {
    const bars = barsFromOpenLots(
      [
        lot({ time: "2026-10-09T16:00:00-05:00", day: "2026-10-09", pnlUsd: -4, pnlPct: -10, remainingQty: "1.2", originalQty: "2" }),
        lot({ time: "2026-09-18T12:00:00-05:00", day: "2026-09-18", pnlUsd: 6, pnlPct: 12 }),
      ],
      false,
    );
    assert.deepEqual(bars.map((bar) => bar.axisLabel), ["Sep 18", "Oct 9"]);
    assert.deepEqual(bars.map((bar) => bar.day), ["2026-09-18", "2026-10-09"]);
    assert.equal(bars[0]?.tone, "up");
    assert.equal(bars[0]?.magnitude, 6);
    assert.equal(bars[1]?.tone, "down");
    assert.equal(bars[1]?.magnitude, -4);
    assert.equal(bars[1]?.partial, true);
    assert.equal(bars[0]?.partial, false);
    assert.equal(bars[0]?.first, true);
    assert.equal(bars[0]?.sequence, 1);
    assert.equal(bars[1]?.sequence, 2);
    assert.equal(bars[1]?.sold, false);
    assert.equal(lotDateLabel("2026-09-18"), "Sep 18");
    const text = collectText(LotBarChart({ model: { bars, caption: null }, label: "lots" })).join(" ");
    assert.match(text, /tone up/);
    assert.match(text, /tone down/);
    assert.match(text, /partial true/);
    assert.match(text, /badge First buy/);
    assert.match(text, /badge #2/);
    assert.match(text, /Sep 18/);
    assert.match(text, /Oct 9/);
    assert.match(text, /First buy/);
    assert.match(text, /\+\$6\.00/);
    assert.match(text, /−\$4\.00/);
    assert.equal(lotBarValueLabel(bars[0]!, false), "+$6.00");
    assert.equal(lotBarValueLabel(bars[1]!, false), "−$4.00");
    assertDateRowBelowPlot(LotBarChart({ model: { bars, caption: null }, label: "lots" }));
  });

  it("leaves unknown entries and closed-uncomputable lots off the chart", () => {
    const bars = barsFromOpenLots(
      [
        lot({ time: "2026-09-18T12:00:00-05:00", day: "2026-09-18", entryUsd: Number.NaN, pnlUsd: null, pnlPct: null }),
        lot({ time: "2026-09-19T12:00:00-05:00", day: "2026-09-19", pnlUsd: null, pnlPct: null }),
        lot({ time: "2026-10-01T12:00:00-05:00", day: "2026-10-01", pnlUsd: 1, pnlPct: 1 }),
      ],
      false,
    );
    assert.deepEqual(bars.map((bar) => bar.day), ["2026-10-01"]);
    assert.equal(unknownEntryCaption("XRP", ["9", "0", null, "28287"]), "9 XRP entry unknown, not charted · 28287 XRP entry unknown, not charted");
    assert.equal(unknownEntryCaption("XRP", []), null);
  });

  it("draws one parent bar per child and skips a book with no gain", () => {
    const model = barsFromRollup(
      [
        row({ ticker: "NVDA", pnlUsd: 19, pnlPct: 8 }),
        row({ ticker: "SUI", pnlUsd: null, pnlPct: null, costUsd: null, valueUsd: 40, partial: true }),
        row({ ticker: "PWR", pnlUsd: -2, pnlPct: -5 }),
      ],
      "ai-stocks",
      false,
    );
    assert.deepEqual(model.bars.map((bar) => [bar.axisLabel, bar.tone, bar.href]), [
      ["NVDA", "up", "/n/ai-stocks/nvda"],
      ["PWR", "down", "/n/ai-stocks/pwr"],
    ]);
    assert.equal(model.caption, "SUI entry unknown, not charted");
  });

  it("uses percent height in public mode and hides dollars", () => {
    const bars = barsFromOpenLots(
      [
        lot({ time: "2026-09-18T12:00:00-05:00", day: "2026-09-18", pnlUsd: 12.5, pnlPct: 4.2, valueUsd: 40, entryUsd: 10 }),
      ],
      true,
    );
    assert.equal(bars[0]?.magnitude, 4.2);
    const hidden = lotBarPopoverLines(bars[0]!, true);
    assert.deepEqual(hidden, ["Sep 18", "First buy", "+4.2%"]);
    assert.equal(hidden.join(" ").includes("$"), false);
    const shown = lotBarPopoverLines(bars[0]!, false).join(" ");
    assert.match(shown, /\$/);
    const parent = barsFromRollup(
      [row({ ticker: "NVDA", pnlUsd: 19, pnlPct: 8, valueUsd: 40 })],
      "ai-stocks",
      true,
    );
    assert.equal(parent.bars[0]?.magnitude, 8);
    assert.equal(parent.bars[0]?.sequence, 0);
    assert.equal(lotBarPopoverLines(parent.bars[0]!, true).join(" ").includes("$"), false);
    const text = collectText(
      LotBarChart({ model: { bars, caption: null }, publicMode: true, label: "lots" }),
    ).join(" ");
    assert.equal(text.includes("$"), false);
    assert.match(text, /%/);
    assert.equal(lotBarValueLabel(bars[0]!, true)?.includes("$"), false);
  });

  it("charts a clean sale as a sold bar and hides dollars in public mode", () => {
    const closed: ClosedLotBarInput = {
      time: "2026-09-14T15:00:00-05:00",
      day: "2026-09-14",
      soldDay: "2026-09-15",
      originalQty: "0.046377",
      price: "388.12",
      entryUsd: 388.12,
      exitUsd: 392.23,
      realizedPnlUsd: 0.19,
      realizedPct: 1.06,
    };
    const later: ClosedLotBarInput = {
      ...closed,
      time: "2026-09-18T15:00:00-05:00",
      day: "2026-09-18",
      soldDay: "2026-10-09",
      price: "421.0739",
      entryUsd: 421.0739,
      exitUsd: 424.79,
      realizedPnlUsd: 0.01,
      realizedPct: 0.9,
    };
    const bars = barsFromClosedLots([later, closed], false);
    assert.deepEqual(bars.map((bar) => bar.axisLabel), ["Sep 14", "Sep 18"]);
    assert.equal(bars[0]?.first, true);
    assert.equal(bars[0]?.sold, true);
    assert.equal(bars[0]?.tone, "up");
    assert.equal(bars[1]?.sequence, 2);
    const privateLines = lotBarPopoverLines(bars[0]!, false).join(" ");
    assert.match(privateLines, /First buy/);
    assert.match(privateLines, /bought Sep 14/);
    assert.match(privateLines, /sold Sep 15/);
    assert.match(privateLines, /entry/);
    assert.match(privateLines, /exit/);
    assert.match(privateLines, /\$/);
    const publicLines = lotBarPopoverLines(bars[0]!, true);
    assert.deepEqual(publicLines, ["Sep 14", "First buy", "+1.1%"]);
    assert.equal(publicLines.join(" ").includes("$"), false);
    assert.equal(publicLines.join(" ").includes("shares"), false);
    const hidden = barsFromClosedLots([{ ...closed, exitUsd: Number.NaN, realizedPct: null }], false);
    assert.deepEqual(hidden, []);
    const text = collectText(LotBarChart({ model: { bars, caption: null }, label: "sold" })).join(" ");
    assert.match(text, /Sold/);
    assert.match(text, /sold true/);
    assert.match(text, /first true/);
  });

  it("does not render the position line chart from a node page", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const nodePage = readFileSync(`${root}/app/n/[parent]/[node]/page.tsx`, "utf8");
    const parentPage = readFileSync(`${root}/app/n/[parent]/page.tsx`, "utf8");
    const book = readFileSync(`${root}/components/position-book.tsx`, "utf8");
    const home = readFileSync(`${root}/app/page.tsx`, "utf8");
    assert.equal(nodePage.includes("PositionChartView"), false);
    assert.equal(nodePage.includes("position-mark"), false);
    assert.equal(nodePage.includes("Position over time"), false);
    assert.equal(parentPage.includes("PositionChartView"), false);
    assert.equal(book.includes("PositionChartView"), false);
    assert.equal(book.includes("position-mark"), false);
    assert.equal(book.includes("<circle"), false);
    assert.equal(home.includes("home-visuals"), true);
    const floor = readFileSync(`${root}/components/public-floor.tsx`, "utf8");
    const holdingFace = floor.slice(
      floor.indexOf("export function PublicHoldingFace"),
      floor.indexOf("export function TreasuryCard"),
    );
    const groupFloor = floor.slice(
      floor.indexOf("export function PublicGroupFloor"),
      floor.indexOf("export function PublicNodePage"),
    );
    const nodeFace = floor.slice(
      floor.indexOf("export function PublicNodePage"),
      floor.indexOf("export function PublicFightRecord"),
    );
    assert.equal(holdingFace.includes("IndexChart"), false);
    assert.equal(holdingFace.includes("position-mark"), false);
    assert.equal(holdingFace.includes("<circle"), false);
    assert.equal(groupFloor.includes("IndexChart"), false);
    assert.equal(groupFloor.includes("<circle"), false);
    assert.match(groupFloor, /LotBarChart/);
    assert.equal(nodeFace.includes("IndexChart"), false);
    assert.equal(nodeFace.includes("position-mark"), false);
    assert.equal(nodeFace.includes("<circle"), false);
    assert.match(nodeFace, /bars/);
    assert.match(nodePage, /PublicNodePage/);
    assert.match(nodePage, /bars=\{floor\.nodeBars/);
    assert.match(parentPage, /bars=\{floor\.groupBars/);
    const publicBars = publicBarsForBook(
      [lot({ time: "2026-09-18T12:00:00-05:00", day: "2026-09-18", pnlUsd: 12.5, pnlPct: 11.4, valueUsd: 40, entryUsd: 10 })],
      [],
    );
    assert.equal(JSON.stringify(publicBars).includes("$"), false);
    assert.equal(publicPayloadHasMoneyKey(publicBars), false);
    const rendered = collectText(
      LotBarChart({
        model: publicLotChartModel(publicBars),
        publicMode: true,
        label: "PWR lots",
      }),
    ).join(" ");
    assert.match(rendered, /\+11\.4%/);
    assert.match(rendered, /First buy/);
    assert.match(rendered, /Sep 18/);
    assert.equal(rendered.includes("$"), false);
    assert.equal(rendered.includes("shares"), false);
    const parentBars = publicBarsForRollup(
      [row({ ticker: "PWR", pnlUsd: 19, pnlPct: 8, valueUsd: 40 }), row({ ticker: "SUI", pnlUsd: null, pnlPct: null })],
      "ai-stocks",
    );
    assert.deepEqual(parentBars.map((bar) => bar.label), ["PWR"]);
    assert.equal(parentBars[0]?.href, "/n/ai-stocks/pwr");
    const parentText = collectText(
      LotBarChart({
        model: publicLotChartModel(parentBars),
        publicMode: true,
        label: "AI Stocks holdings",
      }),
    ).join(" ");
    assert.match(parentText, /\+8\.0%/);
    assert.equal(parentText.includes("$"), false);
    assert.equal(parentText.includes("First buy"), false);
  });
});

function publicPayloadHasMoneyKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (/usd|price|quantity|shares|qty|cost|balance|stake|amount|bankroll|token/i.test(key)) return true;
    if (Array.isArray(child)) return child.some((item) => publicPayloadHasMoneyKey(item));
    return publicPayloadHasMoneyKey(child);
  });
}
