import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isValidElement, type ReactNode } from "react";
import { LotBarChart } from "@/components/lot-bar-chart";
import { LOT_BAR_CROWDED_AT, LOT_BAR_CROWDED_MAX } from "@/lib/lot-range";
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

function collectSurface(node: ReactNode, found: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return found;
  if (typeof node === "string" || typeof node === "number") {
    found.push(String(node));
    return found;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectSurface(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const type = node.type;
  if (typeof type === "function") {
    collectSurface((type as (props: unknown) => ReactNode)(node.props), found);
    return found;
  }
  const props = node.props as { children?: ReactNode; "aria-label"?: string; "aria-current"?: string; title?: string };
  if (props["aria-label"]) found.push(props["aria-label"]);
  if (props["aria-current"]) found.push(props["aria-current"]);
  if (props.title) found.push(props.title);
  collectSurface(props.children, found);
  return found;
}

function anchorsOf(node: ReactNode, found: { href: string; text: string; current?: string }[] = []) {
  if (node == null || typeof node === "boolean") return found;
  if (typeof node === "string" || typeof node === "number") return found;
  if (Array.isArray(node)) {
    for (const child of node) anchorsOf(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const type = node.type;
  if (typeof type === "function") {
    anchorsOf((type as (props: unknown) => ReactNode)(node.props), found);
    return found;
  }
  const props = node.props as { href?: string; children?: ReactNode; "aria-current"?: string };
  if (type === "a" && typeof props.href === "string" && props.href.startsWith("?")) {
    found.push({
      href: props.href,
      text: collectText(props.children).join(""),
      current: props["aria-current"],
    });
  }
  anchorsOf(props.children, found);
  return found;
}

function badgesOf(node: ReactNode, found: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return found;
  if (typeof node === "string" || typeof node === "number") return found;
  if (Array.isArray(node)) {
    for (const child of node) badgesOf(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const type = node.type;
  if (typeof type === "function") {
    badgesOf((type as (props: unknown) => ReactNode)(node.props), found);
    return found;
  }
  if (classNameOf(node).split(" ").includes("lot-bar-badge")) {
    found.push(collectText(node).join(""));
  }
  badgesOf((node.props as { children?: ReactNode }).children, found);
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
    assert.equal(parentPage.includes("home-visuals"), true);
    assert.match(home, /NodeFaceGrid/);
    assert.equal(home.includes("PositionChartView"), false);
    assert.equal(home.includes("IndexChart"), false);
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

  it("draws a compact parent-card bar with the lot sign and color", () => {
    const bars = barsFromOpenLots(
      [
        lot({ time: "2026-10-06T12:00:00-05:00", day: "2026-10-06", pnlUsd: -0.28, pnlPct: -1.7, price: "2" }),
        lot({ time: "2026-09-18T12:00:00-05:00", day: "2026-09-18", pnlUsd: 0.11, pnlPct: 11.4 }),
      ],
      false,
    );
    const node = LotBarChart({
      model: { bars, caption: "9 XRP entry unknown, not charted" },
      compact: true,
      label: "PWR lots",
    });
    assert.ok(isValidElement(node));
    assert.match(classNameOf(node), /is-compact/);
    const text = collectText(node).join(" ");
    assert.match(text, /tone up/);
    assert.match(text, /tone down/);
    assert.ok(text.indexOf("tone up") < text.indexOf("tone down"));
    const up = findByClass(node, "is-up");
    const down = findByClass(node, "is-down");
    assert.ok(up);
    assert.ok(down);
    assert.match(classNameOf(findByClass(up!, "lot-bar-fill")), /is-up/);
    assert.match(classNameOf(findByClass(down!, "lot-bar-fill")), /is-down/);
    const plot = findByClass(node, "lot-bar-plot");
    const height = isValidElement(plot) ? (plot.props as { style?: { height?: number } }).style?.height : 0;
    assert.ok(height !== undefined && height >= 36 && height <= 48);
    assert.equal(findByClass(node, "lot-bar-badge"), null);
    assert.equal(findByClass(node, "lot-bar-value"), null);
    assert.equal(findByClass(node, "lot-bar-date"), null);
    assert.equal(findByClass(node, "lot-bar-hit"), null);
    assert.equal(elementNames(node).includes("a"), false);
    assert.equal(elementNames(node).includes("details"), false);
    assert.equal(text.includes("First buy"), false);
    assert.equal(text.includes("entry unknown"), false);
    const empty = LotBarChart({
      model: { bars: [], caption: "9 XRP entry unknown, not charted" },
      compact: true,
      label: "XRP lots",
    });
    assert.equal(empty, null);
    const unknown = barsFromOpenLots(
      [lot({ time: "2026-09-18T12:00:00-05:00", day: "2026-09-18", entryUsd: Number.NaN, pnlUsd: null, pnlPct: null })],
      false,
    );
    assert.deepEqual(unknown, []);
    assert.equal(
      LotBarChart({ model: { bars: unknown, caption: null }, compact: true, label: "XRP lots" }),
      null,
    );
    const pub = barsFromOpenLots(
      [
        lot({ time: "2026-09-18T12:00:00-05:00", day: "2026-09-18", pnlUsd: 12.5, pnlPct: 11.4 }),
        lot({ time: "2026-10-06T12:00:00-05:00", day: "2026-10-06", pnlUsd: -1, pnlPct: -1.7, price: "2" }),
      ],
      true,
    );
    const publicNode = LotBarChart({
      model: { bars: pub, caption: null },
      compact: true,
      publicMode: true,
      label: "PWR lots",
    });
    assert.ok(isValidElement(publicNode));
    const aria = (publicNode.props as { "aria-label"?: string })["aria-label"] ?? "";
    assert.match(aria, /%/);
    assert.equal(aria.includes("$"), false);
    const rendered = `${aria} ${collectText(publicNode).join(" ")}`;
    assert.equal(rendered.includes("$"), false);
    const root = fileURLToPath(new URL("..", import.meta.url));
    const parentPage = readFileSync(`${root}/app/n/[parent]/page.tsx`, "utf8");
    const floor = readFileSync(`${root}/components/public-floor.tsx`, "utf8");
    const home = readFileSync(`${root}/app/page.tsx`, "utf8");
    assert.equal(parentPage.includes("priceSpark"), false);
    assert.equal(parentPage.includes("loadEquityHistory"), false);
    assert.equal(parentPage.includes("loadCryptoHistory"), false);
    assert.equal(parentPage.includes("price-spark"), false);
    assert.equal(parentPage.includes("sparkLine"), false);
    assert.match(parentPage, /NodeGrid/);
    assert.equal(parentPage.includes("lotBars"), false);
    assert.equal(parentPage.includes("cardBars"), false);
    const groupFloor = floor.slice(
      floor.indexOf("export function PublicGroupFloor"),
      floor.indexOf("export function PublicNodePage"),
    );
    assert.match(groupFloor, /NodeFaceGrid/);
    assert.equal(groupFloor.includes("compact"), false);
    assert.equal(groupFloor.includes("priceSpark"), false);
    assert.equal(groupFloor.includes("price-spark"), false);
    assert.equal(groupFloor.includes("IndexChart"), false);
    assert.match(parentPage, /home-visuals/);
    assert.match(home, /NodeFaceGrid/);
    assert.equal(home.includes("AiChangeVisual"), false);
  });

  it("filters the chart by the Chicago buy window and leaves an empty range blank", () => {
    const now = new Date("2026-10-12T04:30:00.000Z");
    const bars = barsFromOpenLots(
      [
        lot({ time: "2026-10-11T16:00:00-05:00", day: "2026-10-11", pnlUsd: 6, pnlPct: 12 }),
        lot({ time: "2026-10-12T16:00:00-05:00", day: "2026-10-12", pnlUsd: -4, pnlPct: -8 }),
        lot({ time: "2026-09-01T16:00:00-05:00", day: "2026-09-01", pnlUsd: 1, pnlPct: 1 }),
      ],
      false,
    );
    assert.equal(bars.find((bar) => bar.day === "2026-10-11")?.magnitude, 6);
    const day = LotBarChart({ model: { bars, caption: null }, label: "PWR lots", range: "1D", now });
    const dayText = collectText(day).join(" ");
    assert.match(dayText, /Oct 11/);
    assert.match(dayText, /\+\$6\.00/);
    assert.equal(dayText.includes("Oct 12"), false);
    assert.equal(dayText.includes("Sep 1"), false);
    assert.equal(findByClass(day, "lot-bars-empty"), null);
    const selected = anchorsOf(day).find((link) => link.current === "true");
    assert.equal(selected?.text, "1D");
    assert.equal(selected?.href, "?range=1D#lot-bars");
    assert.equal(anchorsOf(day).find((link) => link.text === "All")?.href, "?#lot-bars");

    const empty = LotBarChart({ model: { bars, caption: "9 PWR entry unknown, not charted" }, label: "PWR lots", range: "1W", now: new Date("2026-08-01T17:00:00.000Z") });
    const emptyText = collectText(empty).join(" ");
    assert.match(emptyText, /No buys in this range/);
    assert.match(emptyText, /9 PWR entry unknown, not charted/);
    assert.equal(findByClass(empty, "lot-bar-fill"), null);
    assert.equal(findByClass(empty, "lot-bar-col"), null);
    assert.equal(findByClass(empty, "lot-bars-cols"), null);

    const invalid = LotBarChart({ model: { bars, caption: null }, label: "PWR lots", range: "nope", now });
    assert.equal((isValidElement(invalid) ? (invalid.props as { "data-range"?: string })["data-range"] : ""), "All");
    const invalidText = collectText(invalid).join(" ");
    assert.match(invalidText, /Sep 1/);
    assert.match(invalidText, /Oct 11/);
    assert.match(invalidText, /Oct 12/);
    assert.equal(anchorsOf(invalid).find((link) => link.current === "true")?.text, "All");

    const root = fileURLToPath(new URL("..", import.meta.url));
    const book = readFileSync(`${root}/components/position-book.tsx`, "utf8");
    const charts = book.match(/<LotBarChart[\s\S]*?\/>/g) ?? [];
    assert.equal(charts.length, 2);
    for (const chart of charts) assert.match(chart, /range=/);
    const tableStart = book.indexOf("<LotsTable");
    const table = book.slice(tableStart, book.indexOf("/>", tableStart) + 2);
    assert.equal(table.includes("range"), false);
    const rollupList = book.slice(book.indexOf("rollup.rows.map"), book.indexOf("rollupLine({", book.indexOf("total: true")));
    assert.equal(rollupList.includes("filterLotBars"), false);
  });

  it("draws a crowded year without per-bar labels and keeps the first buy", () => {
    const count = LOT_BAR_CROWDED_AT;
    const bars = barsFromOpenLots(
      Array.from({ length: count }, (_, index) => {
        const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
        return lot({
          time: `${day}T15:00:00-05:00`,
          day,
          pnlUsd: index % 2 === 0 ? 1.25 : -0.4,
          pnlPct: index % 2 === 0 ? 3 : -1.5,
          remainingQty: index === 3 ? "1" : "2",
          originalQty: "2",
        });
      }),
      false,
    );
    assert.equal(bars.length, count);
    const node = LotBarChart({ model: { bars, caption: null }, label: "PWR lots", range: "All" });
    assert.match(classNameOf(node), /is-crowded/);
    assert.equal(findByClass(node, "lot-bar-value"), null);
    assert.equal(findByClass(node, "lot-bar-date"), null);
    assert.equal(findByClass(node, "lot-bar-tick"), null);
    const cols = findByClass(node, "lot-bars-cols");
    assert.equal(styleOf(cols).minWidth, "100%");
    const fill = findByClass(node, "lot-bar-fill");
    assert.equal(styleOf(fill).maxWidth, LOT_BAR_CROWDED_MAX);
    assert.match(classNameOf(fill), /is-first/);
    const badges = badgesOf(node);
    assert.deepEqual(badges, ["First buy"]);
    assert.match(collectText(node).join(" "), /tone up/);
    assert.match(collectText(node).join(" "), /tone down/);
    assert.match(collectText(node).join(" "), /partial true/);

    const open = LotBarChart({
      model: { bars: bars.slice(0, count - 1), caption: null },
      label: "PWR lots",
    });
    assert.equal(classNameOf(open).includes("is-crowded"), false);
    assert.ok(findByClass(open, "lot-bar-value"));
    assert.ok(findByClass(open, "lot-bar-date"));
    assert.match(styleOf(findByClass(open, "lot-bars-cols")).minWidth ?? "", /^max\(100%, \d+px\)$/);

    const root = fileURLToPath(new URL("..", import.meta.url));
    const css = readFileSync(`${root}/app/globals.css`, "utf8");
    assert.match(css, /\.lot-range a \{[^}]*min-height:\s*48px/);
    assert.match(css, /\.lot-range a \{[^}]*min-width:\s*48px/);
    assert.match(css, /\.lot-bars\.is-crowded \.lot-bar-col \{[^}]*min-width:\s*0/);
    const home = readFileSync(`${root}/app/page.tsx`, "utf8");
    assert.equal(home.includes("lot-range"), false);
    assert.equal(home.includes("LotBarChart"), false);
  });

  it("keeps public range text in percent and compact cards unfiltered", () => {
    const now = new Date("2026-10-12T04:30:00.000Z");
    const bars = barsFromOpenLots(
      [
        lot({ time: "2026-10-11T16:00:00-05:00", day: "2026-10-11", pnlUsd: 12.5, pnlPct: 4.2, valueUsd: 40, entryUsd: 10 }),
        lot({ time: "2026-09-01T16:00:00-05:00", day: "2026-09-01", pnlUsd: 3, pnlPct: 1.1, valueUsd: 20, entryUsd: 10 }),
      ],
      true,
    );
    const shown = LotBarChart({
      model: { bars, caption: null },
      publicMode: true,
      label: "PWR lots",
      range: "1D",
      now,
    });
    const surface = collectSurface(shown).join(" ");
    assert.match(surface, /Buy range/);
    assert.match(surface, /\+4\.2%/);
    assert.match(surface, /Oct 11/);
    assert.match(surface, /1D/);
    assert.equal(surface.includes("$"), false);
    assert.equal(surface.includes("Sep 1"), false);

    const empty = LotBarChart({
      model: { bars, caption: null },
      publicMode: true,
      label: "PWR lots",
      range: "1W",
      now: new Date("2026-08-01T17:00:00.000Z"),
    });
    const emptySurface = collectSurface(empty).join(" ");
    assert.match(emptySurface, /No buys in this range/);
    assert.equal(emptySurface.includes("$"), false);
    assert.equal(findByClass(empty, "lot-bar-fill"), null);

    const crowded = barsFromOpenLots(
      Array.from({ length: LOT_BAR_CROWDED_AT }, (_, index) => {
        const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
        return lot({
          time: `${day}T15:00:00-05:00`,
          day,
          pnlUsd: 9,
          pnlPct: index % 2 === 0 ? 4.2 : -1.5,
          valueUsd: 40,
          entryUsd: 10,
        });
      }),
      true,
    );
    const dense = LotBarChart({
      model: { bars: crowded, caption: null },
      publicMode: true,
      label: "PWR lots",
      range: "All",
    });
    const denseSurface = collectSurface(dense).join(" ");
    assert.match(classNameOf(dense), /is-crowded/);
    assert.match(denseSurface, /First buy/);
    assert.match(denseSurface, /%/);
    assert.equal(denseSurface.includes("$"), false);
    assert.equal(findByClass(dense, "lot-bar-value"), null);

    const compact = LotBarChart({
      model: { bars, caption: null },
      compact: true,
      publicMode: true,
      range: "1D",
      now,
      label: "PWR lots",
    });
    assert.equal(findByClass(compact, "lot-range"), null);
    const compactText = collectText(compact).join(" ");
    assert.match(compactText, /tone up/);
    assert.equal(compactText.includes("1D"), false);
    assert.equal(collectSurface(compact).join(" ").includes("$"), false);

    const rollup = barsFromRollup(
      [row({ ticker: "PWR", pnlUsd: 19, pnlPct: 8 }), row({ ticker: "NVDA", pnlUsd: -2, pnlPct: -1 })],
      "ai-stocks",
      false,
    );
    const parent = LotBarChart({ model: rollup, label: "Holdings", range: "1W", now });
    assert.match(collectText(parent).join(" "), /No buys in this range/);
    assert.equal(findByClass(parent, "lot-bar-fill"), null);
    const parentAll = LotBarChart({ model: rollup, label: "Holdings", range: "All", now });
    assert.match(collectText(parentAll).join(" "), /PWR/);
    assert.match(collectText(parentAll).join(" "), /NVDA/);
  });
});

function elementNames(node: ReactNode, found: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return found;
  if (typeof node === "string" || typeof node === "number") return found;
  if (Array.isArray(node)) {
    for (const child of node) elementNames(child, found);
    return found;
  }
  if (!isValidElement(node)) return found;
  const type = node.type;
  if (typeof type === "string") found.push(type);
  if (typeof type === "function") {
    elementNames((type as (props: unknown) => ReactNode)(node.props), found);
    return found;
  }
  elementNames((node.props as { children?: ReactNode }).children, found);
  return found;
}

function publicPayloadHasMoneyKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (/usd|price|quantity|shares|qty|cost|balance|stake|amount|bankroll|token/i.test(key)) return true;
    if (Array.isArray(child)) return child.some((item) => publicPayloadHasMoneyKey(item));
    return publicPayloadHasMoneyKey(child);
  });
}
