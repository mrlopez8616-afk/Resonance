import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { after, before, beforeEach, describe, it } from "node:test";
import { hash } from "@node-rs/argon2";
import { newDb } from "pg-mem";
import { POST } from "@/app/api/settings/public-mode/route";
import { ChildValueCard } from "@/components/child-value-card";
import type { CalendarEvent } from "@/data/calendar";
import { SESSION_COOKIE, setAuthClockForTests } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import type { BuildHomeCard, BuildSectionView } from "@/lib/build-tracker";
import { visibleLessons, type Lesson } from "@/lib/lessons";
import { holdingChildModel } from "@/lib/child-card";
import type { FitnessCard, FitnessNodeDetail } from "@/lib/fitness-board";
import { assembleLiveFace } from "@/lib/live-face";
import { setSqlClientForTests, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { hashOwnerPin } from "@/lib/owner-pin-hash";
import { writeOwnerPinHash } from "@/lib/owner-pin-store";
import {
  allocateTenths,
  formatTenths,
  gainSinceFirstBuy,
  hasMoneyText,
  indexFromValues,
  isHiddenInPublicMode,
  publicPayloadLeaks,
  publicRecordLabel,
  publicTextLeaks,
  scrubTextFields,
  PUBLIC_MODE_COOKIE,
  stripMoneyText,
  toPublicFloor,
  TREASURY_LINE,
  type PublicFloorModel,
  type PublicHoldingInput,
} from "@/lib/public-mode";

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _extensions: Record<string, (module: { _compile: (code: string, file: string) => void }, filename: string) => void>;
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
nodeModule._extensions[".css"] = (module, filename) => {
  module._compile("module.exports = new Proxy({}, { get: (_, key) => String(key) });", filename);
};
function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string; title?: string }) {
  return createElement(
    "a",
    { href: props.href ?? "", className: props.className, title: props.title },
    props.children,
  );
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
  return originalLoad(request, parent, isMain);
};

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
    const name = key === "className" ? "class" : key === "htmlFor" ? "for" : key;
    if (value === true) {
      attrs.push(` ${name}`);
      continue;
    }
    attrs.push(` ${name}="${escapeText(String(value)).replace(/"/g, "&quot;")}"`);
  }
  const children = render(props.children as ReactNode);
  if (VOID_TAGS.has(type)) return `<${type}${attrs.join("")}>`;
  return `<${type}${attrs.join("")}>${children}</${type}>`;
}

const NOW = new Date("2026-10-08T15:00:00.000Z");
const FRESH = new Date(NOW.getTime() - 30_000).toISOString();

function bookInput(
  ticker: string,
  value: number | null,
  extra: Partial<PublicHoldingInput> = {},
): PublicHoldingInput {
  return {
    ticker,
    value,
    firstBuyPrice: 10,
    livePrice: 12,
    daily: [
      { day: "2026-09-01", value: value && value > 0 ? value / 2 : 1, buy: true },
      { day: "2026-09-15", value: value && value > 0 ? value / 2 : 1, buy: false },
      { day: "2026-10-01", value: value && value > 0 ? value : 1, buy: true },
    ],
    ...extra,
  };
}

const NINE = ["SUI", "PWR", "VRT", "GEV", "CEG", "NVDA", "TSM", "TSLA", "SPCX"] as const;

function sampleBook(): PublicFloorModel {
  const values = [100, 80, 70, 60, 50, 40, 30, 20, 10];
  const inputs = NINE.map((ticker, index) => bookInput(ticker, values[index] ?? 1));
  inputs.push(bookInput("XRP", 5000, { firstBuyPrice: 0.5, livePrice: 2, daily: [] }));
  return toPublicFloor(inputs);
}

function fitnessCards(): FitnessCard[] {
  return [
    { id: "steps", title: "Steps", href: "/n/fitness/steps", headline: "8420", detail: "today" },
    { id: "runs", title: "Runs", href: "/n/fitness/runs", headline: "3.2 mi", detail: "this week" },
  ];
}

function stepsDetail(): FitnessNodeDetail {
  return {
    id: "steps",
    title: "Steps",
    headline: "8420",
    detail: "today",
    rows: [{ id: "today", primary: "8420", secondary: "steps" }],
    weeks: [],
    months: [],
    pace: [],
  };
}

function buildSection(): BuildSectionView {
  return {
    id: "platform",
    label: "Platform",
    percent: 40,
    counts: { live: 0, inProgress: 1, queued: 0 },
    items: [
      {
        id: "platform-public",
        title: "Public mode",
        node: "platform",
        prNumber: 80,
        status: "in_progress",
        steps: [
          { id: "spec", label: "spec written", done: true },
          { id: "pr-open", label: "PR open", done: true },
          { id: "tests-build", label: "local tests and build pass", done: false },
        ],
        nextStep: "Verify on a phone",
        sortOrder: 0,
        updatedAt: "2026-10-09T15:00:00.000Z",
      },
    ],
  };
}

const buildHome: BuildHomeCard = {
  unavailable: false,
  percentLabel: "40%",
  lines: ["Public mode", "in progress"],
};

function calendarEvent(): CalendarEvent {
  return {
    id: "cap-1",
    lane: "capital",
    start: "2026-10-08T15:00:00-05:00",
    title: "Wire $1,200 to operations",
    status: "scheduled",
    writer: "founder",
    note: "USD 40 left in the draft",
  };
}

function deskQuery() {
  return {
    day: "2026-10-08",
    view: "day" as const,
    lane: "" as const,
    node: "" as const,
    event: "",
  };
}

function publicLessonsHtml(): string {
  const row = (id: string, publicSafe: boolean, lesson: string): Lesson => ({
    id,
    date: "2026-10-08",
    title: id,
    category: "build",
    whatChanged: "Shipped the screen.",
    why: "Founder's call.",
    lesson,
    publicSafe,
    sources: ["owner notebook"],
    buildItemId: null,
    prNumber: null,
    createdAt: "2026-10-08T15:00:00.000Z",
    updatedAt: "2026-10-08T15:00:00.000Z",
  });
  return visibleLessons(
    [
      row("LL-021", false, "Keep this off the shared screen."),
      row("LL-030", true, "Moved by $1,240."),
      row("LL-023", true, "Group by month."),
    ],
    true,
  )
    .map((lesson) => `${lesson.id} ${lesson.title} ${lesson.whatChanged} ${lesson.why} ${lesson.lesson}`)
    .join(" ");
}

async function routeHtml(model: PublicFloorModel): Promise<{ path: string; html: string }[]> {
  const [{ BuildParent, BuildSectionBody }, floor, catalysts, { FitnessGrid }, { FitnessDetail }, { CalendarDesk }, { CalendarDayView }, system, lenses, liveGraph] =
    await Promise.all([
      import("@/components/build-floor"),
      import("@/components/public-floor"),
      import("@/components/catalyst-calendar"),
      import("@/components/fitness-grid"),
      import("@/components/fitness-detail"),
      import("@/components/calendar-desk"),
      import("@/components/calendar-day-page"),
      import("@/components/system-map"),
      import("@/data/system-map"),
      import("@/lib/system-live"),
    ]);
  const { PublicFightRecord, PublicGroupFloor, PublicHome, PublicNodePage, TreasuryCard } = floor;
  const nvda = model.aiStocks.holdings.find((holding) => holding.ticker === "NVDA") ?? null;
  const sui = model.crypto.holdings.find((holding) => holding.ticker === "SUI") ?? null;
  const scrubbed = {
    ...calendarEvent(),
    title: stripMoneyText(calendarEvent().title),
    note: stripMoneyText(calendarEvent().note ?? ""),
  };
  const moneyCatalyst = scrubTextFields({
    id: "money-catalyst",
    kind: "catalyst" as const,
    node: "NVDA" as const,
    start: "2026-10-09T15:00:00-05:00",
    title: "Pays $12",
    status: "confirmed" as const,
    writer: "agent" as const,
    sourceUrl: "https://example.com/nvda",
    note: "About $4 USD",
    allDay: true,
  });
  const catalystNow = new Date("2026-10-09T16:00:00.000Z");
  const home = render(
    createElement(
      "div",
      null,
      createElement(PublicHome, {
        crypto: model.crypto,
        aiStocks: model.aiStocks,
        fitness: { headline: "8420", unit: "steps", lines: ["3.2 mi this week"] },
        fightRecord: "4-1",
        buildHome,
      }),
      createElement(system.SystemHomeCard),
    ),
  );
  const crypto = render(createElement(PublicGroupFloor, { group: model.crypto, treasury: true }));
  const stocks = render(createElement(PublicGroupFloor, { group: model.aiStocks }));
  const stockNode = render(createElement(PublicNodePage, { ticker: "NVDA", holding: nvda }));
  const suiNode = render(createElement(PublicNodePage, { ticker: "SUI", holding: sui }));
  const treasury = render(createElement(TreasuryCard));
  const fight = render(createElement(PublicFightRecord, { record: "4-1" }));
  const section = buildSection();
  const build = render(
    createElement(BuildParent, {
      totalPercent: 40,
      githubFresh: true,
      sections: [section],
    }),
  );
  const buildSectionHtml = render(
    createElement(BuildSectionBody, { section, now: NOW, showPr: false }),
  );
  const fitness = render(createElement(FitnessGrid, { cards: fitnessCards() }));
  const steps = render(createElement(FitnessDetail, { detail: stepsDetail() }));
  const calendar = render(
    createElement(CalendarDesk, {
      events: [scrubbed],
      query: deskQuery(),
      today: "2026-10-08",
      storeLabel: "live",
      fightTargets: [],
    }),
  );
  const day = render(
    createElement(CalendarDayView, {
      day: "2026-10-08",
      events: [scrubbed],
      fills: [],
      search: { anchor: "2026-10-08", lane: "", node: "", event: "" },
      today: "2026-10-08",
      storeLabel: "live",
      fightTargets: [],
      hideFills: true,
    }),
  );
  const settings = render(
    createElement(
      "section",
      { "aria-label": "Founder" },
      createElement("h2", null, "Founder"),
      createElement("p", null, "Public mode is on."),
      createElement("button", { type: "button", "aria-pressed": "true" }, "Private"),
    ),
  );
  const hidden = render(
    createElement("p", { className: "parent-empty", role: "status" }, "Private"),
  );
  const visible = [
    { path: "/", html: home },
    { path: "/n/crypto", html: crypto },
    { path: "/n/ai-stocks", html: `${stocks}${render(createElement(catalysts.CatalystEntry, { events: [moneyCatalyst], now: catalystNow }))}` },
    {
      path: "/n/ai-stocks/catalysts",
      html: render(createElement(catalysts.CatalystWeekCards, { events: [moneyCatalyst], now: catalystNow })),
    },
    {
      path: "/n/ai-stocks/catalysts/this-week",
      html: render(
        createElement(catalysts.CatalystWeekList, {
          events: [moneyCatalyst],
          bucket: "this-week",
          now: catalystNow,
        }),
      ),
    },
    {
      path: "/n/ai-stocks/catalysts/this-week/money-catalyst",
      html: render(createElement(catalysts.CatalystEventDetail, { event: moneyCatalyst })),
    },
    { path: "/n/crypto/sui", html: suiNode },
    { path: "/n/crypto/xrp", html: treasury },
    { path: "/n/ai-stocks/nvda", html: stockNode },
    { path: "/n/fitness", html: fitness },
    { path: "/n/fitness/steps", html: steps },
    { path: "/n/fight-desk", html: fight },
    { path: "/n/build", html: build },
    { path: "/n/build/platform", html: buildSectionHtml },
    { path: "/n/lessons", html: publicLessonsHtml() },
    ...lenses.SYSTEM_LENSES.map((lens) => ({
      path: lens.id === "nodes" ? "/n/system" : `/n/system?lens=${lens.id}`,
      html: render(createElement(system.SystemMap, { lens: lens.id })),
    })),
    {
      path: "/n/system/live",
      html: (() => {
        const built = liveGraph.buildLiveGraph();
        const shown = liveGraph.presentLiveGraph(built, true);
        const finance = liveGraph.mapFinancePulse(
          { asOf: "2026-10-09", at: "2026-10-09T21:03:00.000Z" },
          liveGraph.liveEdgeSet(built),
        );
        const events = liveGraph.toSystemEventResponse(finance ? [finance] : [], true);
        return [
          ...shown.points
            .filter((point) => point.kind === "hub" || point.kind === "node")
            .map((point) => `${point.label} ${point.detail ?? ""}`),
          JSON.stringify(events),
        ].join("\n");
      })(),
    },
    { path: "/calendar", html: calendar },
    { path: "/calendar/2026-10-08", html: day },
    { path: "/settings", html: settings },
  ];
  const blocked = [
    "/n/finance",
    "/n/finance/debt",
    "/n/fight-desk/bankroll",
    "/settings/security",
    "/log",
    "/fights",
    "/fights/ufc",
    "/fights/ufc-300",
    "/fights/ufc-300/main",
    "/fights/main-card",
    "/fights/prelims",
    "/fights/contender-series",
    "/n/approvals",
    "/n/approvals/pending",
    "/n/approvals/done",
  ].map((path) => ({ path, html: hidden }));
  return [...visible, ...blocked];
}

describe("public book", () => {
  it("weights the nine names to 100.0% and leaves the treasury out", () => {
    const model = sampleBook();
    const shares = allocateTenths([
      ...NINE.map((ticker, index) => ({ ticker, value: [100, 80, 70, 60, 50, 40, 30, 20, 10][index] ?? 0 })),
      { ticker: "XRP", value: 5000 },
    ]);
    assert.equal(shares.some((row) => row.ticker === "XRP"), false);
    assert.equal(shares.reduce((sum, row) => sum + row.tenths, 0), 1000);
    const labels = [...model.crypto.holdings, ...model.aiStocks.holdings].map((holding) => holding.weightLabel);
    assert.equal(labels.length, 9);
    const tenths = labels.reduce((sum, label) => sum + Math.round(Number(label.replace("%", "")) * 10), 0);
    assert.equal(tenths, 1000);
    assert.equal(formatTenths(1000), "100.0%");
    const parentTenths =
      Math.round(Number((model.crypto.weightLabel ?? "0").replace("%", "")) * 10) +
      Math.round(Number((model.aiStocks.weightLabel ?? "0").replace("%", "")) * 10);
    assert.equal(parentTenths, 1000);
    assert.equal(model.treasuryLabel, TREASURY_LINE);
    assert.equal(JSON.stringify(model).includes("XRP"), false);
    assert.equal(publicPayloadLeaks(model).join(","), "");
  });

  it("rounds with the largest remainder so one-decimal weights still sum to 100.0", () => {
    const shares = allocateTenths([
      { ticker: "SUI", value: 1 },
      { ticker: "NVDA", value: 1 },
      { ticker: "TSLA", value: 1 },
    ]);
    assert.equal(shares.reduce((sum, row) => sum + row.tenths, 0), 1000);
    assert.deepEqual(
      shares.map((row) => row.tenths).sort((left, right) => left - right),
      [333, 333, 334],
    );
  });

  it("shows gain from the first buy and omits it when the entry is missing", () => {
    assert.equal(gainSinceFirstBuy(10, 15), "+50.0%");
    assert.equal(gainSinceFirstBuy(null, 15), null);
    const model = toPublicFloor([
      bookInput("SUI", 40, { firstBuyPrice: null, livePrice: 3 }),
      bookInput("NVDA", 60),
    ]);
    const sui = model.crypto.holdings.find((holding) => holding.ticker === "SUI");
    assert.ok(sui);
    assert.equal(sui.gainLabel, null);
    assert.match(sui.weightLabel, /%$/);
    const text = JSON.stringify(model);
    assert.equal(text.toLowerCase().includes("unknown"), false);
    assert.equal(text.includes("12345.67"), false);
  });

  it("indexes growth at 100 on the first buy and steps up when value is added", () => {
    const series = indexFromValues([
      { day: "2026-09-01", value: 250, buy: true },
      { day: "2026-09-02", value: 250, buy: false },
      { day: "2026-09-03", value: 500, buy: true },
    ]);
    assert.equal(series[0]?.index, 100);
    assert.equal(series[1]?.index, 100);
    assert.equal(series[2]?.index, 200);
    assert.equal(series[2]?.buy, true);
    assert.equal(JSON.stringify(series).includes("250"), false);
    assert.equal(JSON.stringify(series).includes("500"), false);
  });

  it("keeps a harmless win-loss record and drops a money label", () => {
    assert.equal(publicRecordLabel("4-1 · 0 sold · 0 void"), "4-1");
    assert.equal(publicRecordLabel("$12 at risk"), null);
    assert.equal(hasMoneyText("Wire $1,200"), true);
    assert.equal(stripMoneyText("Wire $1,200 to operations"), "Wire to operations");
    assert.equal(stripMoneyText("USD 40 left"), "left");
  });
});

describe("public render scan", () => {
  let pages: { path: string; html: string }[] = [];

  before(async () => {
    pages = await routeHtml(sampleBook());
  });

  it("covers every app route", () => {
    const root = fileURLToPath(new URL("../app", import.meta.url));
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (entry.name === "page.tsx") found.push(path.slice(root.length));
      }
    };
    walk(root);
    const expected = [
      "/page.tsx",
      "/calendar/page.tsx",
      "/calendar/[day]/page.tsx",
      "/fights/page.tsx",
      "/fights/[event]/page.tsx",
      "/fights/[event]/[fight]/page.tsx",
      "/fights/contender-series/page.tsx",
      "/fights/main-card/page.tsx",
      "/fights/prelims/page.tsx",
      "/fights/ufc/page.tsx",
      "/login/page.tsx",
      "/log/page.tsx",
      "/n/ai-stocks/catalysts/page.tsx",
      "/n/ai-stocks/catalysts/[bucket]/page.tsx",
      "/n/ai-stocks/catalysts/[bucket]/[event]/page.tsx",
      "/n/build/page.tsx",
      "/n/build/[section]/page.tsx",
      "/n/approvals/page.tsx",
      "/n/approvals/[view]/page.tsx",
      "/n/lessons/page.tsx",
      "/n/system/page.tsx",
      "/n/system/live/page.tsx",
      "/n/[parent]/page.tsx",
      "/n/[parent]/[node]/page.tsx",
      "/settings/page.tsx",
      "/settings/security/page.tsx",
    ];
    assert.deepEqual(found.sort(), expected.sort());
    for (const path of [
      "/",
      "/n/crypto",
      "/n/ai-stocks",
      "/n/ai-stocks/catalysts",
      "/n/ai-stocks/catalysts/this-week",
      "/n/ai-stocks/catalysts/this-week/money-catalyst",
      "/n/crypto/sui",
      "/n/crypto/xrp",
      "/n/ai-stocks/nvda",
      "/n/fitness",
      "/n/fitness/steps",
      "/n/fight-desk",
      "/n/build",
      "/n/build/platform",
      "/n/lessons",
      "/n/approvals",
      "/n/approvals/pending",
      "/n/system",
      "/n/system/live",
      "/calendar",
      "/calendar/2026-10-08",
      "/settings",
      "/n/finance",
      "/settings/security",
      "/log",
      "/fights",
    ]) {
      assert.ok(pages.some((page) => page.path === path), path);
    }
  });

  it("fails when a public route prints a dollar, USD, or a share count", () => {
    for (const page of pages) {
      const leaks = publicTextLeaks(page.html).filter((id) => {
        if (id !== "shares" || !page.path.startsWith("/n/system")) return true;
        return /\bshares?\b/i.test(page.html.replaceAll("SUI share", ""));
      });
      assert.equal(leaks.join(","), "", `${page.path} leaked ${leaks.join(",")}`);
      assert.equal(page.html.includes("unknown cost"), false, page.path);
      assert.equal(page.html.includes("entry unknown"), false, page.path);
    }
    const treasury = pages.find((page) => page.path === "/n/crypto");
    assert.match(treasury?.html ?? "", /Powered by a digital asset treasury/);
    assert.equal(treasury?.html.includes("XRP"), false);
    const home = pages.find((page) => page.path === "/");
    assert.match(home?.html ?? "", /Build/);
    assert.match(home?.html ?? "", /40%/);
    assert.match(home?.html ?? "", /System/);
    const systemPage = pages.find((page) => page.path === "/n/system");
    assert.match(systemPage?.html ?? "", /System/);
    assert.equal(systemPage?.html.includes("$"), false);
    const livePage = pages.find((page) => page.path === "/n/system/live");
    assert.match(livePage?.html ?? "", /Lessons/);
    assert.match(livePage?.html ?? "", /Finance/);
    assert.equal(livePage?.html.includes("plaid"), false);
    assert.equal(livePage?.html.includes("private snapshot"), false);
    const buildSectionPage = pages.find((page) => page.path === "/n/build/platform");
    assert.equal(buildSectionPage?.html.includes("pull/80"), false);
    assert.equal(buildSectionPage?.html.includes("#80"), false);
    const lessonsPage = pages.find((page) => page.path === "/n/lessons");
    assert.match(lessonsPage?.html ?? "", /LL-023/);
    assert.equal(lessonsPage?.html.includes("LL-021"), false);
    assert.equal(lessonsPage?.html.includes("LL-030"), false);
  });

  it("hides finance, the bankroll, the log, security, and fights", () => {
    for (const path of [
      "/n/finance",
      "/n/finance/net-worth",
      "/n/money",
      "/n/fight-desk/bankroll",
      "/settings/security",
      "/log",
      "/fights",
      "/fights/ufc",
      "/api/fills",
      "/api/spot-price",
      "/api/settings/fitness-token",
      "/api/settings/owner-pin",
      "/n/approvals",
      "/n/approvals/pending",
      "/n/approvals/done",
      "/api/approvals",
      "/api/approvals/appr_example/decision",
    ]) {
      assert.equal(isHiddenInPublicMode(path), true, path);
    }
    for (const path of ["/", "/n/crypto", "/n/ai-stocks", "/n/ai-stocks/catalysts", "/n/build", "/n/lessons", "/n/system", "/n/system/live", "/n/fitness", "/calendar", "/settings", "/api/settings/public-mode"]) {
      assert.equal(isHiddenInPublicMode(path), false, path);
    }
    const hidden = pages.filter((page) => isHiddenInPublicMode(page.path));
    assert.ok(hidden.length >= 8);
    for (const page of hidden) {
      assert.match(page.html, /Private/);
      assert.equal(page.html.includes("$"), false);
    }
  });
});

const PRIVATE_CARD_SNAPSHOT =
  '<div class="live-face value-card parent-face child-card"><header class="live-head"><h2 class="node-ticker">SUI</h2><p class="value-headline">~$20.00</p><p class="value-price">$2.000 live</p></header><ul class="parent-lines"><li class="is-up">+1.2%</li><li>SUI · 20 Oct</li></ul><div class="home-visual"><svg aria-label="SUI price history" role="img" viewBox="0 0 168 44"><path class="price-spark-area is-up" d="M3.00 41.00 L84.00 18.20 L165.00 3.00 L165.00 44.00 L3.00 44.00 Z"></path><path class="price-spark is-up" d="M3.00 41.00 L84.00 18.20 L165.00 3.00"></path></svg></div></div>';

describe("private mode card", () => {
  it("keeps the value-first holding card", () => {
    const face = assembleLiveFace(
      "SUI",
      [{ id: "coinbase", label: "Coinbase", quantity: "10", source: "coinbase-config", manual: false }],
      { usd: 2, source: "test", fetchedAt: FRESH },
    );
    const model = holdingChildModel({
      face,
      changePct: 1.24,
      fetchedAt: FRESH,
      now: NOW,
      catalyst: "SUI · 20 Oct",
      history: [1.5, 1.8, 2],
    });
    const html = render(createElement(ChildValueCard, { model }));
    assert.match(html, /\$20/);
    assert.match(html, /SUI/);
    assert.equal(html, PRIVATE_CARD_SNAPSHOT);
  });
});

function memorySql(): SqlClient {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const result = await pool.query(text, [...params]);
      return (result.rows ?? []) as T[];
    },
  };
}

function envSnapshot() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
    AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  };
}

function restore(previous: ReturnType<typeof envSnapshot>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("public mode toggle", { concurrency: false }, () => {
  const previous = envSnapshot();
  const t0 = Date.UTC(2026, 9, 8, 15, 0, 0);
  let session = "";

  before(async () => {
    process.env.AUTH_PASSWORD_HASH = await hash("floor-secret");
  });

  after(() => {
    restore(previous);
    setAuthClockForTests(null);
    setSqlClientForTests(null);
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    setAuthClockForTests(() => t0);
    setSqlClientForTests(memorySql());
    await migrate();
    session = await createSession("Mozilla/5.0 (iPhone) Safari/17.0", t0);
  });

  function post(headers: Record<string, string>, body: unknown) {
    return POST(
      new Request("https://resonance3.vercel.app/api/settings/public-mode", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          origin: "https://resonance3.vercel.app",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  it("refuses a signed-out request", async () => {
    const response = await post({}, { enabled: true });
    assert.equal(response.status, 401);
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.equal(setCookie.includes(PUBLIC_MODE_COOKIE), false);
  });

  it("refuses the switch both ways until a PIN is set", async () => {
    for (const enabled of [true, false]) {
      const response = await post({ cookie: `${SESSION_COOKIE}=${session}` }, { enabled, pin: "918273" });
      assert.notEqual(response.status, 200);
      const setCookie = response.headers.get("set-cookie") ?? "";
      assert.equal(setCookie.includes(PUBLIC_MODE_COOKIE), false);
      const text = await response.text();
      assert.equal(text.includes("918273"), false);
    }
  });

  it("lets the owner turn public mode on with the PIN", async () => {
    const pin = "918273";
    await writeOwnerPinHash(await hashOwnerPin(pin), t0);
    const response = await post(
      { cookie: `${SESSION_COOKIE}=${session}`, "user-agent": "Mozilla/5.0 (iPhone) Safari/17.0" },
      { enabled: true, pin },
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; public: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.public, true);
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, new RegExp(`${PUBLIC_MODE_COOKIE}=1`));
    assert.match(setCookie, /HttpOnly/i);
    assert.equal(publicTextLeaks(JSON.stringify(body)).join(","), "");
    assert.equal(JSON.stringify(body).includes(pin), false);
  });
});
