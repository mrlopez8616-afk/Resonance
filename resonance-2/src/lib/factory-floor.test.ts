import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { NextRequest } from "next/server";
import { FactoryFloorView } from "@/components/factory-floor";
import type { CalendarEvent } from "@/data/calendar";
import { BET_TICKER, BET_VENUE, type Bet } from "@/lib/bets";
import type { BuildItem } from "@/lib/build-tracker";
import { scoreAgents, scoreApprovals, scoreFeeds, type ControlRoom } from "@/lib/control-room";
import {
  assembleFactoryFloor,
  factoryFloorLeaks,
  type FactoryFloorModel,
} from "@/lib/factory-floor";
import type { Lesson } from "@/lib/lessons";
import {
  publicTextLeaks,
  toPublicFloor,
  TREASURY_LINE,
  type PublicHoldingInput,
} from "@/lib/public-mode";
import { buildLiveGraph, LIVE_KIND_COLOR, LIVE_WALL_SLOW_MS, presentWallGraph, wallShouldUseStatic } from "@/lib/system-live";
import {
  acquireScreenWakeLock,
  shouldFullReload,
  shouldPollRefresh,
  shouldReacquireWakeLock,
  TV_RELOAD_MS,
  wakeLockFallbackNeeded,
  wakeLockSupported,
  type ScreenWakeLock,
} from "@/lib/tv-wake";
import { proxy } from "@/proxy";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = new Date("2026-10-11T18:00:00.000Z");
const NINE = ["SUI", "PWR", "VRT", "GEV", "CEG", "NVDA", "TSM", "TSLA", "SPCX"] as const;

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  if (typeof type !== "string") return render((node.props as { children?: ReactNode }).children);
  const props = node.props as Record<string, unknown>;
  const attrs: string[] = [];
  for (const key of Object.keys(props).sort()) {
    if (key === "children") continue;
    const value = props[key];
    if (value == null || value === false || typeof value === "function") continue;
    const name = key === "className" ? "class" : key;
    if (value === true) {
      attrs.push(` ${name}`);
      continue;
    }
    attrs.push(` ${name}="${escapeText(String(value)).replace(/"/g, "&quot;")}"`);
  }
  const children = render(props.children as ReactNode);
  return `<${type}${attrs.join("")}>${children}</${type}>`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function holding(ticker: string, value: number): PublicHoldingInput {
  return {
    ticker,
    value,
    firstBuyPrice: 10,
    livePrice: 12,
    daily: [
      { day: "2026-09-01", value: value / 2, buy: true },
      { day: "2026-10-01", value, buy: true },
    ],
  };
}

function lesson(id: string, publicSafe: boolean, text: string, updatedAt: string): Lesson {
  return {
    id,
    date: "2026-10-08",
    title: id === "LL-030" ? "Ship the wall" : "Private note",
    category: "build",
    whatChanged: "Shipped the screen.",
    why: "Founder's call.",
    lesson: text,
    publicSafe,
    sources: ["owner notebook"],
    buildItemId: null,
    prNumber: null,
    createdAt: updatedAt,
    updatedAt,
  };
}

function catalyst(id: string, start: string, title: string, node: CalendarEvent["node"]): CalendarEvent {
  return {
    id,
    kind: "catalyst",
    node,
    start,
    title,
    status: "confirmed",
    writer: "agent",
    sourceUrl: "https://example.com/catalyst",
  };
}

function bet(id: string, pick: string, tier: Bet["tier"], stake: string): Bet {
  return {
    id,
    event: "UFC 333",
    fight: pick,
    fightSlug: id,
    pick,
    stake,
    oddsPct: 55,
    payout: "$400",
    status: "open",
    tier,
    venue: BET_VENUE,
    ticker: BET_TICKER,
    time: "2026-11-14T19:00:00-06:00",
    note: "Ticket $250",
  };
}

function room(): ControlRoom {
  return {
    approvals: scoreApprovals(
      [
        {
          status: "pending",
          createdAt: "2026-10-11T16:00:00.000Z",
          decidedAt: null,
          title: "Send $1,200",
          agent: "Robinhood Ops",
        },
      ],
      NOW,
    ),
    agents: scoreAgents([
      { source: "fills:robinhood", at: "2026-10-11T17:50:00.000Z" },
      { source: "finance_snapshot", at: "2026-10-11T17:00:00.000Z" },
    ]),
    feeds: scoreFeeds(
      {
        coingecko: "2026-10-11T17:59:00.000Z",
        finance: "2026-10-11T17:00:00.000Z",
        yahoo: "2026-10-10T12:00:00.000Z",
        health: null,
      },
      { coingecko: true, finance: true, yahoo: true, health: true },
      NOW,
    ),
  };
}

function dirtyModel(): FactoryFloorModel {
  const values = [100, 80, 70, 60, 50, 40, 30, 20, 10];
  const floor = toPublicFloor([
    ...NINE.map((ticker, index) => holding(ticker, values[index] ?? 1)),
    holding("XRP", 5000),
  ]);
  const wire: BuildItem = {
    id: "wire",
    title: "Wire $40",
    node: "platform",
    prNumber: null,
    status: "in_progress",
    steps: [
      { id: "spec", label: "spec written", done: true },
      { id: "pr-open", label: "PR open", done: false },
    ],
    nextStep: "Send $40",
    sortOrder: 1,
    updatedAt: "2026-10-11T18:00:00.000Z",
  };
  const financeItem: BuildItem = {
    id: "books",
    title: "Finance review",
    node: "finance",
    prNumber: null,
    status: "in_progress",
    steps: [
      { id: "spec", label: "spec written", done: true },
      { id: "pr-open", label: "PR open", done: true },
    ],
    nextStep: "Post the snapshot",
    sortOrder: 2,
    updatedAt: "2026-10-11T18:00:00.000Z",
  };
  return assembleFactoryFloor({
    now: NOW,
    floor,
    buildItems: [wire, financeItem],
    control: room(),
    approvalsPending: 2,
    closes: [{ day: "2026-10-10", close: 1.6 }],
    lessons: [
      lesson("LL-021", false, "Keep this off the shared screen.", "2026-10-10T15:00:00.000Z"),
      lesson("LL-031", true, "Moved by $1,240.", "2026-10-10T16:00:00.000Z"),
      lesson("LL-030", true, "Keep the screen readable from the couch.", "2026-10-09T15:00:00.000Z"),
    ],
    events: [
      catalyst("c1", "2026-10-12T15:00:00-05:00", "Pays $12", "NVDA"),
      catalyst("c2", "2026-10-13T15:00:00-05:00", "Sui unlock", "SUI"),
      catalyst("c3", "2026-10-20T15:00:00-05:00", "TSM print", "TSM"),
      catalyst("c4", "2026-11-01T15:00:00-05:00", "NVDA call", "NVDA"),
      catalyst("c5", "2026-11-15T15:00:00-06:00", "CEG window", "CEG"),
      catalyst("c6", "2026-12-01T15:00:00-06:00", "Sixth should hide", "TSLA"),
      {
        id: "ufc-333",
        kind: "fight",
        lane: "fights",
        eventSlug: "ufc-333",
        start: "2026-11-14T19:00:00-06:00",
        title: "UFC 333",
        status: "scheduled",
        writer: "founder",
      },
    ],
    bets: [
      bet("adesanya", "Adesanya $40", "STRONG", "$250"),
      bet("pereira", "Pereira", "LEAN", "$100"),
      bet("holloway", "Holloway", undefined, "$80"),
      bet("winner", "Winner $20", undefined, "$60"),
    ],
    machine: null,
  });
}

function WallMap() {
  const graph = presentWallGraph(buildLiveGraph());
  const xs = graph.points.map((point) => point.x);
  const zs = graph.points.map((point) => point.z);
  const minX = Math.min(...xs) - 1.35;
  const maxX = Math.max(...xs) + 1.35;
  const minZ = Math.min(...zs) - 1.15;
  const maxZ = Math.max(...zs) + 1.15;
  const labeled = graph.points.filter(
    (point) => (point.kind === "hub" || point.kind === "node") && point.label,
  );
  return createElement(
    "div",
    { className: "system-live-view" },
    createElement(
      "div",
      { className: "system-live-stage", "data-view": "static" },
      createElement(
        "svg",
        {
          className: "system-live-svg",
          viewBox: `${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`,
          role: "img",
          "aria-label": "System map",
        },
        createElement("rect", {
          x: minX,
          y: minZ,
          width: maxX - minX,
          height: maxZ - minZ,
          fill: "#070b14",
        }),
        graph.edges.map((edge) => {
          const start = graph.points.find((point) => point.id === edge.from);
          const end = graph.points.find((point) => point.id === edge.to);
          if (!start || !end) return null;
          return createElement("line", {
            key: edge.id,
            x1: start.x,
            y1: start.z,
            x2: end.x,
            y2: end.z,
            stroke: "#35506e",
            strokeWidth: 0.025,
          });
        }),
        graph.points.map((point) =>
          createElement("circle", {
            key: point.id,
            cx: point.x,
            cy: point.z,
            r: point.kind === "hub" ? 0.2 : point.kind === "node" ? 0.13 : 0.07,
            fill: LIVE_KIND_COLOR[point.kind],
          }),
        ),
        labeled.map((point) =>
          createElement(
            "text",
            {
              key: `${point.id}-label`,
              x: point.x,
              y: point.z - 0.28,
              textAnchor: "middle",
              fill: "#d5deea",
              fontSize: "0.22",
            },
            point.label,
          ),
        ),
      ),
    ),
  );
}

function wallHtml(model: FactoryFloorModel): string {
  return render(createElement(FactoryFloorView, { model, map: createElement(WallMap) }));
}

describe("factory floor public default", () => {
  it("strips dollars before render and keeps the public panels", () => {
    const model = dirtyModel();
    assert.deepEqual(factoryFloorLeaks(model), []);
    assert.equal(model.treasury, TREASURY_LINE);
    assert.equal(model.nodes.length, 9);
    assert.equal(model.nodes.some((node) => node.ticker === "XRP"), false);
    assert.ok(model.nodes.every((node) => node.weight.endsWith("%")));
    assert.equal(model.build.percent, "50%");
    assert.deepEqual(
      model.build.items.map((item) => item.title),
      ["Wire"],
    );
    assert.equal(model.approvalsPending, 2);
    assert.equal(model.control.feeds.some((feed) => feed.id === "finance" || feed.label === "Finance"), false);
    assert.equal(model.control.agents.some((agent) => agent.name === "Finance Desk"), false);
    assert.ok(model.control.agents.some((agent) => agent.name === "Robinhood Ops"));
    assert.ok(model.control.feeds.some((feed) => feed.freshness === "green"));
    assert.equal(model.trigger.close, "1.60");
    assert.equal(model.trigger.versus, "above 1.55");
    assert.equal(model.trigger.streak, "1 of 5");
    assert.equal(model.catalysts.items.length, 5);
    assert.equal(
      model.catalysts.items.some((item) => item.title === "Sixth should hide"),
      false,
    );
    assert.equal(model.catalysts.items[0]?.title, "Pays");
    assert.equal(model.lesson.status, "entry");
    assert.equal(model.lesson.title, "Ship the wall");
    assert.equal(model.fight.status, "card");
    assert.equal(model.fight.title, "UFC 333");
    assert.deepEqual(
      model.fight.plays?.map((play) => play.pick),
      ["Adesanya", "Pereira", "Holloway"],
    );
    assert.equal(model.fight.plays?.[0]?.tier, "STRONG");
    assert.equal(model.machine, null);
    assert.equal(model.showMachine, true);

    const html = wallHtml(model);
    assert.equal(html.includes("$"), false);
    assert.deepEqual(publicTextLeaks(html), []);
    assert.equal(html.includes("LL-021"), false);
    assert.equal(html.includes("Private note"), false);
    assert.equal(html.includes("1,200"), false);
    assert.equal(html.includes("Finance Desk"), false);
    assert.equal(html.includes("Finance review"), false);
    assert.equal(html.includes("$250"), false);
    assert.equal(html.includes("Ticket"), false);
    assert.match(html, /Powered by a digital asset treasury/);
    assert.match(html, /data-approvals[^>]*>2</);
    assert.match(html, /coming soon/);
    assert.match(html, />PLAY</);
    assert.match(html, /Adesanya/);
    assert.match(html, /1\.55/);
    assert.match(html, /1 of 5/);
    assert.match(html, /Ship the wall/);
    assert.doesNotMatch(html, /\bFinance\b/);

    const poisoned = { ...model, stake: "$9" } as FactoryFloorModel;
    assert.ok(factoryFloorLeaks(poisoned).length > 0);
    const dollars = { ...model, clock: "now $4" };
    assert.ok(factoryFloorLeaks(dollars).includes("dollar-char"));
  });

  it("says not connected when a source is missing and never invents a value", () => {
    const model = assembleFactoryFloor({
      now: NOW,
      floor: null,
      buildItems: null,
      control: null,
      approvalsPending: null,
      closes: null,
      lessons: null,
      events: null,
      bets: null,
      machine: { score: Number.NaN, label: "Steady", tone: "steady" },
    });
    assert.ok(model.nodes.every((node) => node.weight === "not connected" && node.growth === null));
    assert.equal(model.build.status, "down");
    assert.equal(model.control.status, "down");
    assert.equal(model.approvalsPending, null);
    assert.equal(model.trigger.status, "down");
    assert.equal(model.trigger.close, "not connected");
    assert.equal(model.trigger.line, "1.55");
    assert.equal(model.catalysts.status, "down");
    assert.equal(model.lesson.status, "down");
    assert.equal(model.fight.status, "down");
    assert.equal(model.machine, null);
    const html = wallHtml(model);
    assert.equal(html.includes("$"), false);
    assert.match(html, /not connected/);
    assert.match(html, /coming soon/);
    assert.deepEqual(factoryFloorLeaks(model), []);
  });

  it("accepts a machine score through the reserved slot", () => {
    const model = assembleFactoryFloor({
      now: NOW,
      floor: null,
      buildItems: null,
      control: null,
      approvalsPending: 0,
      closes: null,
      lessons: null,
      events: null,
      bets: null,
      machine: { score: 88.4, label: "Steady $4", tone: "steady" },
    });
    assert.deepEqual(model.machine, { score: 88, label: "Steady", tone: "steady" });
    const html = wallHtml(model);
    assert.match(html, /data-machine-score[^>]*>88</);
    assert.equal(html.includes("$"), false);
    assert.equal(html.includes("coming soon"), false);
  });
});

describe("factory floor auth", () => {
  it("sends a signed-out request to /login?next=/tv", async () => {
    const keys = ["AUTH_PASSWORD_HASH", "AUTH_TOTP_SECRET", "AUTH_SESSION_SECRET"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.AUTH_PASSWORD_HASH = "hash-sentinel-value-not-real";
    process.env.AUTH_TOTP_SECRET = "totp-sentinel-value-not-real";
    process.env.AUTH_SESSION_SECRET = "session-sentinel-value-not-real";
    try {
      const page = await proxy(new NextRequest("https://resonance.test/tv"));
      assert.equal(page.status, 307);
      const location = new URL(page.headers.get("location") ?? "");
      assert.equal(location.pathname, "/login");
      assert.equal(location.searchParams.get("next"), "/tv");
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("requires the owner on the page", () => {
    const source = readFileSync(join(root, "src/app/tv/page.tsx"), "utf8");
    assert.match(source, /requireRole\("owner"\)/);
    assert.match(source, /loadFactoryFloor/);
  });
});

describe("factory floor wake lock", () => {
  it("uses the muted video when the screen lock is missing, refused, or already released", async () => {
    assert.equal(wakeLockSupported({}), false);
    assert.equal(await acquireScreenWakeLock({}), null);
    assert.equal(wakeLockFallbackNeeded(null), true);
    assert.equal(wakeLockFallbackNeeded(undefined), true);
    assert.equal(wakeLockFallbackNeeded({ released: true }), true);
    assert.equal(wakeLockFallbackNeeded({ released: false }), false);

    const refused = {
      wakeLock: {
        request: async () => {
          throw new Error("not allowed");
        },
      },
    };
    assert.equal(await acquireScreenWakeLock(refused), null);

    const released: ScreenWakeLock = {
      released: true,
      release: async () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    assert.equal(
      await acquireScreenWakeLock({ wakeLock: { request: async () => released } }),
      null,
    );

    const held: ScreenWakeLock = { ...released, released: false };
    const lock = await acquireScreenWakeLock({ wakeLock: { request: async () => held } });
    assert.equal(lock, held);
    assert.equal(wakeLockFallbackNeeded(lock), false);
  });

  it("reacquires only while visible, and skips refresh and reload while offline", () => {
    assert.equal(shouldReacquireWakeLock("visible"), true);
    assert.equal(shouldReacquireWakeLock("hidden"), false);
    assert.equal(shouldPollRefresh(true), true);
    assert.equal(shouldPollRefresh(false), false);
    assert.equal(shouldFullReload(TV_RELOAD_MS, true), true);
    assert.equal(shouldFullReload(TV_RELOAD_MS - 1, true), false);
    assert.equal(shouldFullReload(TV_RELOAD_MS + 1, false), false);
    assert.equal(shouldFullReload(Number.NaN, true), false);
  });
});

describe("factory floor map fallback", () => {
  it("uses the static map when WebGL is out or the 3D view is slow, and blanks Finance", () => {
    assert.equal(wallShouldUseStatic({ preferStatic: true, painted: true, elapsedMs: 0 }), true);
    assert.equal(wallShouldUseStatic({ preferStatic: false, painted: true, elapsedMs: 9_000 }), false);
    assert.equal(
      wallShouldUseStatic({ preferStatic: false, painted: false, elapsedMs: LIVE_WALL_SLOW_MS - 1 }),
      false,
    );
    assert.equal(
      wallShouldUseStatic({ preferStatic: false, painted: false, elapsedMs: LIVE_WALL_SLOW_MS }),
      true,
    );
    const graph = presentWallGraph(buildLiveGraph());
    for (const id of ["node:finance", "agent:finance-desk", "source:plaid"]) {
      const point = graph.points.find((item) => item.id === id);
      assert.ok(point);
      assert.equal(point.label, "");
      assert.equal(point.detail, null);
      assert.equal(point.href, null);
    }
    const crypto = graph.points.find((point) => point.id === "node:crypto");
    assert.ok(crypto && crypto.label.length > 0);
  });
});

describe("factory floor layout", () => {
  const css = readFileSync(join(root, "src/app/tv/tv.css"), "utf8");
  const markup = wallHtml(dirtyModel());

  for (const size of [
    { width: 1920, height: 1080, name: "tv-1920x1080" },
    { width: 1280, height: 720, name: "tv-1280x720" },
  ]) {
    it(`fits ${size.width}x${size.height} with no scroll`, async () => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: size.width, height: size.height },
          deviceScaleFactor: 1,
        });
        await page.setContent(
          `<!doctype html><html class="tv-page"><head><style>${css}</style></head><body>${markup}</body></html>`,
          { waitUntil: "load" },
        );
        const metrics = await page.evaluate(() => {
          const empty = {
            missing: true,
            docW: 0,
            docH: 0,
            innerW: 0,
            innerH: 0,
            wallW: 0,
            wallH: 0,
            text: "",
            outside: [],
          };
          const wall = document.querySelector("[data-tv-wall]");
          if (!(wall instanceof HTMLElement)) return empty;
          const wallBox = wall.getBoundingClientRect();
          const nodes = [
            ...document.querySelectorAll("[data-panel], .tv-node, .tv-map, .tv-header, .tv-nodes"),
          ];
          const outside = nodes.flatMap((node) => {
            if (!(node instanceof HTMLElement)) return [];
            const box = node.getBoundingClientRect();
            const past =
              box.left < wallBox.left - 1 ||
              box.top < wallBox.top - 1 ||
              box.right > wallBox.right + 1 ||
              box.bottom > wallBox.bottom + 1;
            return past ? [node.getAttribute("data-panel") || node.className] : [];
          });
          const doc = document.documentElement;
          return {
            missing: false,
            docW: doc.scrollWidth,
            docH: doc.scrollHeight,
            innerW: window.innerWidth,
            innerH: window.innerHeight,
            wallW: wallBox.width,
            wallH: wallBox.height,
            text: document.body.innerText,
            outside,
          };
        });
        mkdirSync("/opt/cursor/artifacts", { recursive: true });
        await page.screenshot({
          path: `/opt/cursor/artifacts/${size.name}.png`,
          fullPage: false,
        });
        assert.equal(metrics.missing, false);
        assert.deepEqual(metrics.outside, []);
        assert.ok(metrics.docW <= size.width + 1, JSON.stringify(metrics));
        assert.ok(metrics.docH <= size.height + 1, JSON.stringify(metrics));
        assert.ok(Math.abs((metrics.wallW ?? 0) - size.width) <= 2, JSON.stringify(metrics));
        assert.ok(Math.abs((metrics.wallH ?? 0) - size.height) <= 2, JSON.stringify(metrics));
        assert.equal(metrics.text?.includes("$"), false);
      } finally {
        await browser.close();
      }
    });
  }
});
