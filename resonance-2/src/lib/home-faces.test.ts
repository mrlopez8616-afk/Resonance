import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import {
  HOME_FACE_SLOTS,
  DESKTOP_FACE_BOX,
  faceGridPlan,
  privateHomeNodeCount,
  publicHomeNodeCount,
  bookHomeFace,
  buildHomeFace,
  chainHomeFace,
  controlHomeFace,
  fightHomeFace,
  financeHomeFaceTile,
  fitnessHomeFace,
  healthHomeFace,
  lessonsHomeFace,
  roundtableHomeFace,
  systemHomeFace,
  tileFace,
  valueTileFace,
  youtubeHomeFace,
  type HomeFace,
} from "@/lib/home-faces";

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
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

type FaceUi = {
  NodeFace: (props: { face: HomeFace }) => ReactNode;
  NodeFaceGrid: (props: { children: ReactNode }) => ReactNode;
};

async function faceUi(): Promise<FaceUi> {
  return import("@/components/node-face");
}

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
    if (value === true) attrs.push(key);
    else attrs.push(`${key}="${String(value)}"`);
  }
  const children = render(props.children as ReactNode);
  return `<${type}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${children}</${type}>`;
}

function markup(ui: FaceUi, face: HomeFace): string {
  return render(createElement(ui.NodeFace, { face }));
}

describe("uniform home tiles", () => {
  const sum = { value: "~$12.5k", unit: "sum", coverage: false };
  const partial = { value: "~$4.0k", unit: "value of 4 of 6", coverage: true };
  const empty = { value: "value of 0 of 2", unit: "", coverage: true };

  it("paints every tile with the same four slots", async () => {
    const ui = await faceUi();
    const faces: HomeFace[] = [
      bookHomeFace({
        id: "crypto",
        name: "Crypto",
        href: "/n/crypto",
        publicMode: false,
        summary: sum,
        connected: true,
        mover: "XRP +1.2%",
      }),
      bookHomeFace({
        id: "ai-stocks",
        name: "AI Stocks",
        href: "/n/ai-stocks",
        publicMode: false,
        summary: partial,
        connected: true,
        mover: "NVDA +4.0%",
      }),
      fitnessHomeFace({
        value: "12,000",
        unit: "steps",
        lines: ["21,608 steps this week", "480 kcal this week"],
        publicMode: false,
      }),
      financeHomeFaceTile({ headline: "$80,000", asOfLine: "as of Oct 8, 2026" }),
      fightHomeFace({
        publicMode: false,
        headline: "~$17.06",
        priceLine: "$2.00 at risk · 1 open",
        record: "4-1",
      })!,
      buildHomeFace({
        unavailable: false,
        percentLabel: "40%",
        lines: ["2 in progress", "Next: System map"],
        publicMode: false,
      }),
      controlHomeFace(["3 pending", "1 done today", "2 of 4 bots"], true, false),
      healthHomeFace({ percent: 82, ready: 4, scores: [{}, {}, {}, {}, {}] }),
      youtubeHomeFace(["Channel not connected", "Gear: 10 devices", "Brick Tracker"]),
      systemHomeFace(9, 9),
      lessonsHomeFace({ unavailable: false, count: 2, latestTitle: "Newest public lesson" }, false),
      roundtableHomeFace({ unavailable: false, count: 1, lines: ["Desk check"] }),
      chainHomeFace({ unavailable: false, count: 1, lines: ["Wallet · open"] }, false),
    ];
    const html = render(
      createElement(ui.NodeFaceGrid, null, ...faces.map((face) => createElement(ui.NodeFace, { key: face.id, face }))),
    );
    assert.equal(HOME_FACE_SLOTS.length, 4);
    assert.match(html, /data-node-face-grid/);
    for (const face of faces) {
      const tile = markup(ui, face);
      assert.match(tile, new RegExp(`data-node-face="${face.id}"`));
      assert.match(tile, /node-face-glyph/);
      assert.match(tile, /node-face-name/);
      assert.match(tile, /node-face-headline/);
      assert.match(tile, /node-face-status/);
      assert.equal(tile.includes(`>${face.name}<`), true, face.id);
      assert.equal(tile.includes(`>${face.headline}<`), true, face.id);
      assert.equal(tile.includes(face.status), true, face.id);
      assert.equal(face.headline.trim().length > 0, true);
      assert.equal(face.status.trim().length > 0, true);
    }
    assert.equal((html.match(/data-node-face="/g) ?? []).length, faces.length);
  });

  it("keeps the dollar sum as the private headline and the move underneath", () => {
    const face = bookHomeFace({
      id: "crypto",
      name: "Crypto",
      href: "/n/crypto",
      publicMode: false,
      summary: sum,
      connected: true,
      mover: "XRP +1.2%",
    });
    assert.equal(face.headline, "~$12.5k");
    assert.equal(face.status, "XRP +1.2%");
    assert.equal(face.tone, "up");
    const covered = bookHomeFace({
      id: "ai-stocks",
      name: "AI Stocks",
      href: "/n/ai-stocks",
      publicMode: false,
      summary: partial,
      connected: true,
      mover: "NVDA +4.0%",
    });
    assert.equal(covered.headline, "~$4.0k");
    assert.equal(covered.status, "value of 4 of 6");
  });

  it("does not invent a value when the book has none", () => {
    const face = bookHomeFace({
      id: "crypto",
      name: "Crypto",
      href: "/n/crypto",
      publicMode: false,
      summary: empty,
      connected: true,
      mover: null,
    });
    assert.equal(face.headline, "not connected");
    assert.equal(face.status, "value of 0 of 2");
    assert.equal(face.live, false);
    assert.equal(face.headline.includes("$"), false);
    const quiet = fitnessHomeFace({ value: null, unit: null, lines: [], publicMode: false });
    assert.equal(quiet.headline, "not connected");
    assert.equal(quiet.status, "not recorded");
  });

  it("shows percentages only on a public tile", async () => {
    const ui = await faceUi();
    const crypto = bookHomeFace({
      id: "crypto",
      name: "Crypto",
      href: "/n/crypto",
      publicMode: true,
      summary: sum,
      connected: true,
      mover: "XRP +1.2%",
      weightLabel: "62.4%",
      growthLabel: "+3.2%",
    });
    const stocks = bookHomeFace({
      id: "ai-stocks",
      name: "AI Stocks",
      href: "/n/ai-stocks",
      publicMode: true,
      summary: partial,
      connected: true,
      mover: null,
      weightLabel: null,
      growthLabel: null,
    });
    const fight = fightHomeFace({
      publicMode: true,
      headline: "~$17.06",
      priceLine: "$2.00 at risk · 1 open",
      record: "4-1",
    });
    const poisoned = bookHomeFace({
      id: "crypto",
      name: "Crypto",
      href: "/n/crypto",
      publicMode: true,
      summary: sum,
      connected: true,
      mover: null,
      weightLabel: "$12",
      growthLabel: "USD 3",
    });
    const html = [crypto, stocks, fight, poisoned]
      .flatMap((face) => (face ? [markup(ui, face)] : []))
      .join("");
    assert.equal(crypto.headline, "62.4%");
    assert.equal(crypto.status, "+3.2%");
    assert.equal(stocks.headline, "not connected");
    assert.equal(stocks.status, "not recorded");
    assert.equal(fight?.headline, "4-1");
    assert.equal(fight?.status, "record");
    assert.equal(poisoned.headline.includes("$"), false);
    assert.equal(html.includes("$"), false);
    assert.equal(html.includes("USD"), false);
  });

  it("keeps a private finance snapshot in dollars and a missing snapshot private", async () => {
    const ui = await faceUi();
    const live = financeHomeFaceTile({ headline: "$80,000 partial", asOfLine: "as of Oct 8, 2026" });
    const quiet = financeHomeFaceTile(null);
    assert.equal(live.headline, "$80,000");
    assert.equal(live.status, "partial · as of Oct 8, 2026");
    assert.equal(quiet.headline, "Bank linked");
    assert.equal(quiet.status, "private");
    assert.equal(quiet.headline.includes("$"), false);
    assert.equal(markup(ui, quiet).includes("$"), false);
  });

  it("shows a negative linked net worth instead of not connected", () => {
    const neg = financeHomeFaceTile({ headline: "-$1,234 partial", asOfLine: "as of Oct 19, 2026" });
    assert.equal(neg.headline, "-$1,234");
    assert.equal(neg.live, true);
    assert.ok(neg.status.includes("partial"));
  });

  it("leaves the TV factory floor on its own wall", () => {
    const source = readFileSync(path.join(root, "src/components/factory-floor.tsx"), "utf8");
    assert.equal(source.includes("NodeFace"), false);
    assert.equal(source.includes("node-face"), false);
    const home = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
    const pub = readFileSync(path.join(root, "src/components/public-home-page.tsx"), "utf8");
    assert.match(home, /NodeFaceGrid/);
    assert.match(pub, /NodeFaceGrid/);
  });

  it("uses one status line for the nodes that used to stack three", async () => {
    const ui = await faceUi();
    const youtube = youtubeHomeFace(["Channel not connected", "Gear: 10 devices", "Brick Tracker"]);
    assert.equal(youtube.headline, "10 devices");
    assert.equal(youtube.status, "Channel not connected");
    assert.equal(markup(ui, youtube).includes("Brick Tracker"), false);
    const control = controlHomeFace(["3 pending", "1 done today", "2 of 4 bots"], true, false);
    assert.equal(control.headline, "3 pending");
    assert.equal(control.status, "1 done today");
    const health = healthHomeFace({ percent: null, ready: 0, scores: [{}, {}, {}, {}, {}] });
    assert.equal(health.headline, "not connected");
    assert.equal(health.status, "0 of 5");
    const lessons = lessonsHomeFace({ unavailable: true, count: 0, latestTitle: null }, true);
    assert.equal(lessons.headline, "unavailable");
    assert.equal(lessons.status, "not recorded");
    const chain = chainHomeFace({ unavailable: false, count: 0, lines: [] }, true);
    assert.equal(chain.status, "No incidents yet");
    const round = roundtableHomeFace({ unavailable: false, count: 0, lines: [] });
    assert.equal(round.headline, "0");
    assert.equal(round.status, "no messages yet");
  });

  it("fits the square grid to the node count", () => {
    assert.equal(privateHomeNodeCount({ owner: true, health: true }), 12);
    assert.equal(privateHomeNodeCount({ owner: true, health: false }), 11);
    assert.equal(privateHomeNodeCount({ owner: false, health: false }), 9);
    assert.equal(publicHomeNodeCount({ fight: true, health: true }), 10);
    assert.equal(publicHomeNodeCount({ fight: false, health: false }), 8);
    assert.equal(privateHomeNodeCount({ owner: true, health: true, shelved: [] }), 13);
    assert.equal(publicHomeNodeCount({ fight: true, health: true, shelved: [] }), 11);
    const owner = faceGridPlan(12, DESKTOP_FACE_BOX);
    const pub = faceGridPlan(10, DESKTOP_FACE_BOX);
    const phone = faceGridPlan(12, { width: 361, height: 586, gap: 5.6 }, true);
    assert.deepEqual({ columns: owner.columns, rows: owner.rows }, { columns: 4, rows: 3 });
    assert.deepEqual({ columns: pub.columns, rows: pub.rows }, { columns: 5, rows: 2 });
    assert.deepEqual({ columns: phone.columns, rows: phone.rows }, { columns: 3, rows: 4 });
    assert.ok(owner.size * owner.rows + DESKTOP_FACE_BOX.gap * (owner.rows - 1) <= DESKTOP_FACE_BOX.height + 0.5);
    assert.ok(phone.size >= 100, `phone tile ${phone.size}`);
    const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
    const home = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
    const pubPage = readFileSync(path.join(root, "src/components/public-home-page.tsx"), "utf8");
    assert.match(home, /privateHomeNodeCount/);
    assert.match(pubPage, /publicHomeNodeCount/);
    assert.match(css, /data-node-count="12"\] \{ --face-cols: 4; --face-rows: 3; \}/);
    assert.match(css, /data-node-count="10"\] \{ --face-cols: 5; --face-rows: 2; \}/);
    assert.match(css, /--face-cols: 3;/);
    assert.match(css, /data-node-count="12"\] \{ --face-rows: 4; \}/);
  });

  it("uses the same face on node pages and leaves the fitness parent alone", async () => {
    const ui = await faceUi();
    const priced = valueTileFace({
      id: "pwr",
      glyph: "ai-stocks",
      href: "/n/ai-stocks/pwr",
      name: "PWR",
      headline: "~$4.20k",
      priceLine: "$412.18 live",
      label: null,
    });
    assert.equal(priced.headline, "~$4.20k");
    assert.equal(priced.status, "$412.18 live");
    assert.equal(priced.glyph, "ai-stocks");
    const quiet = valueTileFace({
      id: "sui",
      glyph: "crypto",
      href: "/n/crypto/sui",
      name: "SUI",
      headline: null,
      priceLine: "$2.184 live",
      label: "no position",
    });
    assert.equal(quiet.headline, "no position");
    assert.equal(quiet.status, "$2.184 live");
    const hidden = tileFace({
      id: "pwr",
      glyph: "ai-stocks",
      href: "/n/ai-stocks/pwr",
      name: "PWR",
      headline: "~$4.20k",
      status: "$412 live",
      publicMode: true,
    });
    assert.equal(hidden.headline, "not recorded");
    assert.equal(hidden.status, "not recorded");
    assert.equal(markup(ui, hidden).includes("$"), false);
    const pages = [
      "src/components/node-grid.tsx",
      "src/components/build-floor.tsx",
      "src/components/finance-floor.tsx",
      "src/components/predictions-floor.tsx",
      "src/components/youtube-node.tsx",
      "src/components/control-room.tsx",
      "src/components/chain-security-floor.tsx",
      "src/components/roundtable-floor.tsx",
      "src/components/approvals-parent.tsx",
      "src/components/public-floor.tsx",
      "src/components/catalyst-calendar.tsx",
      "src/components/xrp-trigger-floor.tsx",
    ];
    for (const file of pages) {
      const source = readFileSync(path.join(root, file), "utf8");
      assert.match(source, /NodeFace/, file);
    }
    const fitness = readFileSync(path.join(root, "src/components/fitness-grid.tsx"), "utf8");
    assert.equal(fitness.includes("NodeFace"), false);
    assert.match(fitness, /NodeSquare/);
  });
});
