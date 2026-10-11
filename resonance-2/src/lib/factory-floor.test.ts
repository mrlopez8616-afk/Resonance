import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { NextRequest } from "next/server";
import { FactoryFloorView } from "@/components/factory-floor";
import { SystemLiveStaticSvg } from "@/components/system-live-static";
import type { CalendarEvent } from "@/data/calendar";
import { BET_TICKER, BET_VENUE, type Bet } from "@/lib/bets";
import type { BuildItem } from "@/lib/build-tracker";
import { scoreAgents, scoreApprovals, scoreFeeds, type ControlRoom } from "@/lib/control-room";
import {
  assembleFactoryFloor,
  factoryFloorLeaks,
  type FactoryFloorModel,
  type MachineHealth,
} from "@/lib/factory-floor";
import type { Lesson } from "@/lib/lessons";
import {
  publicTextLeaks,
  toPublicFloor,
  TREASURY_LINE,
  type PublicHoldingInput,
} from "@/lib/public-mode";
import { buildLiveGraph, LIVE_WALL_SLOW_MS, presentWallGraph, wallShouldUseStatic } from "@/lib/system-live";
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
    const name =
      key === "className"
        ? "class"
        : key === "fontSize"
          ? "font-size"
          : key === "strokeWidth"
            ? "stroke-width"
            : key === "textAnchor"
              ? "text-anchor"
              : key;
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

function dirtyModel(machine: MachineHealth | null = null): FactoryFloorModel {
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
  return createElement(
    "div",
    { className: "system-live-view" },
    createElement(
      "div",
      { className: "system-live-stage", "data-view": "static" },
      createElement(SystemLiveStaticSvg, {
        graph: presentWallGraph(buildLiveGraph()),
        pulse: null,
        onSelect: () => undefined,
      }),
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
    // Fixture prices are 10 then 12, so every gain is +20.0%. The wall does not hardcode it.
    assert.ok(model.nodes.every((node) => node.growth === "+20.0%"));
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
    assert.doesNotMatch(html.replace(/aria-label="[^"]*"/g, ""), /\bFinance\b/);
    assert.match(html, /viewBox="[^"]+"/);
    assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
    assert.match(html, /stroke-width="0\.02"/);
    assert.match(html, /font-size="0\.3"/);
    assert.equal(html.includes("strokeWidth"), false);
    assert.equal(html.includes("fontSize="), false);

    const poisoned = { ...model, stake: "$9" } as FactoryFloorModel;
    assert.ok(factoryFloorLeaks(poisoned).length > 0);
    const dollars = { ...model, clock: "now $4" };
    assert.ok(factoryFloorLeaks(dollars).includes("dollar-char"));
  });

  it("derives growth and the close from the inputs", () => {
    const model = assembleFactoryFloor({
      now: NOW,
      floor: toPublicFloor([
        holding("NVDA", 40),
        { ...holding("SUI", 20), firstBuyPrice: 10, livePrice: 15 },
      ]),
      buildItems: null,
      control: null,
      approvalsPending: null,
      closes: [{ day: "2026-10-10", close: 2.4 }],
      lessons: null,
      events: null,
      bets: null,
    });
    assert.equal(model.nodes.find((node) => node.ticker === "SUI")?.growth, "+50.0%");
    assert.equal(model.nodes.find((node) => node.ticker === "NVDA")?.growth, "+20.0%");
    assert.equal(model.nodes.find((node) => node.ticker === "TSM")?.weight, "not connected");
    assert.equal(model.nodes.find((node) => node.ticker === "TSM")?.growth, null);
    assert.equal(model.trigger.close, "2.40");
    assert.equal(model.trigger.versus, "above 1.55");
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
    assert.match(html, /data-machine-score[^>]*>88%</);
    assert.equal(html.includes("$"), false);
    assert.equal(html.includes("coming soon"), false);
  });

  it("fills the machine slot with the overall percent and five sub-scores", () => {
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
      machine: {
        score: 82,
        label: "4 of 5",
        tone: "steady",
        parts: [
          { label: "Balance", score: 91 },
          { label: "Growth", score: 66.6 },
          { label: "Feeds $4", score: null },
          { label: "Build", score: 40 },
          { label: "Agents", score: 50 },
        ],
      },
    });
    assert.equal(model.machine?.score, 82);
    assert.deepEqual(
      model.machine?.parts?.map((part) => [part.label, part.score]),
      [
        ["Balance", 91],
        ["Growth", 67],
        ["Feeds", null],
        ["Build", 40],
        ["Agents", 50],
      ],
    );
    const html = wallHtml(model);
    assert.match(html, /data-machine-score[^>]*>82%</);
    assert.match(html, /data-machine-part="Balance"[^>]*>91%</);
    assert.match(html, /data-machine-part="Growth"[^>]*>67%</);
    assert.match(html, /data-machine-part="Feeds"[^>]*>not connected</);
    assert.match(html, /data-machine-part="Build"[^>]*>40%</);
    assert.match(html, /data-machine-part="Agents"[^>]*>50%</);
    assert.equal(html.includes("coming soon"), false);
    assert.equal(html.includes("$"), false);
    assert.deepEqual(factoryFloorLeaks(model), []);
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
  const markup = wallHtml(
    dirtyModel({
      score: 82,
      label: "4 of 5",
      tone: "steady",
      parts: [
        { label: "Balance", score: 91 },
        { label: "Growth", score: 67 },
        { label: "Feeds", score: 80 },
        { label: "Build", score: 40 },
        { label: "Agents", score: 50 },
      ],
    }),
  );

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
        const mapFit = (await page.evaluate(`(() => {
          const map = document.querySelector(".tv-map");
          const svg = document.querySelector(".tv-map svg");
          const treasury = document.querySelector("[data-treasury]");
          const lesson = document.querySelector('[data-panel="Lesson"]');
          if (!(map instanceof HTMLElement) || !(svg instanceof SVGSVGElement)) return { ok: false };
          if (!(treasury instanceof HTMLElement) || !(lesson instanceof HTMLElement)) return { ok: false };
          const mapBox = map.getBoundingClientRect();
          const svgBox = svg.getBoundingClientRect();
          const labels = [];
          for (const node of svg.querySelectorAll("text")) {
            const box = node.getBoundingClientRect();
            labels.push({
              text: node.textContent || "",
              width: box.width,
              height: box.height,
              inside: box.width > 8 && box.left >= mapBox.left - 1 && box.top >= mapBox.top - 1 && box.right <= mapBox.right + 1 && box.bottom <= mapBox.bottom + 1,
            });
          }
          const line = svg.querySelector("line");
          const stroke = line ? Number.parseFloat(getComputedStyle(line).strokeWidth) : 0;
          const treasuryText = treasury.querySelector(".tv-treasury-line");
          const lessonText = lesson.querySelector(".tv-copy");
          const treasuryBox = treasury.getBoundingClientRect();
          const lessonBox = lesson.getBoundingClientRect();
          const treasuryRect = treasuryText ? treasuryText.getBoundingClientRect() : null;
          const lessonRect = lessonText ? lessonText.getBoundingClientRect() : null;
          return {
            ok: true,
            svgInside: svgBox.left >= mapBox.left - 1 && svgBox.top >= mapBox.top - 1 && svgBox.right <= mapBox.right + 1 && svgBox.bottom <= mapBox.bottom + 1,
            viewBox: svg.getAttribute("viewBox"),
            aspect: svg.getAttribute("preserveAspectRatio"),
            stroke,
            labels,
            treasurySize: treasuryText ? Number.parseFloat(getComputedStyle(treasuryText).fontSize) : 0,
            lessonSize: lessonText ? Number.parseFloat(getComputedStyle(lessonText).fontSize) : 0,
            treasuryInside: treasuryRect ? treasuryRect.left >= treasuryBox.left - 1 && treasuryRect.top >= treasuryBox.top - 1 && treasuryRect.right <= treasuryBox.right + 1 && treasuryRect.bottom <= treasuryBox.bottom + 1 : false,
            lessonInside: lessonRect ? lessonRect.left >= lessonBox.left - 1 && lessonRect.top >= lessonBox.top - 1 && lessonRect.right <= lessonBox.right + 1 && lessonRect.bottom <= lessonBox.bottom + 1 : false,
          };
        })()`)) as {
          ok: boolean;
          svgInside?: boolean;
          viewBox?: string | null;
          aspect?: string | null;
          stroke?: number;
          labels?: { text: string; width: number; height: number; inside: boolean }[];
          treasurySize?: number;
          lessonSize?: number;
          treasuryInside?: boolean;
          lessonInside?: boolean;
        };
        assert.equal(mapFit.ok, true);
        assert.equal(mapFit.svgInside, true);
        assert.equal(mapFit.aspect, "xMidYMid meet");
        assert.ok(mapFit.viewBox && mapFit.viewBox.split(" ").length === 4);
        assert.ok((mapFit.stroke ?? 0) > 0 && (mapFit.stroke ?? 0) < 6, JSON.stringify(mapFit));
        assert.ok((mapFit.labels ?? []).length > 3);
        for (const label of mapFit.labels ?? []) {
          assert.equal(label.inside, true, `${label.text} ${label.width}x${label.height}`);
          assert.ok(label.height >= 10 && label.height <= 42, `${label.text} ${label.width}x${label.height}`);
        }
        assert.ok((mapFit.treasurySize ?? 0) >= 18, String(mapFit.treasurySize));
        assert.ok((mapFit.lessonSize ?? 0) >= 15, String(mapFit.lessonSize));
        assert.equal(mapFit.treasuryInside, true);
        assert.equal(mapFit.lessonInside, true);
      } finally {
        await browser.close();
      }
    });
  }

  it("clamps a long lesson inside the card at both TV sizes", async () => {
    const { chromium } = await import("playwright");
    const base = dirtyModel();
    assert.equal(base.lesson.status, "entry");
    const body =
      "The wall stays readable from the couch when a lesson runs long. Keep each sentence on the card. Leave private notes off this screen. Stop the body before it covers the next panel. A second paragraph would have spilled past the card edge. The clamp keeps the last visible line and marks the rest. LONG_LESSON_TAIL";
    const model: FactoryFloorModel = {
      ...base,
      lesson: { ...base.lesson, body },
    };
    const markup = wallHtml(model);
    assert.equal(markup.includes("LONG_LESSON_TAIL"), true);
    assert.equal(markup.includes("$"), false);
    const browser = await chromium.launch({ headless: true });
    try {
      for (const size of [
        { width: 1920, height: 1080, shot: "tv-lesson-long-1920x1080" },
        { width: 1280, height: 720, shot: null },
      ]) {
        const page = await browser.newPage({
          viewport: { width: size.width, height: size.height },
          deviceScaleFactor: 1,
        });
        await page.setContent(
          `<!doctype html><html class="tv-page"><head><style>${css}</style></head><body>${markup}</body></html>`,
          { waitUntil: "load" },
        );
        const fit = (await page.evaluate(() => {
          const lesson = document.querySelector('[data-panel="Lesson"]');
          const copy = lesson?.querySelector(".tv-copy");
          if (!(lesson instanceof HTMLElement) || !(copy instanceof HTMLElement) || !copy.parentElement) {
            return { ok: false };
          }
          const lessonBox = lesson.getBoundingClientRect();
          const copyBox = copy.getBoundingClientRect();
          const probe = copy.cloneNode(true);
          if (!(probe instanceof HTMLElement)) return { ok: false };
          probe.style.setProperty("-webkit-line-clamp", "unset");
          probe.style.setProperty("line-clamp", "unset");
          probe.style.display = "block";
          probe.style.maxHeight = "none";
          probe.style.position = "absolute";
          probe.style.visibility = "hidden";
          probe.style.height = "auto";
          probe.style.width = `${copy.clientWidth}px`;
          copy.parentElement.appendChild(probe);
          const fullHeight = probe.getBoundingClientRect().height;
          probe.remove();
          const style = getComputedStyle(copy);
          return {
            ok: true,
            inside:
              copyBox.left >= lessonBox.left - 1 &&
              copyBox.top >= lessonBox.top - 1 &&
              copyBox.right <= lessonBox.right + 1 &&
              copyBox.bottom <= lessonBox.bottom + 1,
            clamped: fullHeight > copyBox.height + 4,
            lineClamp: style.getPropertyValue("-webkit-line-clamp"),
            copyH: copyBox.height,
            fullHeight,
          };
        })) as {
          ok: boolean;
          inside?: boolean;
          clamped?: boolean;
          lineClamp?: string;
          copyH?: number;
          fullHeight?: number;
        };
        if (size.shot) {
          mkdirSync("/opt/cursor/artifacts", { recursive: true });
          await page.screenshot({ path: `/opt/cursor/artifacts/${size.shot}.png` });
        }
        assert.equal(fit.ok, true, `${size.width}x${size.height}`);
        assert.equal(fit.inside, true, JSON.stringify(fit));
        assert.equal(fit.clamped, true, JSON.stringify(fit));
        assert.equal(fit.lineClamp, "3");
        await page.close();
      }
    } finally {
      await browser.close();
    }
  });
});
