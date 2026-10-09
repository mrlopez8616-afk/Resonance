import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { FLOOR_NODES } from "@/data/floor-nodes";
import { NODE_PARENT, PARENTS } from "@/data/node-parents";
import { nodePageHref } from "@/lib/node-parents";
import { FINANCE_NODES } from "@/lib/finance/view";
import { FITNESS_NODES } from "@/lib/fitness-board";
import {
  PHONE_TABS,
  PULL_COMMIT_PX,
  SWIPE_COMMIT_PX,
  SWIPE_EDGE_PX,
  formatUpdatedTime,
  isStandaloneMode,
  phoneTabActive,
  phoneTrail,
  publicTrailLabel,
  pullDecision,
  pullShouldAnimate,
  swipeDecision,
  swipeShouldAnimate,
  type PullSample,
  type SwipeSample,
} from "./phone-nav";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function swipe(overrides: Partial<SwipeSample> = {}): SwipeSample {
  return {
    startX: 8,
    startY: 200,
    x: 8 + SWIPE_COMMIT_PX,
    y: 206,
    standalone: true,
    horizontalScroller: false,
    blockedSurface: false,
    ...overrides,
  };
}

describe("phone back targets", () => {
  it("sends each parent page up to the floor", () => {
    for (const parent of PARENTS) {
      const trail = phoneTrail(`/n/${parent.id}`);
      assert.deepEqual(trail.back, { href: "/", label: "Floor" });
      assert.deepEqual(trail.crumbs, [
        { href: "/", label: "Home" },
        { href: `/n/${parent.id}`, label: parent.label },
      ]);
    }
    const build = phoneTrail("/n/build");
    assert.deepEqual(build.back, { href: "/", label: "Floor" });
    assert.equal(build.crumbs.at(-1)?.label, "Build");
    assert.deepEqual(phoneTrail("/n/build/platform").back, { href: "/n/build", label: "Build" });
    assert.deepEqual(phoneTrail("/n/build/platform").crumbs, [
      { href: "/", label: "Home" },
      { href: "/n/build", label: "Build" },
      { href: "/n/build/platform", label: "Platform" },
    ]);
    assert.equal(phoneTrail("/n/build/ai-stocks").crumbs.at(-1)?.label, "AI Stocks");
    assert.equal(phoneTrail("/n/build/queue").crumbs.at(-1)?.label, "Queue");
    assert.equal(phoneTrail("/n/build/fight-desk").back?.href, "/n/build");
  });

  it("sends a child page up to its parent", () => {
    const nvda = phoneTrail("/n/ai-stocks/nvda");
    assert.deepEqual(nvda.back, { href: "/n/ai-stocks", label: "AI Stocks" });
    assert.deepEqual(nvda.crumbs, [
      { href: "/", label: "Home" },
      { href: "/n/ai-stocks", label: "AI Stocks" },
      { href: "/n/ai-stocks/nvda", label: "NVDA" },
    ]);

    const xrp = phoneTrail("/n/crypto/xrp");
    assert.deepEqual(xrp.back, { href: "/n/crypto", label: "Crypto" });
    assert.equal(xrp.crumbs.at(-1)?.label, "XRP");

    for (const node of FLOOR_NODES) {
      if (node.status === "empty") continue;
      const parentId = NODE_PARENT[node.id as keyof typeof NODE_PARENT];
      if (!parentId) continue;
      const parent = PARENTS.find((item) => item.id === parentId);
      const trail = phoneTrail(`/n/${parentId}/${node.id}`);
      assert.deepEqual(trail.back, { href: `/n/${parentId}`, label: parent?.label });
      assert.equal(trail.crumbs.at(-1)?.label, node.ticker);
    }

    for (const node of FITNESS_NODES) {
      const trail = phoneTrail(`/n/fitness/${node.id}`);
      assert.deepEqual(trail.back, { href: "/n/fitness", label: "Fitness" });
      assert.equal(trail.crumbs.at(-1)?.label, node.title);
    }

    for (const node of FINANCE_NODES) {
      const trail = phoneTrail(`/n/finance/${node.id}`);
      assert.deepEqual(trail.back, { href: "/n/finance", label: "Finance" });
      assert.equal(trail.crumbs.at(-1)?.label, node.title);
    }

    assert.deepEqual(phoneTrail("/n/fight-desk/bankroll").back, {
      href: "/n/fight-desk",
      label: "Fight Desk",
    });

    assert.deepEqual(phoneTrail("/n/lessons"), {
      back: { href: "/", label: "Home" },
      crumbs: [
        { href: "/", label: "Home" },
        { href: "/n/lessons", label: "Lessons" },
      ],
    });
    assert.deepEqual(phoneTrail("/n/lessons/extra").back, { href: "/", label: "Home" });
  });

  it("sends an unknown route home", () => {
    assert.deepEqual(phoneTrail("/n/system"), {
      back: { href: "/", label: "Floor" },
      crumbs: [
        { href: "/", label: "Home" },
        { href: "/n/system", label: "System Map" },
      ],
    });
    assert.deepEqual(phoneTrail("/n/system/live"), {
      back: { href: "/n/system", label: "System Map" },
      crumbs: [
        { href: "/", label: "Home" },
        { href: "/n/system", label: "System Map" },
        { href: "/n/system/live", label: "Live" },
      ],
    });
    assert.deepEqual(phoneTrail("/n/system/extra").back, { href: "/", label: "Home" });

    for (const path of [
      "/n/not-a-parent",
      "/n/not-a-parent/foo",
      "/n/ai-stocks/nvda/extra",
      "/nope",
      "/settings/other",
      "/calendar/2026-10-09/extra",
    ]) {
      assert.deepEqual(phoneTrail(path).back, { href: "/", label: "Home" }, path);
    }
  });

  it("keeps tab roots free of a back target and still names nested pages", () => {
    assert.equal(phoneTrail("/").back, null);
    assert.equal(phoneTrail("/log").back, null);
    assert.equal(phoneTrail("/calendar").back, null);
    assert.equal(phoneTrail("/settings/security").back, null);

    assert.deepEqual(phoneTrail("/calendar/2026-10-09").back, {
      href: "/calendar",
      label: "Calendar",
    });
    assert.equal(phoneTrail("/calendar/2026-10-09").crumbs.at(-1)?.label, "Oct 9");

    assert.deepEqual(phoneTrail("/log", "?ticker=NVDA").back, {
      href: "/n/ai-stocks/nvda",
      label: "NVDA",
    });
    assert.equal(phoneTrail("/log", "?ticker=NVDA").back?.href, nodePageHref("NVDA"));
    assert.equal(phoneTrail("/log", "?ticker=XRP").back?.href, nodePageHref("XRP"));
    assert.deepEqual(phoneTrail("/log", "ticker=unknown").back, { href: "/", label: "Home" });

    assert.deepEqual(phoneTrail("/fights").back, { href: "/n/fight-desk", label: "Fight Desk" });
    assert.deepEqual(phoneTrail("/fights/ufc").back, { href: "/fights", label: "Fights" });
    assert.deepEqual(phoneTrail("/fights/contender-series").back, { href: "/fights", label: "Fights" });
    assert.deepEqual(phoneTrail("/fights/ufc-332").back, { href: "/fights/ufc", label: "UFC" });
    assert.deepEqual(phoneTrail("/fights/dwcs-week-1").back, {
      href: "/fights/contender-series",
      label: "Contender Series",
    });
    assert.deepEqual(phoneTrail("/fights/ufc-332/silva-wang").back, {
      href: "/fights/ufc-332",
      label: "UFC 332",
    });
    assert.deepEqual(phoneTrail("/fights/main-card").back, { href: "/fights/ufc", label: "UFC" });
  });
});

describe("phone tabs", () => {
  it("always includes Home and the routes that exist", () => {
    assert.equal(PHONE_TABS[0]?.href, "/");
    assert.deepEqual(
      PHONE_TABS.map((tab) => tab.label),
      ["Home", "Log", "Calendar", "Build", "Settings"],
    );
    assert.equal(phoneTabActive("/", "/"), true);
    assert.equal(phoneTabActive("/", "/n/ai-stocks/nvda"), true);
    assert.equal(phoneTabActive("/", "/n/lessons"), true);
    assert.equal(phoneTabActive("/n/build", "/n/lessons"), false);
    assert.equal(phoneTabActive("/", "/fights/ufc"), true);
    assert.equal(phoneTabActive("/", "/n/build"), false);
    assert.equal(phoneTabActive("/n/build", "/n/build"), true);
    assert.equal(phoneTabActive("/n/build", "/n/build/queue"), true);
    assert.equal(phoneTabActive("/calendar", "/calendar/2026-10-09"), true);
    assert.equal(phoneTabActive("/log", "/log"), true);
    assert.equal(phoneTabActive("/settings/security", "/settings/security"), true);
    assert.equal(phoneTabActive("/log", "/"), false);
  });
});

describe("public trail labels", () => {
  it("replaces the treasury token name and leaves other labels", () => {
    assert.equal(publicTrailLabel("/n/crypto/xrp", "XRP"), "Treasury");
    assert.equal(publicTrailLabel("/n/crypto/sui", "SUI"), "SUI");
    assert.equal(publicTrailLabel("/n/crypto", "Crypto"), "Crypto");
  });
});

describe("standalone swipe thresholds", () => {
  it("commits a left-edge horizontal drag of about 80px", () => {
    assert.equal(SWIPE_EDGE_PX, 24);
    assert.equal(SWIPE_COMMIT_PX, 80);
    assert.equal(swipeDecision(swipe({ startX: 0, x: 80 })), "commit");
    assert.equal(swipeDecision(swipe({ startX: 24, x: 24 + 80 })), "commit");
    assert.equal(swipeDecision(swipe({ startX: 25, x: 25 + 120 })), "ignore");
    assert.equal(swipeDecision(swipe({ x: 8 + 79 })), "track");
    assert.equal(swipeDecision(swipe({ x: 8 + 80, y: 200 + 40 })), "commit");
  });

  it("ignores vertical drags, leftward drags, charts, and sideways scrollers", () => {
    assert.equal(swipeDecision(swipe({ x: 40, y: 200 + 90 })), "ignore");
    assert.equal(swipeDecision(swipe({ x: 0 })), "ignore");
    assert.equal(swipeDecision(swipe({ standalone: false })), "ignore");
    assert.equal(swipeDecision(swipe({ horizontalScroller: true })), "ignore");
    assert.equal(swipeDecision(swipe({ blockedSurface: true })), "ignore");
  });

  it("treats display-mode standalone and navigator.standalone as installed", () => {
    assert.equal(isStandaloneMode({ displayModeStandalone: true, navigatorStandalone: false }), true);
    assert.equal(isStandaloneMode({ displayModeStandalone: false, navigatorStandalone: true }), true);
    assert.equal(isStandaloneMode({ displayModeStandalone: false, navigatorStandalone: false }), false);
  });

  it("still navigates when motion is reduced, and skips the slide", () => {
    assert.equal(swipeDecision(swipe()), "commit");
    assert.equal(swipeShouldAnimate(true), false);
    assert.equal(swipeShouldAnimate(false), true);
  });
});

function pull(overrides: Partial<PullSample> = {}): PullSample {
  return {
    startX: 180,
    startY: 40,
    x: 184,
    y: 40 + PULL_COMMIT_PX,
    scrollTop: 0,
    standalone: true,
    horizontalScroller: false,
    blockedSurface: false,
    ...overrides,
  };
}

describe("standalone pull thresholds", () => {
  it("commits a downward drag of about 70px from the top", () => {
    assert.equal(PULL_COMMIT_PX, 70);
    assert.equal(pullDecision(pull({ y: 40 + 70 })), "commit");
    assert.equal(pullDecision(pull({ y: 40 + 69 })), "track");
    assert.equal(pullDecision(pull({ y: 40 + 70, x: 180 + 30 })), "commit");
  });

  it("ignores a scrolled page, regular Safari, charts, sideways scrollers, and horizontal drags", () => {
    assert.equal(pullDecision(pull({ scrollTop: 1 })), "ignore");
    assert.equal(pullDecision(pull({ standalone: false })), "ignore");
    assert.equal(pullDecision(pull({ horizontalScroller: true })), "ignore");
    assert.equal(pullDecision(pull({ blockedSurface: true })), "ignore");
    assert.equal(pullDecision(pull({ y: 10 })), "ignore");
    assert.equal(pullDecision(pull({ x: 180 + 90, y: 40 + 80 })), "ignore");
    assert.equal(pullDecision(pull({ x: 180 + 70, y: 40 + 70 })), "ignore");
  });

  it("still refreshes when motion is reduced, and skips the spin", () => {
    assert.equal(pullDecision(pull()), "commit");
    assert.equal(pullShouldAnimate(true), false);
    assert.equal(pullShouldAnimate(false), true);
  });

  it("formats the persisted clock line in local time", () => {
    assert.equal(formatUpdatedTime(new Date(2026, 9, 9, 9, 5)), "Updated 9:05");
    assert.equal(formatUpdatedTime(new Date(2026, 9, 9, 0, 0)), "Updated 12:00");
    assert.equal(formatUpdatedTime(new Date(2026, 9, 9, 15, 7)), "Updated 3:07");
    assert.equal(formatUpdatedTime(new Date(2026, 9, 9, 12, 0)), "Updated 12:00");
  });
});

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function matchingBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    const char = css[i];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error("Unclosed CSS block");
}

/** CSS that is not inside a max-width: 640px query. */
function outsidePhoneQuery(css: string): string {
  const source = stripComments(css);
  let outside = "";
  let index = 0;
  while (index < source.length) {
    const media = source.indexOf("@media", index);
    if (media === -1) {
      outside += source.slice(index);
      break;
    }
    outside += source.slice(index, media);
    const brace = source.indexOf("{", media);
    const header = source.slice(media, brace);
    const end = matchingBrace(source, brace);
    const phone = /max-width:\s*640px/.test(header);
    if (!phone) outside += source.slice(media, end + 1);
    index = end + 1;
  }
  return outside;
}

describe("phone CSS does not change desktop", () => {
  it("keeps the desktop body size and hides new chrome only until the phone query", () => {
    const globals = readFileSync(join(root, "src/app/globals.css"), "utf8");
    const body = globals.slice(0, globals.indexOf("@media"));
    assert.match(body, /font-size:\s*16px/);
    assert.equal(globals.includes(".phone-back"), false);
    assert.equal(globals.includes(".phone-tabbar"), false);

    const phone = readFileSync(join(root, "src/app/phone-nav.css"), "utf8");
    const outside = outsidePhoneQuery(phone).replace(/\s+/g, " ").trim();
    assert.equal(
      outside,
      ".phone-back, .phone-crumbs, .phone-tabbar, .phone-refresh { display: none; }",
    );
    assert.match(phone, /@media\s*\(\s*max-width:\s*640px\s*\)/);
    assert.match(phone, /font-size:\s*17px/);
    assert.match(phone, /min-height:\s*48px/);
    assert.match(phone, /min-height:\s*56px/);
    assert.match(phone, /min-height:\s*44px/);
    assert.match(phone, /font-size:\s*14px/);
  });

  it("keeps build-tracker phone type inside the phone query", () => {
    const css = readFileSync(join(root, "src/components/build-tracker.module.css"), "utf8");
    const outside = outsidePhoneQuery(css);
    assert.match(outside, /\.chip\s*\{[^}]*font-size:\s*0\.62rem/);
    assert.match(css, /@media\s*\(\s*max-width:\s*640px\s*\)/);
    const phoneBlock = css.slice(css.indexOf("@media (max-width: 640px)"));
    assert.match(phoneBlock, /\.chip[\s\S]*font-size:\s*14px/);
    assert.doesNotMatch(outside, /font-size:\s*14px/);
  });
});
