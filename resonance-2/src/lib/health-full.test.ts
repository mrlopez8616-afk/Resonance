import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/health/full/route";
import { isHealthFullApi, planAccess } from "@/lib/auth-core";
import { authorizeHealthRequest } from "@/lib/health-auth";
import { setHealthFullLoaderForTests } from "@/lib/health-full-load";
import {
  HEALTH_TILES,
  assembleHealth,
  betsBits,
  bits,
  drillDownBroken,
  fightDeskBits,
  financeBits,
  groupQuoteBits,
  healthPages,
  publicHealthReport,
  quoteBits,
  resolveDrillDown,
  surface,
  type HealthBits,
  type HealthFullReport,
} from "@/lib/health-report";
import { proxy } from "@/proxy";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = new Date("2026-10-28T15:00:00.000Z");

function bearer(token: string | null): Request {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  return new Request("https://resonance3.vercel.app/api/health/full", { headers });
}

function envSnapshot() {
  return {
    RESONANCE_HEALTH_TOKEN: process.env.RESONANCE_HEALTH_TOKEN,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
  };
}

const previous = envSnapshot();

after(() => {
  setHealthFullLoaderForTests(null);
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function okFacts(): Record<string, HealthBits> {
  const fact = bits("ok", "loaded");
  return Object.fromEntries([...HEALTH_TILES, ...healthPages()].map((target) => [target.id, fact]));
}

describe("health full probe", () => {
  it("compares the health token on its own and rejects the sync secret", () => {
    delete process.env.RESONANCE_HEALTH_TOKEN;
    delete process.env.RESONANCE_SYNC_SECRET;
    assert.equal(authorizeHealthRequest(bearer(null)), false);
    assert.equal(authorizeHealthRequest(bearer("health-token")), false);

    process.env.RESONANCE_HEALTH_TOKEN = "health-token";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    assert.equal(authorizeHealthRequest(bearer(null)), false);
    assert.equal(authorizeHealthRequest(bearer("nope")), false);
    assert.equal(authorizeHealthRequest(bearer("hub-secret")), false);
    assert.equal(authorizeHealthRequest(bearer("a-much-longer-wrong-token")), false);
    assert.equal(authorizeHealthRequest(bearer("health-token")), true);

    process.env.RESONANCE_HEALTH_TOKEN = "hub-secret";
    assert.equal(authorizeHealthRequest(bearer("hub-secret")), false);

    const source = readFileSync(join(root, "src/lib/health-auth.ts"), "utf8");
    assert.equal(source.includes("console."), false);
    const route = readFileSync(join(root, "src/app/api/health/full/route.ts"), "utf8");
    assert.equal(route.includes("console."), false);
    assert.equal(route.includes("POST"), false);
  });

  it("lets the probe through the gate and keeps /api/health on the login gate", async () => {
    const base = {
      sessionToken: null,
      bearerOk: false,
      loginConfigured: true,
      nextPath: "/api/health/full",
    };
    assert.equal(isHealthFullApi("/api/health/full"), true);
    assert.equal(isHealthFullApi("/api/health"), false);
    assert.equal(isHealthFullApi("/api/health/full/extra"), false);
    assert.equal(
      planAccess({ ...base, pathname: "/api/health/full", method: "GET" }).kind,
      "allow",
    );
    assert.equal(
      planAccess({ ...base, pathname: "/api/health/full", method: "POST" }).kind,
      "deny",
    );
    assert.equal(planAccess({ ...base, pathname: "/api/health", method: "GET", nextPath: "/api/health" }).kind, "deny");

    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    process.env.RESONANCE_HEALTH_TOKEN = "health-token";
    const open = await proxy(new NextRequest("https://resonance3.vercel.app/api/health/full"));
    assert.equal(open.headers.get("x-middleware-next"), "1");
    assert.equal(open.headers.get("location"), null);
    assert.notEqual(open.status, 307);

    const posted = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/health/full", { method: "POST" }),
    );
    assert.equal(posted.status, 401);

    const legacy = await proxy(new NextRequest("https://resonance3.vercel.app/api/health"));
    assert.equal(legacy.status, 401);
    assert.notEqual(legacy.status, 307);

    const bets = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/bets", {
        headers: { authorization: "Bearer health-token" },
      }),
    );
    assert.equal(bets.status, 401);
  });

  it("returns 401 without the token and has no dollar sign in the output", async () => {
    let loaded = false;
    setHealthFullLoaderForTests(async () => {
      loaded = true;
      return assembleHealth(NOW.toISOString(), okFacts(), okFacts());
    });
    delete process.env.RESONANCE_HEALTH_TOKEN;
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";

    const missing = await GET(bearer(null));
    assert.equal(missing.status, 401);
    const missingText = await missing.text();
    assert.equal(missingText.includes("$"), false);
    assert.equal(loaded, false);

    const sync = await GET(bearer("hub-secret"));
    assert.equal(sync.status, 401);
    assert.equal((await sync.text()).includes("$"), false);

    process.env.RESONANCE_HEALTH_TOKEN = "health-token";
    const wrong = await GET(bearer("health-token-nope"));
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.text()).includes("$"), false);

    process.env.RESONANCE_HEALTH_TOKEN = "health-token";
    const session = await GET(
      new Request("https://resonance3.vercel.app/api/health/full", {
        headers: { cookie: "resonance_session=not-the-health-token" },
      }),
    );
    assert.equal(session.status, 401);
    assert.equal((await session.text()).includes("$"), false);
    assert.equal(loaded, false);
  });

  it("returns statuses and ages only, with no dollar amounts", async () => {
    const poisoned = {
      usd: 1234.56,
      fetchedAt: "2026-10-28T14:59:30.000Z",
      label: "balance $1,234.56",
    };
    const fresh = quoteBits(poisoned, NOW);
    assert.equal(fresh.status, "ok");
    assert.equal(fresh.stale, false);
    assert.equal(fresh.reason, "quote fresh");
    assert.equal(fresh.ageSeconds, 30);
    assert.equal(JSON.stringify(fresh).includes("$"), false);
    assert.equal(JSON.stringify(fresh).includes("1234"), false);

    const staleQuote = { ...poisoned, fetchedAt: "2026-10-28T14:00:00.000Z" };
    const stale = quoteBits(staleQuote, NOW);
    assert.equal(stale.stale, true);
    assert.equal(stale.reason, "quote stale");
    const missingQuote = { usd: 9, fetchedAt: null, label: "$9" };
    assert.equal(quoteBits(missingQuote, NOW).status, "unavailable");

    const partial = groupQuoteBits([fresh, quoteBits(null, NOW)]);
    assert.equal(partial.status, "ok");
    assert.equal(partial.reason, "partial quotes");

    const finance = financeBits(
      {
        status: "live",
        stale: true,
        storedAt: "2026-10-27T15:00:00.000Z",
        asOf: "2026-10-27",
        netWorth: 999999,
        label: "$999,999",
      } as never,
      NOW,
    );
    assert.equal(finance.reason, "snapshot stale");
    assert.equal(finance.stale, true);
    assert.equal(JSON.stringify(finance).includes("$"), false);
    assert.equal(JSON.stringify(finance).includes("999999"), false);

    const tile = fightDeskBits(
      { bookReady: true, ledgerReady: false, seedOnly: false, stale: false },
      "tile",
    );
    const bankroll = fightDeskBits(
      { bookReady: true, ledgerReady: false, seedOnly: false, stale: false },
      "bankroll",
    );
    assert.equal(tile.status, "ok");
    assert.equal(tile.reason, "deposits unavailable");
    assert.equal(bankroll.status, "unavailable");
    const closedBook = { status: "unavailable", reason: "stake $14" };
    assert.equal(betsBits(closedBook).reason, "bet book unavailable");
    assert.equal(JSON.stringify(betsBits(closedBook)).includes("$"), false);

    const facts = okFacts();
    facts.finance = finance;
    const report = assembleHealth(NOW.toISOString(), facts, facts);
    assert.equal(report.summary.status, "ok");
    assert.equal(report.tiles.find((row) => row.id === "finance")?.reason, "snapshot stale");
    assert.equal(report.tiles.length, HEALTH_TILES.length);
    assert.equal(report.pages.length, healthPages().length);
    assert.equal(report.pages.some((row) => row.path === "/n/fitness"), true);
    assert.equal(HEALTH_TILES.some((row) => row.id === "fitness"), false);
    assert.equal(new Set(healthPages().map((row) => row.path)).size, healthPages().length);
    for (const path of [
      "/n/crypto",
      "/n/crypto/xrp",
      "/n/crypto/sui",
      "/n/crypto/xrp-trigger",
      "/n/ai-stocks",
      "/n/ai-stocks/nvda",
      "/n/ai-stocks/catalysts",
      "/n/finance",
      "/n/finance/net-worth",
      "/n/fight-desk",
      "/n/fight-desk/bankroll",
      "/fights",
      "/n/fitness/steps",
      "/n/build",
      "/n/build/platform",
      "/n/ideas",
      "/n/crawl-walk-run",
      "/n/youtube",
      "/n/youtube/bricks",
      "/n/system",
      "/n/system/live",
      "/n/lessons",
      "/n/health",
      "/n/roundtable",
      "/n/chain-security",
      "/n/control",
      "/n/control/feeds",
      "/n/approvals",
    ]) {
      assert.equal(report.pages.some((row) => row.path === path), true, path);
    }
    assert.equal(JSON.stringify(report).includes("$"), false);

    process.env.RESONANCE_HEALTH_TOKEN = "health-token";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    const leaked = {
      ok: true,
      checkedAt: NOW.toISOString(),
      summary: report.summary,
      secret: "token health-token balance $50",
      issues: [],
      tiles: report.tiles.map((row) =>
        row.id === "crypto" ? { ...row, name: "Crypto $1", usd: 50, reason: "quote fresh" } : row,
      ),
      pages: report.pages,
    };
    setHealthFullLoaderForTests(async () => leaked as HealthFullReport);
    const response = await GET(bearer("health-token"));
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text.includes("$"), false);
    assert.equal(text.includes("health-token"), false);
    assert.equal(text.includes("usd"), false);
    const body = JSON.parse(text) as HealthFullReport & { secret?: string };
    assert.equal(body.secret, undefined);
    assert.equal(body.summary.surfaces, HEALTH_TILES.length + healthPages().length);
    assert.equal(Object.hasOwn(body, "secret"), false);

    const crypto = body.tiles.find((row) => row.id === "crypto");
    assert.equal(crypto?.name, "Crypto");
    assert.deepEqual(Object.keys(crypto ?? {}).sort(), [
      "ageSeconds",
      "id",
      "name",
      "path",
      "reason",
      "stale",
      "status",
    ]);

    const broken = publicHealthReport({
      checkedAt: NOW.toISOString(),
      tiles: [surface(HEALTH_TILES[0]!, bits("error", "read failed"))],
      pages: [],
    });
    assert.equal(broken.ok, false);
    assert.equal(broken.summary.status, "error");
    assert.equal(broken.summary.error, HEALTH_TILES.length + healthPages().length);
  });

  it("flags a drill-down that 404s, loops, or stays private", () => {
    for (const target of [...HEALTH_TILES, ...healthPages()]) {
      assert.equal(drillDownBroken(target.path, "private"), false, target.path);
      assert.equal(drillDownBroken(target.path, "public"), false, target.path);
    }
    const predictions = resolveDrillDown("/n/predictions");
    const activity = resolveDrillDown("/n/fitness/activity");
    const legacyCard = resolveDrillDown("/fights/main-card");
    assert.equal(predictions.ok && predictions.path, "/n/fight-desk");
    assert.equal(activity.ok && activity.path, "/n/fitness/steps");
    assert.equal(legacyCard.ok && legacyCard.path, "/fights");
    assert.equal(drillDownBroken("/n/not-a-node", "private"), true);
    assert.equal(drillDownBroken("/settings/security", "private"), false);
    assert.equal(drillDownBroken("/settings/security", "public"), true);
    assert.equal(drillDownBroken("/log", "public"), true);
    assert.equal(drillDownBroken("/n/finance", "public"), false);
    assert.equal(drillDownBroken("/n/finance/net-worth", "public"), false);
    assert.equal(drillDownBroken("/n/finance", "private"), false);
    const report = assembleHealth(NOW.toISOString(), okFacts(), okFacts());
    assert.equal(report.summary.status, "ok");
    assert.equal(report.issues.length, 0);
    assert.equal(report.pages.some((row) => row.reason === "drill-down broken"), false);
    const locked = assembleHealth(NOW.toISOString(), okFacts(), okFacts(), [
      {
        id: "finance-lock-href",
        name: "Finance tile still has a link",
        status: "error",
        path: "/n/finance",
      },
    ]);
    assert.equal(locked.ok, false);
    assert.equal(locked.summary.status, "error");
    assert.equal(locked.issues[0]?.name, "Finance tile still has a link");
    const financePage = locked.pages.find((row) => row.path === "/n/finance");
    assert.notEqual(financePage?.reason, "drill-down broken");
    assert.equal(JSON.stringify(report).includes("$"), false);
    const forced = publicHealthReport({
      checkedAt: NOW.toISOString(),
      tiles: HEALTH_TILES.map((target) =>
        target.id === "fight-desk"
          ? { ...surface(target, bits("ok", "loaded")), path: "/n/not-a-node" }
          : surface(target, bits("ok", "loaded")),
      ),
      pages: healthPages().map((target) => surface(target, bits("ok", "loaded"))),
    });
    const fight = forced.tiles.find((row) => row.id === "fight-desk");
    assert.equal(fight?.status, "error");
    assert.equal(fight?.reason, "drill-down broken");
    assert.equal(fight?.path, "/n/fight-desk");
    assert.equal(JSON.stringify(forced).includes("$"), false);
  });

  it("fetches a missing or old crypto quote once and does not reload the floor", () => {
    const source = readFileSync(join(root, "src/lib/health-full-load.ts"), "utf8");
    assert.equal(source.includes("loadOperatorFloor"), false);
    assert.match(source, /ensureSpotQuotes\(\["XRP", "SUI"\]\)/);
    assert.match(source, /ensureXrpTrigger\(\)/);
    assert.match(source, /quotes: "cache"/);
    const machine = readFileSync(join(root, "src/lib/machine-health-load.ts"), "utf8");
    assert.match(machine, /quotes: "cache"/);
    const floor = readFileSync(join(root, "src/lib/public-load.ts"), "utf8");
    assert.match(floor, /readSharedCryptoCloses\("SUI"\)/);
  });
});
