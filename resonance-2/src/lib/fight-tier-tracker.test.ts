import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import { createElement, isValidElement, type ReactNode } from "react";
import type { Bet } from "@/lib/bets";
import type { FightBreakdown } from "@/lib/fight-breakdowns";
import { betEventSlug, isReservedFightSlug, resolveFightEventPage } from "@/lib/fight-desk";
import {
  buildTierTracker,
  trackerCard,
  trackerCopy,
  trackerPicks,
  trackerSlice,
  unitStakePnlCents,
  type SliceId,
} from "@/lib/fight-tier-tracker";
import { hasMoneyText } from "@/lib/public-mode";

const NOW = new Date("2026-10-20T18:00:00Z");

function ticket(partial: Partial<Bet> & Pick<Bet, "id" | "status">): Bet {
  return {
    event: "UFC Nashville",
    fight: "Alpha vs Bravo",
    fightSlug: "alpha-vs-bravo",
    pick: "Alpha",
    stake: "2.00",
    oddsPct: 50,
    payout: "4.00",
    venue: "coinbase-predict",
    ticker: "UFC",
    time: "2026-10-17T20:00:00-05:00",
    ...partial,
  };
}

function row(
  partial: Partial<FightBreakdown> & Pick<FightBreakdown, "eventSlug" | "fightSlug">,
): FightBreakdown {
  return {
    fightN: null,
    card: null,
    slot: null,
    division: null,
    rounds: null,
    aName: "Alpha",
    bName: "Bravo",
    lean: "Alpha",
    conf: null,
    tier: null,
    method: null,
    why: null,
    xFactor: null,
    edges: [],
    odds: { pick: "Alpha", noVigPct: 56 },
    stats: null,
    links: null,
    boutOrder: null,
    ...partial,
  };
}

const GATED_STATS = {
  a: { "Losses (KO/Sub/Dec)": "1 / 0 / 0" },
  b: { "Wins (KO/Sub/Dec)": "6 / 2 / 2" },
};

function tileNamed(model: ReturnType<typeof buildTierTracker>, name: string) {
  return model.homeTiles.find((tile) => tile.name === name);
}

describe("unit stake", () => {
  it("scales a win from the recorded payout and a loss to one dollar", () => {
    const won = ticket({ id: "won", status: "won", stake: "4.76", oddsPct: 40, payout: "11.60", realizedPnl: "99.00" });
    const lost = ticket({ id: "lost", status: "lost", stake: "4.76", oddsPct: 40, payout: "11.60", realizedPnl: "-4.76" });
    assert.equal(unitStakePnlCents(won), BigInt(144));
    assert.equal(unitStakePnlCents(lost), -BigInt(100));
  });

  it("leaves the dollar line unrecorded when odds or payout is missing", () => {
    const noOdds = ticket({ id: "no-odds", status: "lost" });
    (noOdds as { oddsPct?: number }).oddsPct = undefined;
    const noPayout = ticket({ id: "no-payout", status: "won", payout: "" });
    const open = ticket({ id: "open", status: "open" });
    assert.equal(unitStakePnlCents(noOdds), null);
    assert.equal(unitStakePnlCents(noPayout), null);
    assert.equal(unitStakePnlCents(open), null);
  });
});

describe("tier tracker", () => {
  it("scores STRONG and LEAN once, and does not invent an empty record", () => {
    const bets = [
      ticket({ id: "ed", status: "won", tier: "STRONG" }),
      ticket({
        id: "veg",
        status: "lost",
        tier: "LEAN",
        event: "UFC Vegas",
        fight: "Charlie vs Delta",
        fightSlug: "charlie-vs-delta",
        pick: "Charlie",
        time: "2026-10-18T20:00:00-05:00",
      }),
      ticket({ id: "open", status: "open", tier: "STRONG" }),
      ticket({ id: "void", status: "void", tier: "STRONG" }),
    ];
    const model = buildTierTracker({ bets, now: NOW });
    assert.equal(model.summary.headline, "1-1");
    assert.equal(model.summary.status, "$0.00");
    assert.equal(tileNamed(model, "STRONG")?.headline, "1-0");
    assert.equal(tileNamed(model, "STRONG")?.status, "+$1.00");
    assert.equal(tileNamed(model, "LEAN")?.headline, "0-1");
    assert.equal(tileNamed(model, "LEAN")?.status, "-$1.00");
    assert.equal(tileNamed(model, "PASS")?.headline, "not recorded");
    assert.equal(tileNamed(model, "KO-gated")?.headline, "not recorded");
    assert.equal(model.summary.headline.includes("0-0"), false);
    const names = model.homeTiles.map((tile) => tile.name);
    assert.deepEqual(names.slice(0, 4), ["STRONG", "LEAN", "PASS", "KO-gated"]);
    assert.equal(names.includes("UFC Vegas"), true);
    assert.equal(names.includes("UFC Nashville"), true);
    assert.equal(trackerSlice(model, "strong")?.tiles.map((tile) => tile.name).includes("UFC Vegas"), false);
    assert.equal(trackerSlice(model, "lean")?.tiles[0]?.href, "/fights/tiers/lean/ufc-vegas");
    assert.equal(trackerCard(model, "ufc-nashville")?.tiles.find((tile) => tile.name === "STRONG")?.href, "/fights/tiers/cards/ufc-nashville/strong");
    const picks = trackerPicks(model, "strong", "ufc-nashville");
    assert.equal(picks?.tiles.length, 1);
    assert.equal(picks?.tiles[0]?.name, "Alpha vs Bravo");
    assert.equal(picks?.tiles[0]?.href, "");
    assert.equal(picks?.tiles[0]?.status, "+$1.00");
    assert.equal(trackerCopy(model).some((line) => line.includes("4.76")), false);
  });

  it("folds an Edmonton ticket onto Buckley and still reads that card's breakdown", () => {
    const buckley = ticket({
      id: "buck",
      status: "won",
      tier: "STRONG",
      event: "UFC Fight Night: Buckley vs Malott",
      time: "2026-10-17T20:00:00-05:00",
    });
    const edmonton = ticket({
      id: "ed",
      status: "lost",
      tier: "LEAN",
      event: "UFC Edmonton",
      fight: "Charlie vs Delta",
      fightSlug: "charlie-vs-delta",
      pick: "Charlie",
      time: "2026-10-17T21:00:00-05:00",
    });
    const breakdown = row({
      eventSlug: "ufc-edmonton",
      fightSlug: buckley.fightSlug,
      tier: "STRONG",
      stats: GATED_STATS,
    });
    const model = buildTierTracker({ bets: [buckley, edmonton], breakdowns: [breakdown], now: NOW });
    const names = model.homeTiles.map((tile) => tile.name);
    assert.equal(names.filter((name) => name === "UFC Fight Night: Buckley vs Malott").length, 1);
    assert.equal(names.includes("UFC Edmonton"), false);
    assert.equal(tileNamed(model, "KO-gated")?.headline, "1-0");
    assert.equal(tileNamed(model, "LEAN")?.headline, "1-1");
    assert.equal(trackerCard(model, "ufc-edmonton")?.title, "UFC Fight Night: Buckley vs Malott");
    assert.equal(trackerPicks(model, "ko-gated", "ufc-edmonton")?.tiles.length, 1);
  });

  it("keeps a recorded win-loss when one price is missing and does not sum a partial book", () => {
    const priced = ticket({ id: "priced", status: "won", tier: "STRONG" });
    const bare = ticket({ id: "bare", status: "lost", tier: "STRONG", fight: "Echo vs Foxtrot", fightSlug: "echo-vs-foxtrot" });
    (bare as { oddsPct?: number }).oddsPct = undefined;
    const model = buildTierTracker({ bets: [priced, bare], now: NOW });
    assert.equal(tileNamed(model, "STRONG")?.headline, "1-1");
    assert.equal(tileNamed(model, "STRONG")?.status, "not recorded");
    assert.equal(model.summary.status, "not recorded");
    assert.notEqual(model.summary.status, "+$1.00");
    const picks = trackerPicks(model, "strong", betEventSlug(bare, []));
    assert.equal(picks?.tiles.find((tile) => tile.name.includes("Echo"))?.status, "not recorded");
  });

  it("uses a note tier and leaves PASS and the KO slice unrecorded without a breakdown", () => {
    const bet = ticket({ id: "note", status: "won", note: "Tier: STRONG" });
    delete (bet as { tier?: string }).tier;
    const model = buildTierTracker({ bets: [bet], now: NOW });
    assert.equal(tileNamed(model, "STRONG")?.headline, "1-0");
    assert.equal(tileNamed(model, "PASS")?.status, "not recorded");
    assert.equal(tileNamed(model, "KO-gated")?.status, "not recorded");
  });

  it("moves a gated STRONG pick to LEAN and the KO slice", () => {
    const bet = ticket({ id: "gated", status: "won", tier: "STRONG", stake: "4.76", oddsPct: 40, payout: "11.60" });
    const slug = betEventSlug(bet, []);
    const breakdown = row({
      eventSlug: slug,
      fightSlug: bet.fightSlug,
      tier: "STRONG",
      stats: GATED_STATS,
    });
    const model = buildTierTracker({ bets: [bet], breakdowns: [breakdown], now: NOW });
    assert.equal(tileNamed(model, "STRONG")?.headline, "not recorded");
    assert.equal(tileNamed(model, "LEAN")?.headline, "1-0");
    assert.equal(tileNamed(model, "LEAN")?.status, "+$1.44");
    assert.equal(tileNamed(model, "KO-gated")?.headline, "1-0");
    assert.equal(tileNamed(model, "KO-gated")?.status, "+$1.44");
    assert.equal(trackerPicks(model, "ko-gated", slug)?.tiles.length, 1);
  });

  it("does not call a different fighter's ticket KO-gated", () => {
    const bet = ticket({ id: "other", status: "lost", tier: "LEAN", pick: "Bravo" });
    const slug = betEventSlug(bet, []);
    const breakdown = row({
      eventSlug: slug,
      fightSlug: bet.fightSlug,
      tier: "STRONG",
      stats: GATED_STATS,
    });
    const model = buildTierTracker({ bets: [bet], breakdowns: [breakdown], now: NOW });
    assert.equal(tileNamed(model, "LEAN")?.headline, "0-1");
    assert.equal(tileNamed(model, "KO-gated")?.headline, "not recorded");
    assert.equal(tileNamed(model, "STRONG")?.headline, "not recorded");
  });

  it("counts a posted PASS and does not invent the KO slice from a missing flag", () => {
    const bet = ticket({ id: "pass", status: "lost" });
    delete (bet as { tier?: string }).tier;
    const slug = betEventSlug(bet, []);
    const breakdown = row({
      eventSlug: slug,
      fightSlug: bet.fightSlug,
      tier: "PASS",
      stats: {
        a: { "Losses (KO/Sub/Dec)": "0 / 0 / 1" },
        b: { "Wins (KO/Sub/Dec)": "1 / 1 / 8" },
      },
    });
    const model = buildTierTracker({ bets: [bet], breakdowns: [breakdown], now: NOW });
    assert.equal(tileNamed(model, "PASS")?.headline, "0-1");
    assert.equal(tileNamed(model, "PASS")?.status, "-$1.00");
    assert.equal(tileNamed(model, "KO-gated")?.headline, "not recorded");
    assert.equal(tileNamed(model, "STRONG")?.headline, "not recorded");
  });

  it("does not apply the gate when the breakdown store is down", () => {
    const bet = ticket({ id: "gated", status: "won", tier: "STRONG" });
    const slug = betEventSlug(bet, []);
    const breakdown = row({
      eventSlug: slug,
      fightSlug: bet.fightSlug,
      tier: "STRONG",
      stats: GATED_STATS,
    });
    const model = buildTierTracker({
      bets: [bet],
      breakdowns: [breakdown],
      breakdownStore: "unavailable",
      now: NOW,
    });
    assert.equal(tileNamed(model, "STRONG")?.headline, "1-0");
    assert.equal(tileNamed(model, "KO-gated")?.headline, "unavailable");
    assert.equal(tileNamed(model, "PASS")?.headline, "unavailable");
    assert.equal(tileNamed(model, "LEAN")?.headline, "not recorded");
  });

  it("says unavailable for the whole tracker when the bet book is down", () => {
    const model = buildTierTracker({
      bets: [ticket({ id: "live", status: "won", tier: "STRONG" })],
      book: "unavailable",
      now: NOW,
    });
    assert.equal(model.summary.headline, "unavailable");
    assert.equal(model.summary.status, "unavailable");
    assert.equal(model.homeTiles.every((tile) => tile.headline === "unavailable"), true);
    assert.equal(Object.keys(model.cards).length, 0);
  });

  it("shows win rate and ROI in public mode and no dollar amount", () => {
    const bets = [
      ticket({ id: "ed", status: "won", tier: "STRONG", stake: "4.76", oddsPct: 40, payout: "11.60" }),
      ticket({
        id: "veg",
        status: "lost",
        tier: "LEAN",
        event: "UFC Vegas",
        fight: "Charlie vs Delta",
        fightSlug: "charlie-vs-delta",
        pick: "Charlie",
        stake: "9.00",
        oddsPct: 60,
        payout: "12.00",
        time: "2026-10-18T20:00:00-05:00",
      }),
    ];
    const model = buildTierTracker({ bets, publicMode: true, now: NOW });
    assert.equal(model.summary.headline, "50% wins");
    assert.equal(model.summary.status, "+22.00% ROI");
    assert.equal(tileNamed(model, "STRONG")?.headline, "100% wins");
    assert.equal(tileNamed(model, "STRONG")?.status, "+144.00% ROI");
    assert.equal(tileNamed(model, "LEAN")?.headline, "0% wins");
    assert.equal(tileNamed(model, "LEAN")?.status, "-100.00% ROI");
    assert.equal(tileNamed(model, "PASS")?.headline, "not recorded");
    for (const line of trackerCopy(model)) {
      assert.equal(hasMoneyText(line), false, line);
      assert.equal(line.includes("$"), false, line);
    }
    assert.equal(trackerCopy(model).some((line) => line.includes("4.76")), false);
    assert.equal(trackerCopy(model).some((line) => line.includes("9.00")), false);
  });

  it("keeps the tiers route from being treated as a fight card", () => {
    assert.equal(isReservedFightSlug("tiers"), true);
    const bet = ticket({ id: "tiers", status: "won", tier: "STRONG", event: "Tiers" });
    assert.equal(resolveFightEventPage("tiers", [bet], []), null);
  });
});

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

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  const props = node.props as { children?: ReactNode; href?: string };
  const href = typeof props.href === "string" ? `[${props.href}]` : "";
  return `${href}${render(props.children)}`;
}

describe("tier tracker tiles", () => {
  it("puts the tracker on the fights node and drills into child tiles only", async () => {
    const { FightIndex } = await import("@/components/fight-board");
    const { TrackerFloor } = await import("@/components/fight-tier-tracker");
    const bets = [
      ticket({ id: "ed", status: "won", tier: "STRONG" }),
      ticket({
        id: "veg",
        status: "lost",
        tier: "LEAN",
        event: "UFC Vegas",
        fight: "Charlie vs Delta",
        fightSlug: "charlie-vs-delta",
        pick: "Charlie",
        time: "2026-10-18T20:00:00-05:00",
      }),
    ];
    const index = render(createElement(FightIndex, { bets, events: [], now: NOW }));
    assert.match(index, /Tier tracker/);
    assert.match(index, /\[\/fights\/tiers\]/);
    assert.match(index, /1-1/);
    assert.match(index, /Upcoming Events/);
    assert.match(index, /Past Events/);

    const model = buildTierTracker({ bets, now: NOW });
    const home = render(
      createElement(TrackerFloor, {
        backHref: "/fights",
        backLabel: "Fights",
        kicker: "Fights",
        title: "Tier tracker",
        tiles: model.homeTiles,
        empty: "not recorded",
      }),
    );
    assert.match(home, /\[\/fights\]/);
    assert.match(home, /STRONG/);
    assert.match(home, /LEAN/);
    assert.match(home, /PASS/);
    assert.match(home, /KO-gated/);
    assert.match(home, /UFC Nashville/);
    assert.equal(home.includes("fight-stakes"), false);
    assert.equal(home.includes("Alpha vs Bravo"), false);

    const strong = trackerSlice(model, "strong" satisfies SliceId);
    const slice = render(
      createElement(TrackerFloor, {
        backHref: "/fights/tiers",
        backLabel: "Tier tracker",
        kicker: "Tier tracker",
        title: strong?.name ?? "",
        tiles: strong?.tiles ?? [],
        empty: strong?.empty ?? "not recorded",
      }),
    );
    assert.match(slice, /\[\/fights\/tiers\]/);
    assert.match(slice, /UFC Nashville/);
    assert.equal(slice.includes("UFC Vegas"), false);
    assert.equal(slice.includes("$2.00"), false);

    const card = trackerCard(model, "ufc-nashville");
    const cardHtml = render(
      createElement(TrackerFloor, {
        backHref: "/fights/tiers",
        backLabel: "Tier tracker",
        kicker: "Tier tracker",
        title: card?.title ?? "",
        tiles: card?.tiles ?? [],
        empty: "not recorded",
      }),
    );
    assert.match(cardHtml, /\[\/fights\/tiers\/cards\/ufc-nashville\/strong\]/);
    assert.equal(cardHtml.includes("Charlie"), false);

    const publicIndex = render(
      createElement(FightIndex, { bets, events: [], now: NOW, publicMode: true }),
    );
    assert.match(publicIndex, /50% wins/);
    assert.match(publicIndex, /0\.00% ROI/);
    assert.equal(publicIndex.includes("$"), false);

    const publicModel = buildTierTracker({ bets, publicMode: true, now: NOW });
    const publicHtml = render(
      createElement(TrackerFloor, {
        backHref: "/fights",
        backLabel: "Fights",
        kicker: "Fights",
        title: "Tier tracker",
        tiles: publicModel.homeTiles,
        empty: "not recorded",
        publicMode: true,
      }),
    );
    assert.match(publicHtml, /100% wins/);
    assert.match(publicHtml, /0% wins/);
    assert.match(publicHtml, /% ROI/);
    assert.equal(publicHtml.includes("$"), false);
    assert.equal(publicHtml.includes("2.00"), false);
    assert.equal(publicHtml.includes("4.76"), false);
  });
});
