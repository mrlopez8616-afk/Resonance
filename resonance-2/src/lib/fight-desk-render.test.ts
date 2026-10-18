import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { createElement, isValidElement, type ReactNode } from "react";
import { betToFill, parseBetPostBody, parseSettleBody, placeBet, settleBet, type Bet } from "@/lib/bets";
import { parseBetsEnvelope } from "@/lib/bets-store-core";
import { cardInBankroll, computeBankroll, fightCardDay } from "@/lib/bankroll";
import { chicagoDay } from "@/lib/calendar-time";
import prodBetsBody from "@/lib/fixtures/prod-bets-2026-10-17.json";
import { deskFightsForEvent, parseBreakdownBody, resolveFightView } from "@/lib/fight-breakdowns";
import { isUfc332Bet, resolveFightEventPage, sortCardFights } from "@/lib/fight-desk";
import { fightBySlug } from "@/lib/ufc332";

const EVENT = "UFC Fight Night: Buckley vs Malott";
const EVENT_SLUG = "ufc-fight-night-buckley-vs-malott";
const WHEN = "2026-10-17T09:51:00-05:00";
const LONG_WHY = `KO${"W".repeat(4000)}`;
const DUP_LINE = "WIN vs A — KO (Punch), R1 1:11";

const CARD: { n: number; id: string; fight: string; slug: string; pick: string; stake: string; oddsPct: number; payout: string }[] = [
  { n: 1, id: "ufc-fn-2026-10-17-cody-chovancek", fight: "Cody Chovancek vs SuYoung You", slug: "cody-chovancek-vs-suyoung-you", pick: "Cody Chovancek", stake: "0.96", oddsPct: 54, payout: "1.77" },
  { n: 2, id: "ufc-fn-2026-10-17-melissa-croden", fight: "Melissa Croden vs Chelsea Chandler", slug: "melissa-croden-vs-chelsea-chandler", pick: "Melissa Croden", stake: "2.92", oddsPct: 76, payout: "3.84" },
  { n: 3, id: "ufc-fn-2026-10-17-steven-koslow", fight: "Chad Anheliger vs Steven Koslow", slug: "chad-anheliger-vs-steven-koslow", pick: "Steven Koslow", stake: "0.95", oddsPct: 62, payout: "1.54" },
  { n: 4, id: "ufc-fn-2026-10-17-katlyn-cerminara", fight: "Katlyn Cerminara vs Mackenzie Stiller", slug: "katlyn-cerminara-vs-mackenzie-stiller", pick: "Katlyn Cerminara", stake: "0.96", oddsPct: 70, payout: "1.37" },
  { n: 5, id: "ufc-fn-2026-10-17-joel-faglier", fight: "Javad Mahjoub vs Joel Faglier", slug: "javad-mahjoub-vs-joel-faglier", pick: "Joel Faglier", stake: "0.96", oddsPct: 55, payout: "1.74" },
  { n: 6, id: "ufc-fn-2026-10-17-nick-galanti", fight: "Julien Leblanc vs Nick Galanti", slug: "julien-leblanc-vs-nick-galanti", pick: "Nick Galanti", stake: "2.92", oddsPct: 86, payout: "3.40" },
  { n: 7, id: "ufc-fn-2026-10-17-jhonata-diniz", fight: "Tanner Boser vs Jhonata Diniz", slug: "tanner-boser-vs-jhonata-diniz", pick: "Jhonata Diniz", stake: "0.96", oddsPct: 67, payout: "1.43" },
  { n: 8, id: "ufc-fn-2026-10-17-mandel-nallo", fight: "Mandel Nallo vs Nate Landwehr", slug: "mandel-nallo-vs-nate-landwehr", pick: "Mandel Nallo", stake: "0.96", oddsPct: 73, payout: "1.32" },
  { n: 9, id: "ufc-fn-2026-10-17-louis-jourdain", fight: "Louis Jourdain vs Timmy Cuamba", slug: "louis-jourdain-vs-timmy-cuamba", pick: "Louis Jourdain", stake: "1.69", oddsPct: 62, payout: "2.72" },
  { n: 10, id: "ufc-fn-2026-10-17-kyle-daukaus", fight: "Marc-Andre Barriault vs Kyle Daukaus", slug: "marc-andre-barriault-vs-kyle-daukaus", pick: "Kyle Daukaus", stake: "0.96", oddsPct: 65, payout: "1.47" },
  { n: 11, id: "ufc-fn-2026-10-17-cristian-perez", fight: "Kyle Nelson vs Cristian Perez", slug: "kyle-nelson-vs-cristian-perez", pick: "Cristian Perez", stake: "1.69", oddsPct: 76, payout: "2.23" },
  { n: 12, id: "ufc-fn-2026-10-17-erin-blanchfield", fight: "Erin Blanchfield vs Jasmine Jasudavicius", slug: "erin-blanchfield-vs-jasmine-jasudavicius", pick: "Erin Blanchfield", stake: "2.92", oddsPct: 76, payout: "3.84" },
  { n: 13, id: "ufc-fn-2026-10-17-mike-malott", fight: "Joaquin Buckley vs Mike Malott", slug: "joaquin-buckley-vs-mike-malott", pick: "Mike Malott", stake: "1.02", oddsPct: 56, payout: "1.83" },
];

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
  return render((node.props as { children?: ReactNode }).children);
}

function names(fight: string): [string, string] {
  const parts = fight.split(/\s+vs\.?\s+/);
  return [parts[0] ?? "Fighter A", parts[1] ?? "Fighter B"];
}

function edmontonBets(): Bet[] {
  const posts = parseBetPostBody({
    bets: CARD.map((row) => ({
      orderId: row.id,
      id: row.id,
      event: EVENT,
      fight: row.fight,
      fightSlug: row.slug,
      pick: row.pick,
      stake: row.stake,
      oddsPct: row.oddsPct,
      payout: row.payout,
      time: WHEN,
      status: "open",
      venue: "coinbase-predict",
      ticker: "UFC",
      hubLean: row.pick,
      agreesWithLean: true,
      note: `UFC Edmonton, bout ${row.n} of 13.`,
    })),
  });
  let bets: Bet[] = [];
  for (const post of posts) bets = placeBet(bets, post, WHEN).bets;
  return bets;
}

function edmontonBreakdowns() {
  const fights: Record<string, unknown> = {};
  const data = CARD.map((row) => {
    const [aName, bName] = names(row.fight);
    const main = row.n === 13;
    fights[String(row.n)] = {
      fightSlug: row.slug,
      boutOrder: row.n,
      lean: row.pick,
      pick: row.pick,
      conf: main ? "Strong" : "Lean",
      tier: main ? "STRONG" : "LEAN",
      why: main ? LONG_WHY : `Bout ${row.n} plan.`,
      ourNoVigPct: row.oddsPct,
      edges: main ? ["**Same edge**", "Same edge"] : [`Edge ${row.n}`],
    };
    return {
      n: row.n,
      card: row.n >= 11 ? "Main card" : row.n >= 5 ? "Prelims" : "Early prelims",
      slot: `${row.n}:00 PM`,
      wc: "Welterweight",
      A: {
        name: aName,
        record: "10-2",
        streak: "2W",
        wins_ko: main ? 6 : 3,
        wins_sub: 2,
        wins_dec: main ? 2 : 5,
        loss_ko: 1,
        loss_sub: 0,
        loss_dec: 1,
        last5: ["WIN vs A — Decision (Unanimous), R3 5:00"],
      },
      B: {
        name: bName,
        record: "12-1",
        streak: main ? "4L" : "1W",
        wins_ko: 4,
        wins_sub: 3,
        wins_dec: 3,
        loss_ko: main ? 1 : 0,
        loss_sub: 0,
        loss_dec: 0,
        last5: main
          ? [DUP_LINE, DUP_LINE, "LOSS vs C — Decision (Unanimous), R3 5:00", "WIN vs D — Decision (Split), R3 5:00", "WIN vs E — TKO, R2 3:00"]
          : ["WIN vs B — Decision (Unanimous), R3 5:00"],
        last3: main ? [DUP_LINE, DUP_LINE, "LOSS vs C — Decision (Unanimous), R3 5:00"] : ["WIN vs B — Decision (Unanimous), R3 5:00"],
        ...(main ? {} : { r1_finishes: "1 of 5" }),
      },
    };
  });
  const rows = parseBreakdownBody({ eventSlug: EVENT_SLUG, fights, data });
  const main = rows.find((row) => row.fightSlug === "joaquin-buckley-vs-mike-malott");
  if (main) main.edges = [...main.edges, 12 as unknown as string];
  return rows;
}

describe("Edmonton fight desk render", () => {
  it("renders 13 bets and KO-gate breakdowns without throwing or inventing money", async () => {
    const bets = edmontonBets();
    const breakdowns = edmontonBreakdowns();
    assert.equal(bets.length, 13);
    assert.equal(breakdowns.length, 13);

    const resolved = resolveFightEventPage(EVENT_SLUG, bets, []);
    assert.equal(resolved?.kind, "listed");
    if (resolved?.kind !== "listed") return;
    const fights = deskFightsForEvent(resolved.slug, resolved.fights, breakdowns);
    assert.equal(fights.length, 13);
    const mainCard = fights.find((fight) => fight.slug === "joaquin-buckley-vs-mike-malott");
    assert.equal(mainCard?.tier, "LEAN");
    assert.match(mainCard?.tierNote ?? "", /KO gate: opponent KO% 60%/);
    assert.equal(mainCard?.why, LONG_WHY);

    const { ListedFightEvent, FightDetail } = await import("@/components/fight-board");
    const cardHtml = render(
      createElement(ListedFightEvent, {
        title: resolved.title,
        meta: "Rogers Place",
        fights,
        bets,
        results: [],
        eventSlug: EVENT_SLUG,
        backHref: "/fights/ufc",
        backLabel: "UFC",
      }),
    );
    for (const row of CARD) assert.match(cardHtml, new RegExp(row.pick.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(cardHtml, /KO gate: opponent KO% 60%/);
    assert.ok(cardHtml.includes(LONG_WHY));

    const view = resolveFightView({
      eventSlug: EVENT_SLUG,
      fightSlug: "joaquin-buckley-vs-mike-malott",
      breakdowns,
      bets,
    });
    assert.equal(view.status, "ready");
    if (view.status !== "ready") return;
    assert.equal(view.fight.A.stats.find((stat) => stat.label === "KO%")?.value, "60%");
    assert.equal(view.fight.B.stats.find((stat) => stat.label === "R1 finishes")?.value, "2 of 5");
    const detailHtml = render(
      createElement(FightDetail, {
        fight: view.fight,
        bets: view.bets,
        backHref: `/fights/${EVENT_SLUG}`,
        backLabel: EVENT,
        hideEmpty: true,
      }),
    );
    assert.match(detailHtml, /KO%/);
    assert.match(detailHtml, /R1 finishes/);
    assert.match(detailHtml, /2 of 5/);
    assert.equal(detailHtml.split(DUP_LINE).length - 1, 2);
    assert.equal(detailHtml.split("Same edge").length - 1, 2);

    const odd = {
      ...bets.find((bet) => bet.fightSlug === "joaquin-buckley-vs-mike-malott")!,
      stake: "1,024.00",
      payout: "n/a",
      realizedPnl: "pending",
      oddsPct: null as unknown as number,
    };
    const oddHtml = render(
      createElement(FightDetail, {
        fight: view.fight,
        bets: [odd],
        backHref: `/fights/${EVENT_SLUG}`,
        backLabel: EVENT,
        hideEmpty: true,
      }),
    );
    assert.match(oddHtml, /1,024\.00/);
    assert.match(oddHtml, /pending/);
    assert.match(oddHtml, /n\/a/);
    assert.doesNotMatch(oddHtml, /\$1,024/);

    const oddCard = render(
      createElement(ListedFightEvent, {
        title: resolved.title,
        meta: "",
        fights: [{ ...mainCard!, bets: [odd] }],
        bets: [odd],
        results: [],
        eventSlug: EVENT_SLUG,
        backHref: "/fights/ufc",
        backLabel: "UFC",
      }),
    );
    assert.match(oddCard, /unavailable/);
    assert.doesNotMatch(oddCard, /\$1,024/);
  });

  it("files the prod Buckley card from the title, including a breakdown with no mapped slug", () => {
    const envelope = parseBetsEnvelope(prodBetsBody);
    assert.ok(envelope);
    assert.equal(envelope.bets.length, 51);
    const buckley = envelope.bets.filter((bet) => bet.event === EVENT);
    assert.equal(buckley.length, 13);
    for (const bet of buckley) {
      assert.equal(isUfc332Bet(bet), false);
      assert.equal(fightBySlug(bet.fightSlug), null);
      assert.equal(chicagoDay(bet.time), "2026-10-17");
      assert.equal(bet.time.endsWith("-05:00"), true);
      assert.equal(bet.status, "open");
      assert.equal(bet.settledAt, undefined);
      assert.equal(bet.settledPayout, undefined);
      assert.equal(bet.realizedPnl, undefined);
      assert.equal(bet.orderId, undefined);
    }
    const stolen = {
      ...buckley[0]!,
      id: "buckley-catalog-slug",
      fightSlug: "natalia-silva-vs-wang-cong",
    };
    assert.equal(isUfc332Bet(stolen), false);
    assert.equal(fightBySlug(stolen.fightSlug)?.slug, "natalia-silva-vs-wang-cong");

    const resolved = resolveFightEventPage(EVENT_SLUG, envelope.bets, []);
    assert.equal(resolved?.kind, "listed");
    if (resolved?.kind !== "listed") return;
    assert.equal(resolved.bets.length, 13);
    const ordered = sortCardFights(resolved.fights);
    assert.deepEqual(
      ordered.map((fight) => fight.slug),
      [
        "cody-chovancek-vs-suyoung-you",
        "melissa-croden-vs-chelsea-chandler",
        "chad-anheliger-vs-steven-koslow",
        "katlyn-cerminara-vs-mackenzie-stiller",
        "javad-mahjoub-vs-joel-faglier",
        "julien-leblanc-vs-nick-galanti",
        "tanner-boser-vs-jhonata-diniz",
        "mandel-nallo-vs-nate-landwehr",
        "louis-jourdain-vs-timmy-cuamba",
        "marc-andre-barriault-vs-kyle-daukaus",
        "kyle-nelson-vs-cristian-perez",
        "erin-blanchfield-vs-jasmine-jasudavicius",
        "joaquin-buckley-vs-mike-malott",
      ],
    );
    assert.equal(fightCardDay(EVENT_SLUG, EVENT, []), null);
    assert.equal(cardInBankroll(null, buckley), true);
    const ledger = computeBankroll(envelope.bets, []);
    assert.equal(ledger.cards.some((card) => card.slug === EVENT_SLUG), true);

    const posted = parseBreakdownBody({
      event: EVENT,
      fights: {
        "13": {
          fightSlug: "joaquin-buckley-vs-mike-malott",
          lean: "Mike Malott",
          tier: "PASS",
          ourNoVigPct: 56,
        },
      },
    });
    assert.equal(posted[0]?.eventSlug, EVENT_SLUG);
    assert.equal(posted[0]?.tier, null);
    const mismatched = parseBreakdownBody({
      eventSlug: "ufc-edmonton",
      fights: {
        "joaquin-buckley-vs-mike-malott": {
          lean: "Mike Malott",
          tier: "Strong",
          ourNoVigPct: 56,
        },
      },
    });
    const fights = deskFightsForEvent(EVENT_SLUG, resolved.fights, mismatched);
    const main = fights.find((fight) => fight.slug === "joaquin-buckley-vs-mike-malott");
    assert.equal(main?.lean, "Mike Malott");
    assert.equal(main?.tier, "STRONG");
    const view = resolveFightView({
      eventSlug: EVENT_SLUG,
      fightSlug: "joaquin-buckley-vs-mike-malott",
      breakdowns: mismatched,
      bets: envelope.bets,
    });
    assert.equal(view.status, "ready");
    if (view.status !== "ready") return;
    assert.equal(view.bets.length, 1);
    assert.equal(view.fight.lean, "Mike Malott");
  });

  it("shows a draw count and the word draw on the log, fight, and event", async () => {
    const open: Bet = {
      id: "draw-partial",
      event: "Test Card",
      fight: "A vs B",
      fightSlug: "a-vs-b",
      pick: "A",
      stake: "0.96",
      oddsPct: 50,
      payout: "1.80",
      status: "open",
      venue: "coinbase-predict",
      ticker: "UFC",
      time: "2026-10-18T12:00:00-05:00",
    };
    const [request] = parseSettleBody({
      id: open.id,
      status: "draw",
      settledPayout: "0.92",
      settledAt: "2026-10-18T20:00:00-05:00",
    });
    const drawn = settleBet(open, request, "2026-10-18T21:00:00.000Z").bet;
    const { ListedFightEvent } = await import("@/components/fight-board");
    const eventHtml = render(
      createElement(ListedFightEvent, {
        title: "Test Card",
        meta: "Arena",
        fights: [
          {
            slug: "a-vs-b",
            title: "A vs B",
            kicker: "Main",
            detail: "",
            segment: null,
            bets: [drawn],
          },
        ],
        bets: [drawn],
        results: [],
        eventSlug: "test-card",
        backHref: "/fights",
        backLabel: "Fights",
      }),
    );
    assert.match(eventHtml, /0-0-1/);
    assert.match(eventHtml, /1 draw/);
    assert.match(eventHtml, /· draw/);
    assert.match(eventHtml, /-\$0\.04/);

    const { BetFillCard } = await import("@/components/fill-log");
    const logHtml = render(createElement(BetFillCard, { fill: betToFill(drawn) }));
    assert.match(logHtml, /statusdraw/);

    const { BetScorecard, UfcBookPanel } = await import("@/components/bet-scorecard");
    const bookHtml = render(createElement(UfcBookPanel, { bets: [drawn] }));
    assert.match(bookHtml, /0-0-1/);
    assert.match(bookHtml, /1 draw/);
    const scoreHtml = render(createElement(BetScorecard, { bets: [drawn] }));
    assert.match(scoreHtml, /0-0/);
    assert.match(scoreHtml, /1 draw/);
  });

  it("keeps fight text inside the page width", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    assert.match(css, /\.log-canvas \{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.fight-card \{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.fight-table \{[^}]*table-layout:\s*fixed/);
    assert.match(css, /\.fight-table th,\s*\.fight-table td \{[^}]*overflow-wrap:\s*anywhere/);
  });
});
