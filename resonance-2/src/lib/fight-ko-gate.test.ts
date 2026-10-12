import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { annotateDeskFights } from "@/lib/fight-breakdowns";
import { parseBreakdownBody, resolveFightView } from "@/lib/fight-breakdowns";
import {
  alignedFinishStats,
  applyKoGate,
  enrichFinishStats,
  finishStatRows,
  isLosingStreak,
  koWinPercent,
  opponentStreakSignal,
  r1FinishValue,
  resolveKoPercent,
  tierAfterStreak,
} from "@/lib/fight-ko-gate";
import { fightBySlug } from "@/lib/ufc332";
import { BET_TICKER, BET_VENUE, type Bet } from "@/lib/bets";

type FightDetailComponent = (props: {
  fight: Parameters<typeof resolveFightView>[0] extends never ? never : import("@/lib/ufc332").CatalogFight;
  bets: readonly Bet[];
  backHref?: string;
  backLabel?: string;
  hideEmpty?: boolean;
}) => ReactNode;

const nodeRequire = createRequire(import.meta.url);
const nodeModule = nodeRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
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
    return {
      __esModule: true,
      default: function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string }) {
        return createElement("a", { href: props.href ?? "", className: props.className }, props.children);
      },
    };
  }
  return originalLoad(request, parent, isMain);
};

let fightDetailComponent: FightDetailComponent | null = null;

async function loadFightDetail(): Promise<FightDetailComponent> {
  if (fightDetailComponent) return fightDetailComponent;
  const mod = await import("@/components/fight-board");
  fightDetailComponent = mod.FightDetail as FightDetailComponent;
  return fightDetailComponent;
}

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
    const name = key === "className" ? "class" : key;
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

function edmonton(overrides: {
  tier?: "STRONG" | "LEAN" | null;
  conf?: string;
  pickPct?: number;
  lossKo?: number;
  winsKo?: number;
  winsSub?: number;
  winsDec?: number;
  streak?: string;
  last5?: string[];
  r1?: string;
} = {}) {
  return {
    eventSlug: "ufc-edmonton",
    fights: {
      "1": {
        fightSlug: "our-fighter-vs-ko-artist",
        boutOrder: 1,
        lean: "Our Fighter",
        pick: "Our Fighter",
        conf: overrides.conf ?? "Strong",
        tier: overrides.tier === undefined ? "STRONG" : overrides.tier,
        why: "The plan liked the matchup.",
        ourNoVigPct: overrides.pickPct ?? 70,
        edges: [],
      },
    },
    data: [
      {
        n: 1,
        card: "Main card",
        slot: "Main event",
        wc: "Welterweight",
        A: {
          name: "Our Fighter",
          record: "10-1",
          streak: "3W",
          wins_ko: 4,
          wins_sub: 3,
          wins_dec: 3,
          loss_ko: overrides.lossKo ?? 1,
          loss_sub: 0,
          loss_dec: 0,
          last5: ["WIN vs Someone — Decision (Unanimous), R3 5:00"],
        },
        B: {
          name: "Ko Artist",
          record: "10-2",
          streak: overrides.streak === undefined ? "4L" : overrides.streak,
          wins_ko: overrides.winsKo ?? 6,
          wins_sub: overrides.winsSub ?? 2,
          wins_dec: overrides.winsDec ?? 2,
          loss_ko: 0,
          loss_sub: 1,
          loss_dec: 1,
          last5: overrides.last5 ?? [
            "WIN vs A — KO (Punch), R1 1:11",
            "WIN vs B — KO (Punch), R1 2:00",
            "LOSS vs C — Decision (Unanimous), R3 5:00",
            "WIN vs D — Decision (Split), R3 5:00",
            "WIN vs E — TKO, R2 3:00",
          ],
          ...(overrides.r1 ? { r1_finishes: overrides.r1 } : {}),
        },
      },
    ],
  };
}

function bet(tier: Bet["tier"] = "STRONG"): Bet {
  return {
    id: "edmonton-our-fighter",
    event: "UFC Fight Night: Edmonton",
    fight: "Our Fighter vs Ko Artist",
    fightSlug: "our-fighter-vs-ko-artist",
    pick: "Our Fighter",
    stake: "1.00",
    oddsPct: 70,
    payout: "1.40",
    status: "open",
    venue: BET_VENUE,
    ticker: BET_TICKER,
    time: "2026-10-17T19:00:00-05:00",
    tier,
  };
}

describe("KO gate", () => {
  it("drops a tier and blocks STRONG when the opponent wins 60% or more by KO/TKO", () => {
    const atLine = applyKoGate({
      tier: "STRONG",
      pickPct: 70,
      opponentKoPct: 60,
      pickNeverKod: false,
    });
    assert.equal(atLine.tier, "LEAN");
    assert.equal(atLine.storedTier, "LEAN");
    assert.equal(atLine.gated, true);
    assert.equal(atLine.stakePlan, "free");
    assert.match(atLine.reason ?? "", /KO gate: opponent KO% 60%/);
    assert.notEqual(atLine.storedTier, "STRONG");

    const above = applyKoGate({
      tier: "STRONG",
      pickPct: 74.9,
      opponentKoPct: 80,
      pickNeverKod: true,
    });
    assert.equal(above.storedTier, "LEAN");

    const lean = applyKoGate({
      tier: "LEAN",
      pickPct: 55,
      opponentKoPct: 60,
      pickNeverKod: false,
    });
    assert.equal(lean.tier, "PASS");
    assert.equal(lean.storedTier, null);
    assert.equal(lean.stakePlan, "free");
    assert.match(lean.reason ?? "", /KO gate/);

    const under = applyKoGate({
      tier: "STRONG",
      pickPct: 70,
      opponentKoPct: 59.9,
      pickNeverKod: false,
    });
    assert.equal(under.storedTier, "STRONG");
    assert.equal(under.gated, false);
    assert.equal(under.reason, null);
    assert.equal(under.stakePlan, "PLAY");
  });

  it("keeps STRONG when the pick is rated 75%+ and has never been KO'd", () => {
    const exempt = applyKoGate({
      tier: "STRONG",
      pickPct: 75,
      opponentKoPct: 90,
      pickNeverKod: true,
    });
    assert.equal(exempt.storedTier, "STRONG");
    assert.equal(exempt.gated, false);
    assert.equal(exempt.reason, null);
    assert.equal(exempt.stakePlan, "PLAY");

    const beenKod = applyKoGate({
      tier: "STRONG",
      pickPct: 80,
      opponentKoPct: 90,
      pickNeverKod: false,
    });
    assert.equal(beenKod.storedTier, "LEAN");
    assert.equal(beenKod.gated, true);

    const unknownChin = applyKoGate({
      tier: "STRONG",
      pickPct: 80,
      opponentKoPct: 90,
      pickNeverKod: null,
    });
    assert.equal(unknownChin.storedTier, "LEAN");

    const missingRating = applyKoGate({
      tier: "STRONG",
      pickPct: null,
      opponentKoPct: 90,
      pickNeverKod: true,
    });
    assert.equal(missingRating.storedTier, "LEAN");
  });

  it("treats an opponent losing streak as neutral", () => {
    assert.equal(isLosingStreak("4L"), true);
    assert.equal(isLosingStreak("L3"), true);
    assert.equal(isLosingStreak("4-fight losing streak"), true);
    assert.equal(opponentStreakSignal("4L"), 0);
    assert.equal(opponentStreakSignal("losing streak"), 0);
    assert.equal(tierAfterStreak("LEAN", "4L"), "LEAN");
    assert.equal(tierAfterStreak("STRONG", "6L"), "STRONG");

    const withStreak = applyKoGate({
      tier: "LEAN",
      pickPct: 55,
      opponentKoPct: 40,
      pickNeverKod: false,
      opponentStreak: "4L",
    });
    const without = applyKoGate({
      tier: "LEAN",
      pickPct: 55,
      opponentKoPct: 40,
      pickNeverKod: false,
      opponentStreak: null,
    });
    assert.deepEqual(withStreak, without);
    assert.equal(withStreak.tier, "LEAN");
    assert.notEqual(withStreak.tier, "STRONG");

    const gated = applyKoGate({
      tier: "STRONG",
      pickPct: 70,
      opponentKoPct: 80,
      pickNeverKod: false,
      opponentStreak: "5L",
    });
    const gatedPlain = applyKoGate({
      tier: "STRONG",
      pickPct: 70,
      opponentKoPct: 80,
      pickNeverKod: false,
    });
    assert.equal(gated.tier, gatedPlain.tier);
    assert.equal(gated.tier, "LEAN");
  });

  it("does not invent KO% or an R1 finish when the fields are missing", () => {
    assert.equal(koWinPercent(4, 0), null);
    assert.equal(resolveKoPercent({ winsKo: 4 }), null);
    assert.equal(resolveKoPercent({ winsKo: 3, record: "10-1" }), 30);
    assert.equal(r1FinishValue({ history: null }), null);
    const rows = finishStatRows({});
    assert.equal(rows.length, 0);
    const stats = enrichFinishStats({ Age: "30" });
    assert.equal(stats["KO%"], undefined);
    assert.equal(stats["R1 finishes"], undefined);
    assert.equal(alignedFinishStats({}).map((row) => row.value).join(","), "n/a,n/a");
    const missing = applyKoGate({
      tier: "STRONG",
      pickPct: 80,
      opponentKoPct: null,
      pickNeverKod: true,
    });
    assert.equal(missing.storedTier, "STRONG");
    assert.equal(missing.gated, false);
  });
});

describe("breakdown KO gate and finish stats", () => {
  it("shows KO% and R1 finishes, and a gated pick is not STRONG", async () => {
    const [row] = parseBreakdownBody(edmonton());
    assert.ok(row);
    assert.equal(row.tier, "STRONG");
    assert.equal(row.stats?.b["KO%"], "60%");
    assert.equal(row.stats?.b["R1 finishes"], "2 of 5");
    assert.equal(row.stats?.a["KO%"], "40%");

    const fights = annotateDeskFights(
      [
        {
          slug: "our-fighter-vs-ko-artist",
          title: "Our Fighter vs Ko Artist",
          kicker: "",
          detail: "",
          segment: "main-card",
          bets: [bet()],
        },
      ],
      "ufc-edmonton",
      [row],
    );
    assert.equal(fights[0]?.tier, "LEAN");
    assert.equal(fights[0]?.conf, "Lean");
    assert.equal(fights[0]?.stakePlan, "free");
    assert.match(fights[0]?.tierNote ?? "", /KO gate: opponent KO% 60%/);
    assert.notEqual(fights[0]?.tier, "STRONG");

    const { ListedFightEvent } = await import("@/components/fight-board");
    const cardHtml = render(
      createElement(ListedFightEvent, {
        title: "UFC Edmonton",
        meta: "Rogers Place",
        fights,
        bets: [bet()],
        results: [],
        eventSlug: "ufc-edmonton",
        backHref: "/fights/ufc",
        backLabel: "UFC",
      }),
    );
    assert.match(cardHtml, /KO gate: opponent KO% 60%/);
    assert.match(cardHtml, /free/);
    assert.doesNotMatch(cardHtml, />STRONG</);
    assert.match(cardHtml, /Main card|Our Fighter/);

    const view = resolveFightView({
      eventSlug: "ufc-edmonton",
      fightSlug: "our-fighter-vs-ko-artist",
      breakdowns: [row],
      bets: [bet()],
    });
    assert.equal(view.status, "ready");
    if (view.status !== "ready") return;
    assert.equal(view.fight.A.stats.find((stat) => stat.label === "KO%")?.value, "40%");
    assert.equal(view.fight.B.stats.find((stat) => stat.label === "KO%")?.value, "60%");
    assert.equal(view.fight.B.stats.find((stat) => stat.label === "R1 finishes")?.value, "2 of 5");
    assert.equal(view.fight.tier, "LEAN");
    assert.equal(view.fight.stakePlan, "free");

    const FightDetail = await loadFightDetail();
    const html = render(
      createElement(FightDetail, {
        fight: view.fight,
        bets: view.bets,
        backHref: "/fights/ufc-edmonton",
        backLabel: "UFC Edmonton",
        hideEmpty: true,
      }),
    );
    assert.match(html, /KO%/);
    assert.match(html, /R1 finishes/);
    assert.match(html, /2 of 5/);
    assert.match(html, /KO gate: opponent KO% 60%/);
    assert.match(html, />LEAN</);
    assert.match(html, />free</);
    assert.doesNotMatch(html, />STRONG</);
  });

  it("keeps STRONG on the 75% never-KO'd exception and prefers an explicit R1 field", () => {
    const [row] = parseBreakdownBody(
      edmonton({ pickPct: 75, lossKo: 0, r1: "4 of 9", streak: "4L" }),
    );
    assert.ok(row);
    assert.equal(row.stats?.b["R1 finishes"], "4 of 9");
    const fights = annotateDeskFights(
      [
        {
          slug: "our-fighter-vs-ko-artist",
          title: "Our Fighter vs Ko Artist",
          kicker: "",
          detail: "",
          segment: "main-card",
          bets: [],
        },
      ],
      "ufc-edmonton",
      [row],
    );
    assert.equal(fights[0]?.tier, "STRONG");
    assert.equal(fights[0]?.stakePlan, "PLAY");
    assert.equal(fights[0]?.tierNote ?? null, null);
    assert.equal(fights[0]?.conf, "Strong");
  });

  it("leaves the posted tier alone and omits finish rows when the payload has neither", async () => {
    const [row] = parseBreakdownBody([
      {
        eventSlug: "ufc-edmonton",
        fightSlug: "a-fighter-vs-b-fighter",
        aName: "A Fighter",
        bName: "B Fighter",
        lean: "A Fighter",
        conf: "Strong",
        tier: "STRONG",
        stats: { a: { Age: "30" }, b: { Age: "31", Streak: "4L" } },
        odds: { noVigPct: 80 },
      },
    ]);
    assert.ok(row);
    const view = resolveFightView({
      eventSlug: "ufc-edmonton",
      fightSlug: "a-fighter-vs-b-fighter",
      breakdowns: [row],
      bets: [],
    });
    assert.equal(view.status, "ready");
    if (view.status !== "ready") return;
    assert.equal(view.fight.tier, "STRONG");
    assert.equal(view.fight.tierNote, undefined);
    assert.equal(view.fight.A.stats.some((stat) => stat.label === "KO%"), false);
    assert.equal(view.fight.B.stats.some((stat) => stat.label === "R1 finishes"), false);
    const FightDetail = await loadFightDetail();
    const html = render(
      createElement(FightDetail, {
        fight: view.fight,
        bets: [],
        backHref: "/fights/ufc-edmonton",
        backLabel: "UFC Edmonton",
        hideEmpty: true,
      }),
    );
    assert.doesNotMatch(html, /KO%/);
    assert.doesNotMatch(html, /R1 finishes/);
    assert.doesNotMatch(html, /KO gate/);
  });

  it("a losing streak does not promote the card tier", () => {
    const [row] = parseBreakdownBody(
      edmonton({
        tier: "LEAN",
        conf: "Lean",
        pickPct: 55,
        winsKo: 2,
        winsSub: 3,
        winsDec: 5,
        streak: "4L",
      }),
    );
    assert.ok(row);
    assert.equal(row.stats?.b["KO%"], "20%");
    const fights = annotateDeskFights(
      [
        {
          slug: "our-fighter-vs-ko-artist",
          title: "Our Fighter vs Ko Artist",
          kicker: "",
          detail: "",
          segment: "prelims",
          bets: [],
        },
      ],
      "ufc-edmonton",
      [row],
    );
    assert.equal(fights[0]?.tier, "LEAN");
    assert.equal(fights[0]?.tierNote ?? null, null);
    assert.equal(fights[0]?.stakePlan, "free");
    assert.equal(fights[0]?.segment, "prelims");
  });
});

describe("catalog finish stats", () => {
  it("renders KO% and R1 finishes from the UFC 332 card file", async () => {
    const fight = fightBySlug("eric-nolan-vs-court-mcgee");
    assert.ok(fight);
    assert.equal(fight.A.stats.find((stat) => stat.label === "KO%")?.value, "50%");
    assert.equal(fight.A.stats.find((stat) => stat.label === "R1 finishes")?.value, "2 of 5");
    assert.equal(fight.B.stats.find((stat) => stat.label === "KO%")?.value, "22.7%");
    assert.equal(fight.B.stats.find((stat) => stat.label === "R1 finishes")?.value, "1 of 5");
    const FightDetail = await loadFightDetail();
    const html = render(
      createElement(FightDetail, {
        fight,
        bets: [],
        hideEmpty: false,
      }),
    );
    assert.match(html, /KO%/);
    assert.match(html, /50%/);
    assert.match(html, /R1 finishes/);
    assert.match(html, /2 of 5/);
    assert.match(html, /22\.7%/);
  });
});
