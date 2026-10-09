import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { FLOOR_NODES } from "@/data/floor-nodes";
import {
  DATA_SOURCES,
  GOVERNANCE,
  SYSTEM_AGENTS,
  SYSTEM_HOME_LINE,
  SYSTEM_LENSES,
  SYSTEM_NODES,
  TIMELINE,
  parseSystemLens,
  systemLensHref,
  systemNodeHrefs,
} from "@/data/system-map";
import { FITNESS_NODES } from "@/lib/fitness-board";
import { FINANCE_NODES } from "@/lib/finance/view";
import { nodeParent, parentById } from "@/lib/node-parents";
import { proxy } from "@/proxy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function appPage(rel: string): boolean {
  return existsSync(path.join(root, "src/app", rel, "page.tsx"));
}

/** A map link resolves when the matching page file would render that path. */
export function systemRouteResolves(href: string): boolean {
  if (href === "/fights") return appPage("fights");
  if (href === "/n/build") return appPage("n/build");
  if (href === "/n/lessons") return appPage("n/lessons");
  const parent = /^\/n\/([a-z0-9-]+)$/.exec(href);
  if (parent) return appPage("n/[parent]") && parentById(parent[1]) !== null;
  const child = /^\/n\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(href);
  if (!child || !appPage("n/[parent]/[node]")) return false;
  const parentId = child[1] ?? "";
  const nodeId = child[2] ?? "";
  if (!parentById(parentId)) return false;
  if (parentId === "finance") return FINANCE_NODES.some((node) => node.id === nodeId);
  if (parentId === "fitness") return FITNESS_NODES.some((node) => node.id === nodeId);
  if (parentId === "fight-desk") return nodeId === "bankroll";
  const node = FLOOR_NODES.find((item) => item.id === nodeId && item.status !== "empty");
  return Boolean(node && nodeParent(node.id) === parentId);
}

const SECRETISH = [
  /\$\d/,
  /argon2/i,
  /-----BEGIN /,
  /\beyJ[A-Za-z0-9_-]{20,}/,
  /\b(?:sk|pk)_(?:live|test)_/i,
  /\b[a-f0-9]{32,}\b/i,
  /JBSWY3DPEHPK3PXP/,
];

describe("system map", () => {
  it("counts nine agents and eight nodes on the home line", () => {
    assert.equal(SYSTEM_AGENTS.length, 9);
    assert.equal(SYSTEM_NODES.length, 8);
    assert.equal(SYSTEM_HOME_LINE, "9 agents · 8 nodes · all protections on");
    assert.equal(SYSTEM_LENSES.length, 6);
    assert.equal(DATA_SOURCES.some((source) => source.name === "GitHub Actions"), true);
    assert.equal(DATA_SOURCES.some((source) => source.name === "Build Tracker API"), true);
    assert.equal(GOVERNANCE.length > 0, true);
    assert.equal(TIMELINE[0]?.phase, "Phase 0");
  });

  it("keeps the config free of dollar amounts and secret-looking strings", () => {
    const source = readFileSync(path.join(root, "src/data/system-map.ts"), "utf8");
    assert.equal(/\$\d/.test(source), false);
    for (const pattern of SECRETISH) {
      assert.equal(pattern.test(source), false, pattern.source);
    }
    const joined = JSON.stringify({
      SYSTEM_NODES,
      SYSTEM_AGENTS,
      DATA_SOURCES,
      GOVERNANCE,
      TIMELINE,
      SYSTEM_HOME_LINE,
    });
    assert.equal(joined.includes("$"), false);
    for (const pattern of SECRETISH) assert.equal(pattern.test(joined), false, pattern.source);
  });

  it("points every node link at a route that exists", () => {
    const hrefs = systemNodeHrefs();
    assert.equal(hrefs.length > 0, true);
    for (const href of hrefs) {
      assert.equal(systemRouteResolves(href), true, href);
    }
    const youtube = SYSTEM_NODES.find((node) => node.id === "youtube");
    assert.equal(youtube?.status, "coming");
    assert.equal(youtube?.href, null);
    assert.equal(parseSystemLens(undefined), "nodes");
    assert.equal(parseSystemLens("flow"), "flow");
    assert.equal(parseSystemLens(["nope"]), "nodes");
    assert.equal(systemLensHref("nodes"), "/n/system");
    assert.equal(systemLensHref("sources"), "/n/system?lens=sources");
  });

  it("renders no dollar amounts and no env values", () => {
    const sentinels = {
      AUTH_PASSWORD_HASH: "hash-sentinel-value-not-real",
      AUTH_TOTP_SECRET: "totp-sentinel-value-not-real",
      AUTH_SESSION_SECRET: "session-sentinel-value-not-real",
      RESONANCE_SYNC_SECRET: "sync-sentinel-value-not-real",
      FITNESS_INGEST_TOKEN: "fitness-sentinel-value-not-real",
      FINANCE_ENC_KEY: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    };
    const rendered = spawnSync(path.join(root, "node_modules/.bin/tsx"), ["src/lib/system-map-render-check.ts"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...sentinels },
    });
    assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
    assert.match(rendered.stdout, /ok/);
  });
});

describe("system map login", { concurrency: false }, () => {
  it("sends a signed-out /n/system request to the login page", async () => {
    const previous = {
      AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
      AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
      AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    };
    process.env.AUTH_PASSWORD_HASH = "hash-sentinel-value-not-real";
    process.env.AUTH_TOTP_SECRET = "totp-sentinel-value-not-real";
    process.env.AUTH_SESSION_SECRET = "session-sentinel-value-not-real";
    try {
      const page = await proxy(new NextRequest("https://resonance.test/n/system"));
      assert.equal(page.status, 307);
      assert.match(page.headers.get("location") ?? "", /\/login\?next=%2Fn%2Fsystem$/);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
