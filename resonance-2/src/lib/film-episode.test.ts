import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { YOUTUBE_GEAR } from "@/data/youtube-gear";
import {
  FILM_TICKERS,
  blankFilmSnapshot,
  filmHref,
  filmLevel,
  filmTextLeaks,
  toFilmGear,
  type FilmLevel,
  type FilmSnapshot,
} from "@/lib/film-episode";
import { phoneTrail } from "@/lib/phone-nav";
import { SHELVED_NODES } from "@/lib/node-visibility";
import { toPublicFloor, type PublicGroup, type PublicHolding } from "@/lib/public-mode";

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
    if (value == null || value === false) continue;
    if (typeof value === "string" || typeof value === "number") attrs.push(`${key}="${value}"`);
  }
  const children = render((props.children as ReactNode) ?? null);
  return `<${type}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${children}</${type}>`;
}

async function boardHtml(level: FilmLevel): Promise<string> {
  const ui = await import("@/components/film-episode");
  return render(createElement(ui.FilmBoard, { level }));
}

function holding(id: string, ticker: string, weight: string, gain: string | null): PublicHolding {
  return { id, ticker, weightLabel: weight, gainLabel: gain, series: [] };
}

function group(id: "crypto" | "ai-stocks", label: string, holdings: PublicHolding[], weight: string | null): PublicGroup {
  return { id, label, weightLabel: weight, growthLabel: weight ? "+2.0%" : null, series: [], holdings };
}

function poisoned(): FilmSnapshot {
  const snap = blankFilmSnapshot(["fitness"]);
  snap.crypto = group("crypto", "Crypto", [
    holding("sui", "SUI", "$20.00", "NVDA +4%"),
    holding("hbar", "HBAR", "9.0%", "+1.0%"),
  ], "40.0%");
  snap.aiStocks = group(
    "ai-stocks",
    "AI Stocks",
    [holding("pwr", "PWR", "20.0%", "+3.0%"), holding("nvda", "NVDA", "11.1%", "+1.0% since NVDA")],
    "$99",
  );
  snap.fightRecord = "4-1";
  snap.buildUnavailable = false;
  snap.buildPercent = "40%";
  snap.buildLines = ["1 in progress", "Next: Buy NVDA"];
  snap.sections = [
    {
      id: "platform",
      label: "Platform",
      percent: 40,
      live: 0,
      inProgress: 1,
      queued: 1,
      items: [
        {
          id: "paint-tiles",
          title: "Paint the tiles",
          status: "queued",
          nextStep: "Open the clean view",
          percent: 40,
        },
        {
          id: "secret-buy",
          title: "Buy NVDA at $100",
          status: "live",
          nextStep: "send $40",
          percent: 10,
        },
      ],
    },
  ];
  snap.ideas = [
    { id: "night-drive", title: "hub chat about SUI $5", note: "private", status: "idea" },
    { id: "studio-lights", title: "Studio lights", note: "Soft light for the board", status: "idea" },
  ];
  snap.controlLines = ["XRP feed $1", "2 of 8 bots"];
  snap.controlLive = true;
  snap.bots = [
    { slug: "sophia", name: "Sophia Luna", line: "2h ago" },
    { slug: "sui-desk", name: "SUI Desk", line: "now" },
  ];
  snap.feeds = [
    { slug: "xrp-closes", name: "XRP daily closes", line: "green" },
    { slug: "closes", name: "Daily closes", line: "green · 2h ago" },
  ];
  snap.health = {
    percent: 80,
    ready: 4,
    scores: [
      { id: "allocation", label: "Allocation", detail: "SUI 10% · $4", percent: 80 },
      { id: "growth", label: "Growth", detail: "Names up since the first buy.", percent: 70 },
    ],
  };
  snap.lessonsUnavailable = false;
  snap.lessons = [
    {
      id: "LL-014",
      title: "Keep the floor calm",
      lesson: "hub chat with Andres about NVDA for $40",
      whatChanged: "Paid $12",
      why: "The public cut stays clean",
    },
    {
      id: "LL-015",
      title: "Weekly NVDA note",
      lesson: "A private ticker note",
      whatChanged: "none",
      why: "none",
    },
  ];
  snap.chainUnavailable = false;
  snap.incidents = [
    {
      id: "bridge-1",
      subject: "XRPL bridge lost $5",
      category: "Bridge exploit",
      status: "open",
      cause: "Sized loss",
      date: "Oct 20",
    },
    {
      id: "wallet-1",
      subject: "Hardware wallet",
      category: "Wallet / hardware",
      status: "open",
      cause: "A public writeup",
      date: "Oct 20",
    },
  ];
  const priced = YOUTUBE_GEAR[0];
  snap.gear = priced ? [toFilmGear({ ...priced, costUsd: 199 })] : [];
  snap.bricks = [
    { id: "nvda-cut", title: "NVDA episode $9", status: "Idea", summary: "skip", note: "" },
    { id: "gear-shot", title: "Open on the gear shot", status: "Scripted", summary: "Start wide", note: "" },
  ];
  return snap;
}

function leaks(text: string): string[] {
  const found: string[] = [];
  if (text.includes("$")) found.push("$");
  if (/hub\s+chat/i.test(text)) found.push("hub chat");
  for (const ticker of FILM_TICKERS) {
    if (new RegExp(`\\b${ticker}\\b`, "i").test(text)) found.push(ticker);
  }
  return found;
}

async function walk(snap: FilmSnapshot): Promise<string> {
  const seen = new Set<string>();
  const chunks: string[] = [];
  const queue: string[][] = [[]];
  while (queue.length > 0) {
    const parts = queue.shift() ?? [];
    const key = parts.join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    const level = filmLevel(parts, snap);
    assert.ok(level, key || "/film");
    if (parts.length === 0) assert.equal(level.back, null);
    else assert.equal(level.back?.href, `/film${parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : ""}`);
    const html = await boardHtml(level);
    chunks.push(html);
    for (const row of level.faces) {
      if (!row.href) continue;
      assert.equal(row.href.includes("?"), false, row.href);
      assert.equal(filmHref(row.href), true, row.href);
      assert.equal(row.href.startsWith("/n/"), false, row.href);
      queue.push(row.href.split("/").filter(Boolean).slice(1));
    }
  }
  return chunks.join("\n");
}

describe("episode 1 filming view", () => {
  it("keeps fitness shelved and the film path free of query noise", () => {
    assert.ok(SHELVED_NODES.includes("fitness"));
    assert.equal(filmHref("/film"), true);
    assert.equal(filmHref("/film/crypto/network"), true);
    assert.equal(filmHref("/film?public=1"), false);
    assert.equal(filmHref("/n/crypto/sui"), false);
    assert.equal(filmHref("/film/crypto/sui"), false);
    assert.ok(filmTextLeaks("$40").includes("dollar"));
    assert.ok(filmTextLeaks("NVDA").includes("ticker"));
    assert.ok(filmTextLeaks("hub chat with Andres").includes("hub-chat"));
  });

  it("renders no dollars, no tickers, and no hub chat", async () => {
    const snap = poisoned();
    const html = await walk(snap);
    assert.deepEqual(leaks(html), []);
    assert.equal(html.includes("Roundtable"), false);
    assert.equal(html.includes("/n/roundtable"), false);
    assert.equal(html.includes("/n/approvals"), false);
    assert.equal(html.includes("Buy NVDA at $100"), false);
    assert.equal(html.includes("hub chat about SUI"), false);
    assert.match(html, /Network/);
    assert.match(html, /Grid/);
    assert.match(html, /Compute/);
    assert.match(html, /Paint the tiles/);
    assert.match(html, /Studio lights/);
    assert.match(html, /Keep the floor calm/);
    assert.match(html, /The public cut stays clean/);
    assert.match(html, /Hardware wallet/);
    assert.match(html, /Daily closes/);
    assert.match(html, /Open on the gear shot/);
    assert.match(html, /4-1/);
    assert.equal(html.includes("199"), false);
    const home = filmLevel([], snap);
    assert.equal(home?.faces.some((row) => row.id === "fitness"), false);
    assert.equal(home?.faces.some((row) => row.id === "roundtable"), false);
    assert.equal(home?.faces.some((row) => row.id === "finance"), false);
    const fitness = filmLevel(["fitness"], snap);
    assert.match(await boardHtml(fitness!), /coming soon/);
    assert.equal(filmLevel(["crypto", "sui"], snap), null);
    assert.equal(filmLevel(["roundtable"], snap), null);
    assert.equal(filmLevel(["finance"], snap), null);
    assert.equal(filmLevel(["control", "approvals"], snap), null);
    const lesson = filmLevel(["lessons", "ll-014"], snap);
    const lessonHtml = await boardHtml(lesson!);
    assert.deepEqual(leaks(lessonHtml), []);
    assert.match(lessonHtml, /The public cut stays clean/);
    assert.equal(lessonHtml.includes("Paid"), false);
  });

  it("shows coming soon for fitness when it is not shelved", async () => {
    const snap = poisoned();
    snap.shelved = [];
    const home = filmLevel([], snap);
    const fitness = home?.faces.find((row) => row.id === "fitness");
    assert.equal(fitness?.headline, "coming soon");
    assert.equal(fitness?.href, "/film/fitness");
    const html = await boardHtml(home!);
    assert.deepEqual(leaks(html), []);
    assert.match(html, /coming soon/);
  });

  it("sends the phone trail up one level without a ticker crumb", () => {
    assert.equal(phoneTrail("/film").back, null);
    assert.deepEqual(phoneTrail("/film").crumbs, [{ href: "/film", label: "Film" }]);
    assert.deepEqual(phoneTrail("/film/crypto").back, { href: "/film", label: "Film" });
    assert.deepEqual(phoneTrail("/film/crypto/network").back, { href: "/film/crypto", label: "Crypto" });
    assert.equal(phoneTrail("/film/crypto/network").crumbs.at(-1)?.label, "Network");
    assert.equal(phoneTrail("/film/build/platform/paint-tiles").back?.href, "/film/build/platform");
    assert.equal(phoneTrail("/film/lessons/ll-014").crumbs.at(-1)?.label, "Lesson");
    const hidden = phoneTrail("/film/crypto/sui");
    assert.equal(JSON.stringify(hidden).includes("sui"), false);
    assert.equal(JSON.stringify(hidden).includes("SUI"), false);
  });

  it("gates the route on public mode and does not read a query", () => {
    const page = readFileSync(path.join(root, "src/app/film/[[...slug]]/page.tsx"), "utf8");
    const body = page.slice(page.indexOf("export default"));
    assert.ok(body.indexOf("isPublicMode") < body.indexOf("loadFilmSnapshot"));
    assert.match(page, /FilmLocked/);
    assert.equal(page.includes("searchParams"), false);
    const toolbar = readFileSync(path.join(root, "src/components/operator-toolbar.tsx"), "utf8");
    assert.match(toolbar, /onFilm \? "\/film"/);
    assert.match(toolbar, /publicMode \? null/);
  });

  it("drops a gear cost before the tile is built", () => {
    const gear = YOUTUBE_GEAR[0];
    assert.ok(gear);
    const filmed = toFilmGear({ ...gear, costUsd: 199 });
    assert.equal(JSON.stringify(filmed).includes("$"), false);
    assert.equal(JSON.stringify(filmed).includes("199"), false);
    assert.equal(filmed.fields.some((field) => field.label === "Cost"), false);
  });

  it("leaves an empty public book as weights, not dollars", () => {
    const empty = toPublicFloor([]);
    const snap = blankFilmSnapshot();
    snap.crypto = empty.crypto;
    snap.aiStocks = empty.aiStocks;
    const home = filmLevel([], snap);
    assert.equal(home?.faces.some((row) => row.name === "Crypto"), true);
    assert.equal(JSON.stringify(home).includes("$"), false);
  });
});
