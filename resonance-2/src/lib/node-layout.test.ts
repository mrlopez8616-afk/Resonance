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
  latestTimestamp,
} from "@/lib/node-layout";

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _extensions: Record<string, (module: { _compile: (code: string, file: string) => void }, filename: string) => void>;
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
nodeModule._extensions[".css"] = (module, filename) => {
  module._compile("module.exports = new Proxy({}, { get: (_, key) => String(key) });", filename);
};

function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string; title?: string }) {
  return createElement("a", { href: props.href ?? "", className: props.className, title: props.title }, props.children);
}

const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (normalized.endsWith(".css") || normalized.includes(".module.css")) {
    const styles = new Proxy({}, { get: (_target, key) => String(key) });
    return { __esModule: true, default: styles };
  }
  if (
    normalized === "next/link" ||
    normalized.endsWith("/link.js") ||
    normalized.endsWith("/link.react-server.js") ||
    normalized.includes("/app-dir/link") ||
    normalized.includes("next/dist/client/link")
  ) {
    return { __esModule: true, default: LinkStandIn };
  }
  if (normalized === "next/navigation" || normalized.includes("next/dist/client/components/navigation")) {
    return {
      __esModule: true,
      useRouter() {
        return { push() {}, refresh() {}, replace() {} };
      },
      usePathname() {
        return "/";
      },
      useSearchParams() {
        return new URLSearchParams();
      },
      redirect() {},
      notFound() {},
    };
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
type ControlUi = typeof import("@/components/control-room");
type HealthUi = typeof import("@/components/machine-health-floor");
type ApprovalsParentUi = typeof import("@/components/approvals-parent");
type ApprovalsUi = typeof import("@/components/approvals-floor");
type BuildUi = typeof import("@/components/build-floor");
type FinanceUi = typeof import("@/components/finance-floor");
type FinanceDetailUi = typeof import("@/components/finance-detail");
type PredictionsUi = typeof import("@/components/predictions-floor");
type ValueUi = typeof import("@/components/value-stat");

let ui: LayoutUi;
let youtube: YouTubeUi;
let controlUi: ControlUi;
let healthUi: HealthUi;
let approvalsParentUi: ApprovalsParentUi;
let approvalsUi: ApprovalsUi;
let buildUi: BuildUi;
let financeUi: FinanceUi;
let financeDetailUi: FinanceDetailUi;
let predictionsUi: PredictionsUi;
let valueUi: ValueUi;

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
  controlUi = await import("@/components/control-room");
  healthUi = await import("@/components/machine-health-floor");
  approvalsParentUi = await import("@/components/approvals-parent");
  approvalsUi = await import("@/components/approvals-floor");
  buildUi = await import("@/components/build-floor");
  financeUi = await import("@/components/finance-floor");
  financeDetailUi = await import("@/components/finance-detail");
  predictionsUi = await import("@/components/predictions-floor");
  valueUi = await import("@/components/value-stat");
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
    assert.equal(latestTimestamp([]), null);
    assert.equal(latestTimestamp([null, "", "not a time"]), null);
    assert.equal(
      latestTimestamp(["2026-11-02T18:00:00.000Z", "2026-11-02T20:04:00.000Z", "nope"]),
      "2026-11-02T20:04:00.000Z",
    );
    assert.equal(layoutSource.includes("new Date()"), false);
    assert.equal(layoutSource.includes("Date.now"), false);
    assert.equal(latestTimestamp([null, "", "2026-10-28"]), null);
    assert.equal(
      latestTimestamp(["2026-10-11T17:00:00.000Z", "2026-10-12T15:00:00.000Z"]),
      "2026-10-12T15:00:00.000Z",
    );
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

const STAMP = "2026-11-02T20:04:00.000Z";
const CONTROL_NOW = new Date("2026-11-02T20:12:00.000Z");

describe("Control, Health, Approvals, and Build on the shared layout", () => {
  it("keeps the control parent to child cards and stamps the header from the data", () => {
    const parent = render(
      createElement(controlUi.ControlParent, {
        now: CONTROL_NOW,
        view: {
          approvals: {
            pending: 1,
            doneToday: 0,
            pendingRows: [{ title: "Send", agent: "Architect", status: "pending", at: STAMP }],
            doneTodayRows: [],
          },
          agents: [
            { id: "robinhood-ops", name: "Robinhood Ops", at: STAMP, source: "fills" },
            { id: "architect", name: "Architect", at: null, source: null },
          ],
          feeds: [
            {
              id: "coingecko",
              label: "CoinGecko",
              band: "quote",
              at: STAMP,
              checked: true,
              freshness: "green",
            },
            { id: "github", label: "GitHub", band: "quote", at: null, checked: true, freshness: "red" },
          ],
        },
      }),
    );
    assert.match(parent, /href="\/"/);
    assert.match(parent, /href="\/n\/control\/approvals"/);
    assert.match(parent, /href="\/n\/control\/bots"/);
    assert.match(parent, /href="\/n\/control\/feeds"/);
    assert.match(parent, /href="\/tv"/);
    assert.match(parent, /Updated 2:04 PM CT/);
    assert.equal(parent.includes("Open the queue"), false);
    assert.equal(parent.includes("CoinGecko"), false);

    const bots = render(
      createElement(controlUi.ControlChild, {
        view: "bots",
        now: CONTROL_NOW,
        room: {
          approvals: null,
          agents: [
            { id: "robinhood-ops", name: "Robinhood Ops", at: STAMP, source: "fills" },
            { id: "architect", name: "Architect", at: null, source: null },
          ],
          feeds: [],
        },
      }),
    );
    assert.match(bots, /Robinhood Ops/);
    assert.match(bots, /Architect/);
    assert.match(bots, new RegExp(EMPTY_CARD_NOTE));
    assert.match(bots, /data-card="empty"/);
    assert.match(bots, /Updated 2:04 PM CT/);
    assert.match(bots, /href="\/n\/control"/);

    const feeds = render(
      createElement(controlUi.ControlChild, {
        view: "feeds",
        now: CONTROL_NOW,
        room: {
          approvals: null,
          agents: [],
          feeds: [
            {
              id: "xrp-closes",
              label: "XRP daily closes",
              band: "history",
              at: STAMP,
              checked: true,
              freshness: "amber",
            },
            { id: "github", label: "GitHub", band: "quote", at: null, checked: true, freshness: "red" },
          ],
        },
      }),
    );
    assert.match(feeds, /XRP daily closes/);
    assert.match(feeds, /GitHub/);
    assert.match(feeds, new RegExp(EMPTY_CARD_NOTE));
    assert.match(feeds, /node-card-equal/);
  });

  it("boxes a missing health score and omits Updated when the report has no timestamp", () => {
    const html = render(
      createElement(healthUi.HealthFloor, {
        report: {
          percent: 80,
          ready: 1,
          tone: "steady",
          scores: [
            {
              id: "allocation",
              label: "Allocation",
              short: "Balance",
              detail: "100% minus the normalized gap from an equal one-ninth weight.",
              inputs: "SUI 10.0%",
              percent: 80,
            },
            {
              id: "growth",
              label: "Growth",
              short: "Growth",
              detail: "Names up since the first buy, out of the names with a gain.",
              inputs: "not connected",
              percent: null,
            },
          ],
        },
      }),
    );
    assert.match(html, /Allocation/);
    assert.match(html, /80%/);
    assert.match(html, /Growth/);
    assert.match(html, /data-card="empty"/);
    assert.match(html, new RegExp(EMPTY_CARD_NOTE));
    assert.match(html, /node-card-equal/);
    assert.match(html, /data-node-status="partial"/);
    assert.equal(html.includes("Updated"), false);
    assert.match(html, /href="\/"/);
  });

  it("keeps approvals to two child cards and locks a money request in Public view", () => {
    const parent = render(
      createElement(approvalsParentUi.ApprovalsParent, {
        pending: 1,
        done: 0,
        updatedAt: STAMP,
      }),
    );
    assert.match(parent, /href="\/n\/approvals\/pending"/);
    assert.match(parent, /href="\/n\/approvals\/done"/);
    assert.match(parent, /Updated 2:04 PM CT/);
    assert.equal(parent.includes("Send"), false);

    const quiet = render(createElement(approvalsParentUi.ApprovalsParent, { pending: 0, done: 0 }));
    assert.equal(quiet.includes("Updated"), false);

    const locked = render(
      createElement(approvalsUi.ApprovalList, {
        mode: "pending",
        publicMode: true,
        items: [
          {
            id: "appr_publicmodeexample",
            createdAt: STAMP,
            requestedByAgent: "Robinhood Ops",
            title: "Send $1,200",
            detail: "Wire $40 today",
            category: "transfer",
            node: null,
            status: "pending",
            decidedBy: null,
            decidedAt: null,
            decisionNote: null,
            idempotencyKey: "floor-desk:public",
          },
        ],
      }),
    );
    assert.match(locked, /data-lock-badge/);
    assert.match(locked, /data-node-status="partial"/);
    assert.match(locked, /node-card-equal/);
    assert.match(locked, /Transfer/);
    assert.equal(locked.includes("$"), false);
    assert.equal(locked.includes("1,200"), false);
    assert.equal(locked.includes("40"), false);
    assert.match(locked, /Updated 2:04 PM CT/);

    const empty = render(createElement(approvalsUi.ApprovalList, { mode: "pending", items: [] }));
    assert.match(empty, /data-node-status="partial"/);
    assert.match(empty, /data-card="empty"/);
    assert.match(empty, new RegExp(EMPTY_CARD_NOTE));
    assert.equal(empty.includes("Nothing is waiting"), false);
    assert.equal(empty.includes("Updated"), false);
  });

  it("keeps the build parent to child cards and locks a pull request in Public view", () => {
    const item = {
      id: "platform-public",
      title: "Public mode",
      node: "platform" as const,
      prNumber: 80,
      status: "in_progress" as const,
      steps: [
        { id: "spec", label: "spec written", done: true },
        { id: "pr-open", label: "PR open", done: true },
        { id: "tests-build", label: "local tests and build pass", done: false },
      ],
      nextStep: "Verify on a phone",
      sortOrder: 0,
      updatedAt: STAMP,
    };
    const section = {
      id: "platform",
      label: "Platform",
      percent: 40,
      counts: { live: 0, inProgress: 1, queued: 0 },
      items: [item],
    };
    const parent = render(
      createElement(buildUi.BuildParent, {
        totalPercent: 40,
        githubFresh: true,
        sections: [section],
        notes: ["Next: ship the tracker"],
        backup: {
          id: "backup",
          href: "/n/backup",
          name: "Backup",
          headline: "not recorded",
          status: "not recorded",
          live: false,
          tone: "",
        },
      }),
    );
    assert.match(parent, /href="\/n\/build\/platform"/);
    assert.match(parent, /href="\/n\/ideas"/);
    assert.match(parent, /Future Ideas/);
    assert.match(parent, /Crawl Walk Run/);
    assert.match(parent, /Backup/);
    assert.match(parent, /40%/);
    assert.match(parent, /Next: ship the tracker/);
    assert.match(parent, /Updated 2:04 PM CT/);
    assert.equal(parent.includes("Verify on a phone"), false);
    assert.equal(parent.includes("#80"), false);

    const body = render(
      createElement(buildUi.BuildSectionBody, {
        section,
        now: CONTROL_NOW,
        showPr: false,
        lessonHrefs: { "platform-public": "/n/lessons#LL-023" },
      }),
    );
    assert.match(body, /Public mode/);
    assert.match(body, /Verify on a phone/);
    assert.match(body, /Lesson/);
    assert.match(body, /data-lock-badge/);
    assert.match(body, /node-card-equal/);
    assert.match(body, /id="platform-public"/);
    assert.equal(body.includes("#80"), false);
    assert.equal(body.includes("pull/80"), false);
    assert.equal(body.includes("$"), false);
    assert.match(body, /Updated 2:04 PM CT/);

    const bare = render(
      createElement(buildUi.BuildSectionBody, {
        section: { ...section, percent: null, items: [], counts: { live: 0, inProgress: 0, queued: 0 } },
        now: CONTROL_NOW,
        showPr: false,
      }),
    );
    assert.match(bare, /data-card="empty"/);
    assert.match(bare, new RegExp(EMPTY_CARD_NOTE));
    assert.equal(bare.includes("Updated"), false);
    assert.equal(bare.includes("Nothing queued"), false);
  });
});

describe("Crypto, AI Stocks, Finance, and Fights on the shared layout", () => {
  it("keeps the dollar value above the live price and boxes a missing position", () => {
    const held = render(
      createElement(valueUi.ValueStatCard, {
        label: "NVDA",
        href: "/n/ai-stocks/nvda",
        model: { headline: "$12,400", priceLine: "$142.10 live", label: null },
      }),
    );
    assert.match(held, /node-card-value/);
    assert.match(held, /node-card-price/);
    assert.match(held, /\$12,400/);
    assert.match(held, /\$142\.10 live/);
    assert.match(held, /href="\/n\/ai-stocks\/nvda"/);
    assert.ok(held.indexOf("$12,400") < held.indexOf("$142.10 live"));

    const quiet = render(
      createElement(valueUi.ValueStatCard, {
        label: "SUI",
        model: { headline: null, priceLine: "$2.184 live", label: "no position" },
      }),
    );
    assert.match(quiet, /no position/);
    assert.match(quiet, /\$2\.184 live/);
    assert.equal(quiet.includes("$0"), false);
    assert.ok(quiet.indexOf("no position") < quiet.indexOf("$2.184 live"));

    const empty = render(
      createElement(valueUi.ValueStatCard, {
        label: "TSM",
        model: { headline: null, priceLine: null, label: "not connected" },
      }),
    );
    assert.match(empty, /data-card="empty"/);
    assert.match(empty, new RegExp(EMPTY_CARD_NOTE));
    assert.equal(empty.includes("not connected"), false);
    assert.equal(empty.includes("$"), false);
  });

  it("stamps finance from the snapshot clock and locks a public dollar card", async () => {
    const view = await import("@/lib/finance/view");
    const fixture = await import("@/lib/finance/fixture");
    const cards = view.financeCards(fixture.SYNTHETIC_FINANCE_SNAPSHOT);
    const html = render(
      createElement(financeUi.FinanceFloor, {
        asOf: fixture.SYNTHETIC_FINANCE_SNAPSHOT.asOf,
        stale: false,
        cards,
        updatedAt: STAMP,
      }),
    );
    assert.match(html, /href="\/"/);
    assert.match(html, /href="\/n\/finance\/debt"/);
    assert.match(html, /Updated 2:04 PM CT/);
    assert.match(html, /partial/);
    assert.match(html, /node-card-equal/);
    assert.equal(html.includes("$0"), false);

    const dateOnly = render(
      createElement(financeUi.FinanceFloor, {
        asOf: "2026-10-07",
        stale: true,
        cards,
        updatedAt: "2026-10-07",
      }),
    );
    assert.equal(dateOnly.includes("Updated"), false);

    const locked = render(
      createElement(financeUi.FinanceFloor, {
        asOf: fixture.SYNTHETIC_FINANCE_SNAPSHOT.asOf,
        stale: false,
        cards,
        publicMode: true,
      }),
    );
    assert.match(locked, /data-lock-badge/);
    assert.equal(locked.includes("$"), false);
    assert.equal(locked.includes('href="/n/finance/debt"'), false);

    const detail = view.financeDetail(fixture.SYNTHETIC_FINANCE_SNAPSHOT, "debt");
    assert.ok(detail);
    const debt = render(
      createElement(financeDetailUi.FinanceDetail, {
        detail: detail!,
        asOf: "2026-10-01",
        stale: true,
        updatedAt: STAMP,
      }),
    );
    assert.match(debt, /not linked/);
    assert.match(debt, /APR unknown/);
    assert.match(debt, /stale/);
    assert.match(debt, /Updated 2:04 PM CT/);
    assert.match(debt, /node-card-equal/);
    assert.equal(debt.includes("$0"), false);
  });

  it("keeps fight desk to child cards and hides dollars in Public view", () => {
    const floor = render(
      createElement(predictionsUi.PredictionsFloor, {
        ledger: null,
        bookFacts: { open: 2, deskOpen: 2, atRiskLabel: "$4.00", recordLabel: "4-1 · 0 sold · 0 void" },
        publicMode: true,
      }),
    );
    assert.match(floor, /href="\/n\/fight-desk\/bankroll"/);
    assert.match(floor, /href="\/fights"/);
    assert.match(floor, /4-1/);
    assert.match(floor, /node-card-equal/);
    assert.equal(floor.includes("$"), false);
    assert.equal(floor.includes("Updated"), false);

    const bankroll = render(
      createElement(predictionsUi.BankrollLedgerView, {
        publicMode: true,
        deposits: [{ id: "dep", date: "2026-10-01", amount: "50.00", voidedAt: null, voidReason: null }],
        ledger: {
          start: "100.00",
          asOf: "2026-10-01",
          bankroll: "120.00",
          bankrollLabel: "$120.00",
          atRisk: "4.00",
          atRiskLabel: "$4.00",
          cash: "116.00",
          cashLabel: "$116.00",
          open: 1,
          deskOpen: 1,
          recordLabel: "4-1 · 0 sold · 0 void",
          realizedLabel: "$20.00",
          roiLabel: "+16.67%",
          suggestedStake: "1.00",
          suggestedStakeLabel: "Flat $1/fight",
          depositTotal: "50.00",
          depositTotalLabel: "+$50.00",
          depositShareLabel: "+41.67%",
          cards: [],
          tiers: [],
          before: [],
        },
      }),
    );
    assert.match(bankroll, /4-1/);
    assert.match(bankroll, /\+16\.67%/);
    assert.match(bankroll, /node-card-equal/);
    assert.equal(bankroll.includes("$"), false);
    assert.equal(bankroll.includes("50.00"), false);
    assert.equal(bankroll.includes("Updated"), false);
  });
});
