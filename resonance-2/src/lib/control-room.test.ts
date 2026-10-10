import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { SYSTEM_AGENTS } from "@/data/system-map";
import { SESSION_COOKIE } from "@/lib/auth-core";
import {
  CONTROL_AGENT_ORDER,
  DAILY_FRESHNESS,
  FEED_THRESHOLD_LINE,
  HISTORY_FRESHNESS,
  NO_SIGNAL,
  QUOTE_FRESHNESS,
  agentIdForSignal,
  controlHomeLines,
  controlParentCards,
  feedFreshness,
  formatControlWhen,
  presentControlRoom,
  scoreAgents,
  scoreApprovals,
  scoreFeeds,
  type ActivitySignal,
  type ControlRoom,
} from "@/lib/control-room";
import { isHiddenInPublicMode } from "@/lib/public-mode";
import { proxy } from "@/proxy";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NOW = new Date("2026-10-09T20:12:00.000Z");

function atAge(ms: number, now = NOW): string {
  return new Date(now.getTime() - ms).toISOString();
}

function signal(source: string, at: string, writer?: string): ActivitySignal {
  return { source, at, writer };
}

function room(partial: Partial<ControlRoom> = {}): ControlRoom {
  const agents = scoreAgents([
    signal("fills:robinhood", atAge(12 * 60 * 1000)),
    signal("build_items", atAge(2 * 60 * 60 * 1000)),
    signal("fitness_ingest", atAge(30 * 60 * 1000)),
    signal("finance_snapshot", atAge(2 * 60 * 60 * 1000)),
    signal("lessons", atAge(5 * 60 * 1000)),
    signal("calendar", atAge(15 * 60 * 1000), "agent"),
    signal("fills:coinbase", atAge(5 * 60 * 1000)),
    signal("mystery-feed", atAge(60 * 1000)),
  ]);
  const feeds = scoreFeeds(
    {
      coingecko: atAge(60 * 1000),
      "xrp-closes": atAge(HISTORY_FRESHNESS.amberMs + 1),
      yahoo: atAge(QUOTE_FRESHNESS.amberMs + 1),
      finance: atAge(DAILY_FRESHNESS.amberMs + 1),
      health: atAge(60 * 60 * 1000),
      robinhood: atAge(12 * 60 * 1000),
      coinbase: null,
      github: atAge(QUOTE_FRESHNESS.redMs + 1),
      calendar: atAge(2 * 60 * 60 * 1000),
    },
    {
      coingecko: true,
      "xrp-closes": true,
      yahoo: true,
      finance: true,
      health: true,
      robinhood: true,
      coinbase: true,
      github: true,
      calendar: true,
    },
    NOW,
  );
  return {
    approvals: scoreApprovals(
      [
        {
          status: "pending",
          createdAt: atAge(60 * 60 * 1000),
          decidedAt: null,
          title: "Send $1,200 to the treasury",
          agent: "Robinhood Ops",
        },
        {
          status: "approved",
          createdAt: atAge(3 * 60 * 60 * 1000),
          decidedAt: atAge(20 * 60 * 1000),
          title: "Walk the Thursday list",
          agent: "Architect",
        },
      ],
      NOW,
    ),
    agents,
    feeds,
    ...partial,
  };
}

describe("control room freshness", () => {
  it("keeps the earlier color until the age is over the threshold", () => {
    assert.equal(QUOTE_FRESHNESS.amberMs, 10 * 60 * 1000);
    assert.equal(QUOTE_FRESHNESS.redMs, 60 * 60 * 1000);
    assert.equal(DAILY_FRESHNESS.amberMs, 36 * 60 * 60 * 1000);
    assert.equal(DAILY_FRESHNESS.redMs, 48 * 60 * 60 * 1000);
    assert.equal(HISTORY_FRESHNESS.amberMs, 15 * 60 * 1000);
    assert.equal(HISTORY_FRESHNESS.redMs, 60 * 60 * 1000);
    assert.match(FEED_THRESHOLD_LINE, /10 minutes/);
    assert.match(FEED_THRESHOLD_LINE, /15 minutes/);
    assert.match(FEED_THRESHOLD_LINE, /1 hour/);
    assert.match(FEED_THRESHOLD_LINE, /36 hours/);
    assert.match(FEED_THRESHOLD_LINE, /48 hours/);

    assert.equal(feedFreshness(atAge(QUOTE_FRESHNESS.amberMs), NOW, "quote"), "green");
    assert.equal(feedFreshness(atAge(QUOTE_FRESHNESS.amberMs + 1), NOW, "quote"), "amber");
    assert.equal(feedFreshness(atAge(QUOTE_FRESHNESS.redMs), NOW, "quote"), "amber");
    assert.equal(feedFreshness(atAge(QUOTE_FRESHNESS.redMs + 1), NOW, "quote"), "red");

    assert.equal(feedFreshness(atAge(HISTORY_FRESHNESS.amberMs), NOW, "history"), "green");
    assert.equal(feedFreshness(atAge(HISTORY_FRESHNESS.amberMs + 1), NOW, "history"), "amber");
    assert.equal(feedFreshness(atAge(HISTORY_FRESHNESS.redMs), NOW, "history"), "amber");
    assert.equal(feedFreshness(atAge(HISTORY_FRESHNESS.redMs + 1), NOW, "history"), "red");

    assert.equal(feedFreshness(atAge(DAILY_FRESHNESS.amberMs), NOW, "daily"), "green");
    assert.equal(feedFreshness(atAge(DAILY_FRESHNESS.amberMs + 1), NOW, "daily"), "amber");
    assert.equal(feedFreshness(atAge(DAILY_FRESHNESS.redMs), NOW, "daily"), "amber");
    assert.equal(feedFreshness(atAge(DAILY_FRESHNESS.redMs + 1), NOW, "daily"), "red");

    assert.equal(feedFreshness(null, NOW, "quote"), "red");
    assert.equal(feedFreshness("not-a-time", NOW, "daily"), "red");
    assert.equal(feedFreshness(atAge(-2 * 60 * 1000), NOW, "quote"), "red");
    assert.equal(feedFreshness(atAge(-30 * 1000), NOW, "quote"), "green");
  });

  it("prints a relative age and the Chicago clock", () => {
    assert.equal(formatControlWhen("2026-10-09T20:00:00.000Z", NOW), "12m ago · 3:00 PM CT");
    assert.equal(formatControlWhen(atAge(30 * 1000), NOW).startsWith("just now"), true);
    assert.match(formatControlWhen(atAge(3 * 60 * 60 * 1000), NOW), /^3h ago · .+ CT$/);
    assert.equal(formatControlWhen(null, NOW), NO_SIGNAL);
    assert.equal(formatControlWhen("nope", NOW), NO_SIGNAL);
  });
});

describe("control room agents", () => {
  it("maps only a source the system map already names", () => {
    assert.deepEqual(
      [...CONTROL_AGENT_ORDER].sort(),
      SYSTEM_AGENTS.map((agent) => agent.id).sort(),
    );
    assert.equal(agentIdForSignal(signal("fills:robinhood", NOW.toISOString())), "robinhood-ops");
    assert.equal(agentIdForSignal(signal("fills:cb-agentic", NOW.toISOString())), "robinhood-ops");
    assert.equal(agentIdForSignal(signal("build_items", NOW.toISOString())), "architect");
    assert.equal(agentIdForSignal(signal("fitness_ingest", NOW.toISOString())), "fitness-coach");
    assert.equal(agentIdForSignal(signal("finance_snapshot", NOW.toISOString())), "finance-desk");
    assert.equal(agentIdForSignal(signal("calendar", NOW.toISOString(), "Fight Desk")), "fight-desk");
    assert.equal(agentIdForSignal(signal("calendar", NOW.toISOString(), "sophia")), "sophia");

    assert.equal(agentIdForSignal(signal("lessons", NOW.toISOString())), null);
    assert.equal(agentIdForSignal(signal("calendar", NOW.toISOString(), "agent")), null);
    assert.equal(agentIdForSignal(signal("calendar", NOW.toISOString(), "founder")), null);
    assert.equal(agentIdForSignal(signal("fills:coinbase", NOW.toISOString())), null);
    assert.equal(agentIdForSignal(signal("mystery-feed", NOW.toISOString())), null);
    assert.equal(agentIdForSignal(signal("fills:robinhood", "not-a-time")), null);

    const rows = scoreAgents([
      signal("mystery-feed", NOW.toISOString()),
      signal("lessons", NOW.toISOString()),
      signal("calendar", NOW.toISOString(), "founder"),
      signal("fills:robinhood", atAge(30 * 60 * 1000)),
      signal("fills:robinhood", atAge(5 * 60 * 1000)),
    ]);
    assert.equal(rows.length, CONTROL_AGENT_ORDER.length);
    const quiet = rows.filter((row) => row.at === null).map((row) => row.name);
    assert.deepEqual(quiet, [
      "Sophia Luna",
      "Architect",
      "Crypto Desk",
      "AI Stocks Desk",
      "Fitness Coach",
      "Fight Desk",
      "Finance Desk",
      "YouTube Studio",
    ]);
    const robinhood = rows.find((row) => row.id === "robinhood-ops");
    assert.equal(robinhood?.at, atAge(5 * 60 * 1000));
    assert.equal(robinhood?.name, "Robinhood Ops");
    assert.ok(rows.every((row) => row.at === null || formatControlWhen(row.at, NOW) !== NO_SIGNAL));
    assert.ok(quiet.every((name) => name.length > 0));
  });
});

describe("control room public hide", () => {
  it("drops approvals and finance and keeps the other scoreboard", () => {
    const view = presentControlRoom(room(), true);
    assert.equal(view.approvals, null);
    assert.equal(
      view.agents.some((agent) => agent.id === "finance-desk" || agent.name === "Finance Desk"),
      false,
    );
    assert.equal(view.feeds.some((feed) => feed.id === "finance" || feed.label === "Finance"), false);
    assert.equal(view.agents.some((agent) => agent.name === "Robinhood Ops"), true);
    assert.equal(view.feeds.some((feed) => feed.id === "coingecko"), true);
    const closes = view.feeds.find((feed) => feed.id === "xrp-closes");
    assert.equal(closes?.label, "XRP daily closes");
    assert.equal(closes?.band, "history");
    assert.equal(closes?.freshness, "amber");
    const packed = JSON.stringify(view);
    assert.equal(packed.includes("$"), false);
    assert.equal(packed.includes("1,200"), false);
    assert.equal(controlHomeLines(view).some((line) => /pending|finance|\$/i.test(line)), false);

    const cards = controlParentCards(view, NOW);
    assert.deepEqual(
      cards.map((card) => card.id),
      ["bots", "feeds"],
    );
    assert.equal(cards.some((card) => card.href === "/n/approvals" || card.label === "Approvals"), false);
  });

  it("hides the approvals child route and leaves the cockpit visible", () => {
    assert.equal(isHiddenInPublicMode("/n/control/approvals"), true);
    assert.equal(isHiddenInPublicMode("/n/control"), false);
    assert.equal(isHiddenInPublicMode("/n/control/bots"), false);
    assert.equal(isHiddenInPublicMode("/n/control/feeds"), false);

    const child = readFileSync(join(root, "src/app/n/control/[view]/page.tsx"), "utf8");
    const ui = readFileSync(join(root, "src/components/control-room.tsx"), "utf8");
    assert.ok(child.indexOf("await blockedPublicPage") < child.indexOf("await loadControlRoom"));
    assert.match(ui, /href="\/n\/approvals"/);
    assert.equal(ui.includes("<form"), false);
    assert.equal(ui.includes("ApprovalDecision"), false);
    assert.equal(ui.includes("/api/approvals"), false);
    assert.equal(ui.includes("<button"), false);
  });
});

describe("control room route auth", () => {
  const previous = {
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
    AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
  };

  after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("sends an anonymous visit to login and keeps the page owner-only", async () => {
    process.env.AUTH_PASSWORD_HASH = "$argon2id$test";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    const paths = ["/n/control", "/n/control/approvals", "/n/control/bots", "/n/control/feeds"];
    for (const path of paths) {
      const response = await proxy(new NextRequest(`https://resonance3.vercel.app${path}`));
      assert.equal(response.status, 307, path);
      const next = new URL(response.headers.get("location") ?? "").searchParams.get("next");
      assert.equal(next, path);
    }

    const token = "a".repeat(43);
    const allowed = await proxy(
      new NextRequest("https://resonance3.vercel.app/n/control", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(allowed.headers.get("x-middleware-next"), "1");

    const parent = readFileSync(join(root, "src/app/n/control/page.tsx"), "utf8");
    const child = readFileSync(join(root, "src/app/n/control/[view]/page.tsx"), "utf8");
    assert.ok(parent.indexOf('await requireRole("owner")') < parent.indexOf("await loadControlRoom"));
    assert.ok(child.indexOf('await requireRole("owner")') < child.indexOf("await loadControlRoom"));

    const store = readFileSync(join(root, "src/lib/control-room-store.ts"), "utf8");
    const selects = store.match(/SELECT[\s\S]*?FROM/gi) ?? [];
    assert.ok(selects.length >= 4);
    for (const sql of selects) {
      for (const word of ["price", "quantity", "payload", "detail", "usd", "stake"]) {
        assert.equal(new RegExp(`\\b${word}\\b`, "i").test(sql), false, sql);
      }
    }
  });
});

describe("control room approvals score", () => {
  it("counts pending and decisions that landed today in Chicago", () => {
    const now = new Date("2026-10-10T04:30:00.000Z");
    const scored = scoreApprovals(
      [
        {
          status: "pending",
          createdAt: "2026-10-09T18:00:00.000Z",
          decidedAt: null,
          title: "Still open",
          agent: "Architect",
        },
        {
          status: "approved",
          createdAt: "2026-10-09T12:00:00.000Z",
          decidedAt: "2026-10-10T04:00:00.000Z",
          title: "Tonight",
          agent: "Architect",
        },
        {
          status: "declined",
          createdAt: "2026-10-09T12:00:00.000Z",
          decidedAt: "2026-10-10T05:00:00.000Z",
          title: "After midnight",
          agent: "Architect",
        },
        {
          status: "weird",
          createdAt: "2026-10-09T12:00:00.000Z",
          decidedAt: "2026-10-10T04:00:00.000Z",
          title: "Ignore",
          agent: "Architect",
        },
      ],
      now,
    );
    assert.equal(scored.pending, 1);
    assert.equal(scored.doneToday, 1);
    assert.equal(scored.doneTodayRows[0]?.title, "Tonight");
    assert.equal(scored.pendingRows[0]?.title, "Still open");
  });
});
