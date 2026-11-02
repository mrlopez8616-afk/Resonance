import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { YOUTUBE_GEAR } from "@/data/youtube-gear";
import {
  EMPTY_CARD_NOTE,
  cardSpanClass,
  deriveNodeStatus,
  formatUpdatedCt,
  headlineIsEmpty,
} from "@/lib/node-layout";

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};

function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string; title?: string }) {
  return createElement("a", { href: props.href ?? "", className: props.className, title: props.title }, props.children);
}

const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (
    normalized === "next/link" ||
    normalized.endsWith("/link.js") ||
    normalized.endsWith("/link.react-server.js") ||
    normalized.includes("/app-dir/link") ||
    normalized.includes("next/dist/client/link")
  ) {
    return { __esModule: true, default: LinkStandIn };
  }
  return originalLoad(request, parent, isMain);
};

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const layoutCss = readFileSync(path.join(root, "src/components/node-layout/node-layout.css"), "utf8");
const layoutSource = [
  readFileSync(path.join(root, "src/lib/node-layout.ts"), "utf8"),
  readFileSync(path.join(root, "src/components/node-layout/node-header.tsx"), "utf8"),
].join("\n");

type LayoutUi = typeof import("@/components/node-layout");
type YouTubeUi = typeof import("@/components/youtube-node");

let ui: LayoutUi;
let youtube: YouTubeUi;

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  if (typeof type !== "string") return render((node.props as { children?: ReactNode }).children);
  const props = node.props as Record<string, unknown>;
  const attrs: string[] = [];
  for (const key of Object.keys(props)) {
    if (key === "children") continue;
    const value = props[key];
    if (value == null || value === false || typeof value === "function") continue;
    const name = key === "className" ? "class" : key;
    if (value === true) {
      attrs.push(` ${name}`);
      continue;
    }
    attrs.push(` ${name}="${String(value).replace(/"/g, "&quot;")}"`);
  }
  const children = render(props.children as ReactNode);
  return `<${type}${attrs.join("")}>${children}</${type}>`;
}

before(async () => {
  ui = await import("@/components/node-layout");
  youtube = await import("@/components/youtube-node");
});

describe("node layout rules", () => {
  it("derives the status pill from the loaded parts", () => {
    assert.equal(deriveNodeStatus(["live", "live"]), "live");
    assert.equal(deriveNodeStatus(["live", "missing"]), "partial");
    assert.equal(deriveNodeStatus(["partial"]), "partial");
    assert.equal(deriveNodeStatus(["live", "partial", "missing"]), "partial");
    assert.equal(deriveNodeStatus(["missing", "missing"]), "not-connected");
    assert.equal(deriveNodeStatus([]), "not-connected");
    assert.equal(headlineIsEmpty("not recorded"), true);
    assert.equal(headlineIsEmpty("not connected"), true);
    assert.equal(headlineIsEmpty("1,240"), false);
  });

  it("formats a real timestamp in Central Time and hides a missing one", () => {
    assert.equal(formatUpdatedCt(null), null);
    assert.equal(formatUpdatedCt(undefined), null);
    assert.equal(formatUpdatedCt(""), null);
    assert.equal(formatUpdatedCt("   "), null);
    assert.equal(formatUpdatedCt("not a time"), null);
    assert.equal(formatUpdatedCt("2026-11-02T20:04:00.000Z"), "Updated 2:04 PM CT");
    assert.equal(layoutSource.includes("new Date()"), false);
    assert.equal(layoutSource.includes("Date.now"), false);
  });

  it("keeps one grid contract: equal height, 12 columns, and the span steps", () => {
    assert.equal(cardSpanClass("stat"), "node-span-3");
    assert.equal(cardSpanClass("trend"), "node-span-6");
    assert.equal(cardSpanClass("list"), "node-span-12");
    assert.match(layoutCss, /\.node-card-equal\s*\{[^}]*height:\s*100%/);
    assert.match(layoutCss, /\.node-grid-12\s*\{[^}]*repeat\(12,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(layoutCss, /\.node-grid-12\s*\{[^}]*align-items:\s*stretch/);
    assert.match(layoutCss, /\.node-grid-12\s*\{[^}]*gap:\s*var\(--node-gap\)/);
    assert.match(layoutCss, /\.node-span-3\s*\{[^}]*grid-column:\s*span 3/);
    assert.match(layoutCss, /\.node-span-6\s*\{[^}]*grid-column:\s*span 6/);
    assert.match(layoutCss, /\.node-span-12\s*\{[^}]*grid-column:\s*span 12/);
    assert.match(layoutCss, /@media \(max-width:\s*720px\)\s*\{[^}]*\.node-span-3\s*\{[^}]*span 6/);
    assert.match(layoutCss, /@media \(max-width:\s*420px\)\s*\{[^}]*\.node-span-3\s*\{[^}]*span 12/);
    assert.match(layoutCss, /--node-value-size:\s*1\.65rem/);
    assert.match(layoutCss, /--node-price-size:\s*0\.84rem/);
    assert.match(layoutCss, /\.node-card-value\s*\{[^}]*font-size:\s*var\(--node-value-size\)/);
    assert.match(layoutCss, /\.node-card-price\s*\{[^}]*font-size:\s*var\(--node-price-size\)/);
    const gaps = layoutCss.match(/(?<!-)gap:\s*[^;]+/g) ?? [];
    assert.equal(gaps.length > 0, true);
    assert.equal(gaps.every((gap) => gap.includes("var(--node-gap)")), true);
  });
});

describe("node layout components", () => {
  it("gives stat cards and empty cards the same equal-height class", () => {
    const stat = render(createElement(ui.StatCard, { label: "Views", value: "12", detail: "28 days" }));
    const empty = render(createElement(ui.EmptyCard, { label: "Views" }));
    const trend = render(createElement(ui.StatCard, { label: "Trend", span: "trend", value: "12" }));
    const list = render(createElement(ui.StatCard, { label: "Videos", span: "list", value: "none" }));
    for (const html of [stat, empty, trend, list]) {
      assert.match(html, /node-card node-card-equal/);
    }
    assert.match(stat, /node-span-3/);
    assert.match(empty, /node-span-3/);
    assert.match(trend, /node-span-6/);
    assert.match(list, /node-span-12/);
    assert.match(stat, /data-span="stat"/);
    assert.match(empty, /data-card="empty"/);
  });

  it("prints the empty state as a label, a dash, and connect copy", () => {
    const html = render(
      createElement(ui.EmptyCard, {
        label: "Watch time",
        setupHref: "/api/youtube/oauth/start",
        setupLabel: "Connect channel",
      }),
    );
    assert.match(html, /Watch time/);
    assert.match(html, /—/);
    assert.match(html, new RegExp(EMPTY_CARD_NOTE));
    assert.match(html, /href="\/api\/youtube\/oauth\/start"/);
    assert.match(html, /Connect channel/);
    const quiet = render(createElement(ui.EmptyCard, { label: "Avg view" }));
    assert.equal(quiet.includes("href="), false);
  });

  it("paints a status pill from the data and omits Updated when there is no timestamp", () => {
    const live = render(createElement(ui.NodeHeader, { name: "Channel", parts: ["live", "live"], backHref: "/n/youtube" }));
    assert.match(live, /data-node-status="live"/);
    assert.match(live, />Live</);
    assert.equal(live.includes("Updated"), false);
    assert.match(live, /href="\/n\/youtube"/);
    assert.match(live, />Back</);

    const partial = render(
      createElement(ui.NodeHeader, {
        name: "YouTube",
        parts: ["live", "missing"],
        updatedAt: "not a time",
        backHref: "/",
      }),
    );
    assert.match(partial, /data-node-status="partial"/);
    assert.match(partial, />Partial</);
    assert.equal(partial.includes("Updated"), false);

    const offline = render(
      createElement(ui.NodeHeader, { name: "Channel", parts: ["missing"], updatedAt: null, backHref: "/n/youtube" }),
    );
    assert.match(offline, /data-node-status="not-connected"/);
    assert.match(offline, />Not connected</);
    assert.equal(offline.includes("Updated"), false);

    const stamped = render(
      createElement(ui.NodeHeader, {
        name: "Channel",
        parts: ["live"],
        updatedAt: "2026-11-02T20:04:00.000Z",
        backHref: "/n/youtube",
      }),
    );
    assert.match(stamped, /Updated 2:04 PM CT/);
  });

  it("keeps a locked card the same size and hides the dollar value", () => {
    const open = render(
      createElement(ui.StatCard, {
        label: "NVDA",
        money: true,
        value: "$12,400",
        detail: "$142.10 live",
      }),
    );
    assert.match(open, /node-card-value/);
    assert.match(open, /node-card-price/);
    assert.match(open, /\$12,400/);
    assert.match(open, /\$142\.10 live/);

    const locked = render(
      createElement(ui.StatCard, {
        label: "NVDA",
        money: true,
        value: "$12,400",
        detail: "$142.10 live",
        locked: true,
      }),
    );
    assert.match(locked, /node-card node-card-equal node-span-3/);
    assert.match(locked, /data-lock-badge/);
    assert.match(locked, /Private/);
    assert.equal(locked.includes("$"), false);
    assert.equal(locked.includes("12,400"), false);
    assert.equal(locked.includes("142.10"), false);
  });

  it("collapses an empty section to one row and keeps section order", () => {
    const empty = render(
      createElement(ui.NodeSection, { kind: "trends", empty: true }, createElement("p", null, "hidden trend")),
    );
    assert.match(empty, /class="node-section is-empty"/);
    assert.match(empty, /data-section="trends"/);
    assert.match(empty, /Trends/);
    assert.match(empty, /—/);
    assert.equal(empty.includes("hidden trend"), false);

    const ordered = render(
      createElement(
        ui.NodeSections,
        null,
        createElement(ui.NodeSection, { kind: "lists" }, "lists-body"),
        createElement(ui.NodeSection, { kind: "numbers" }, "numbers-body"),
        createElement(ui.NodeSection, { kind: "trends" }, "trends-body"),
      ),
    );
    const numbers = ordered.indexOf('data-section="numbers"');
    const trends = ordered.indexOf('data-section="trends"');
    const lists = ordered.indexOf('data-section="lists"');
    assert.equal(numbers < trends && trends < lists, true);
  });
});

describe("YouTube on the shared layout", () => {
  it("keeps the parent to child cards and boxes empty channel numbers", () => {
    const parent = render(createElement(youtube.YouTubeParent));
    assert.match(parent, /href="\/"/);
    assert.match(parent, /href="\/n\/youtube\/channel"/);
    assert.match(parent, /href="\/n\/youtube\/gear"/);
    assert.match(parent, /href="\/n\/youtube\/bricks"/);
    assert.match(parent, /data-node-status="not-connected"/);
    assert.equal(parent.includes("Avg view"), false);
    assert.equal(parent.includes("Watch time"), false);
    assert.equal(parent.includes("Updated"), false);

    const channel = render(createElement(youtube.YouTubeChannel));
    assert.match(channel, /node-card node-card-equal/);
    assert.match(channel, /Watch time/);
    assert.match(channel, /Avg view/);
    assert.match(channel, new RegExp(EMPTY_CARD_NOTE));
    assert.match(channel, /data-node-status="not-connected"/);
    assert.match(channel, /class="node-section is-empty"/);
    assert.equal(channel.includes("Updated"), false);
    assert.match(channel, /href="\/n\/youtube"/);
  });

  it("locks channel numbers and gear cost in Public view", () => {
    const channel = render(
      createElement(youtube.YouTubeChannel, {
        publicMode: true,
        stats: { subscribers: "$9", views: "$8", videos: "$7" },
      }),
    );
    assert.match(channel, /data-lock-badge/);
    assert.match(channel, /node-card-equal/);
    assert.equal(channel.includes("$"), false);
    assert.equal(channel.includes(EMPTY_CARD_NOTE), false);

    const gear = render(
      createElement(youtube.YouTubeGearDetail, {
        item: { ...YOUTUBE_GEAR[0]!, costUsd: 199 },
        publicMode: true,
      }),
    );
    assert.match(gear, /Cost/);
    assert.match(gear, /data-lock-badge/);
    assert.match(gear, /node-card-equal/);
    assert.equal(gear.includes("$"), false);
    assert.equal(gear.includes("199"), false);
  });
});
