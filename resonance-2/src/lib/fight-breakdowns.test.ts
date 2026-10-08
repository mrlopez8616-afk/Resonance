import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { GET, POST } from "@/app/api/fights/breakdown/route";
import { BET_TICKER, BET_VENUE, type Bet } from "@/lib/bets";
import { resetBlobReadCacheForTests, setBlobSdkForTests } from "@/lib/blob-read";
import { applyStaticCard, DWCS_S10_WEEK_9 } from "@/data/dwcs-cards";
import { eventBoutSections } from "@/lib/fight-desk";
import {
  annotateDeskFights,
  applyBreakdowns,
  derivedBoutOrder,
  fightDetailVisibility,
  deskFightsForEvent,
  fightsFromBreakdowns,
  linksColumn,
  parseBreakdownBody,
  resolveFightView,
  type FightBreakdown,
} from "@/lib/fight-breakdowns";
import { postFightBreakdowns } from "@/lib/fight-breakdowns-store";
import { setSqlClientForTests, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { newDb } from "pg-mem";

const EVENT = "ufc-fight-night-allen-vs-duncan";
const SLUG = "brendan-allen-vs-christian-leroy-duncan";

function camel(overrides: Record<string, unknown> = {}) {
  return {
    eventSlug: EVENT,
    fightSlug: SLUG,
    lean: "Brendan Allen",
    conf: "Lean",
    tier: "LEAN",
    why: "Allen is the better grappler.",
    xFactor: "The line moved.",
    edges: ["**Form:** Allen 15-4 UFC."],
    ...overrides,
  };
}

function bet(overrides: Partial<Bet> = {}): Bet {
  return {
    id: "ufc-fn-2026-10-10-brendan-allen",
    event: "UFC Fight Night: Allen vs Duncan",
    fight: "Brendan Allen vs Christian Leroy Duncan",
    fightSlug: SLUG,
    pick: "Brendan Allen",
    stake: "0.96",
    oddsPct: 56,
    payout: "1.71",
    status: "open",
    venue: BET_VENUE,
    ticker: BET_TICKER,
    time: "2026-10-07T12:00:00-05:00",
    ...overrides,
  };
}

function siteFight() {
  return {
    event: "UFC Fight Night: Allen vs Duncan",
    eventSlug: EVENT,
    fights: {
      "1": {
        fightSlug: SLUG,
        lean: "Brendan Allen",
        pick: "Brendan Allen",
        conf: "Lean",
        tier: "LEAN",
        method: "Decision or submission",
        why: "Allen is the better grappler.",
        x: "The line moved.",
        edges: ["**Form:** Allen 15-4 UFC."],
        oddsAsBetPct: 56,
        ourNoVigPct: 56,
        kalshiFairPct: 56.9,
      },
      "4": {
        fightSlug: "andre-fili-vs-kai-kamaka-iii",
        lean: "Andre Fili",
        conf: "Pass",
        tier: null,
        why: "Too close to play.",
        x: "Plan said skip.",
        edges: [],
      },
    },
  };
}

describe("breakdown validation", () => {
  it("rejects unknown tiers and a slug that is not lowercase", () => {
    assert.throws(() => parseBreakdownBody([camel({ tier: "LOCK" })]), /tier must be STRONG, LEAN, or null/);
    assert.throws(() => parseBreakdownBody([camel({ tier: "strong" })]), /tier must be STRONG, LEAN, or null/);
    assert.throws(() => parseBreakdownBody([camel({ tier: "PASS" })]), /tier must be STRONG, LEAN, or null/);
    assert.throws(() => parseBreakdownBody([camel({ eventSlug: "UFC-332" })]), /eventSlug must be a lowercase slug/);
  });

  it("accepts STRONG, LEAN, null, a bare array, and {breakdowns}", () => {
    const strong = parseBreakdownBody([camel({ tier: "STRONG", conf: "Strong" })])[0];
    const lean = parseBreakdownBody({ breakdowns: [camel()] })[0];
    const pass = parseBreakdownBody([camel({ tier: null, conf: "Pass" })])[0];
    assert.equal(strong?.tier, "STRONG");
    assert.equal(lean?.tier, "LEAN");
    assert.equal(pass?.tier, null);
    assert.equal(lean?.xFactor, "The line moved.");
  });

  it("accepts site_analysis.json and an optional data array", () => {
    const plain = parseBreakdownBody(siteFight());
    assert.equal(plain.length, 2);
    assert.equal(plain[0]?.eventSlug, EVENT);
    assert.equal(plain[0]?.fightN, 1);
    assert.equal(plain[0]?.xFactor, "The line moved.");
    assert.equal(plain[0]?.odds?.betPct, 56);
    assert.equal(plain[0]?.odds?.kalshiFairPct, 56.9);
    assert.equal(plain[0]?.aName, null);
    assert.equal(plain[1]?.tier, null);
    assert.equal(plain[1]?.conf, "Pass");

    const withData = parseBreakdownBody({
      ...siteFight(),
      data: [
        {
          n: 1,
          card: "Main card",
          slot: "Main event",
          wc: "Middleweight",
          rounds: 5,
          ml_med: [-143, 115],
          fair: [56, 44],
          A: { name: "Brendan Allen", record: "27-7-0", age: 30, ml_books: { FanDuel: -154 } },
          B: { name: "Christian Leroy Duncan", record: "15-2-0" },
        },
      ],
    });
    const main = withData[0];
    assert.equal(main?.aName, "Brendan Allen");
    assert.equal(main?.bName, "Christian Leroy Duncan");
    assert.equal(main?.card, "Main card");
    assert.equal(main?.division, "Middleweight");
    assert.equal(main?.rounds, 5);
    assert.equal(main?.stats?.a["Record (Sherdog)"], "27-7-0");
    assert.equal(main?.stats?.a.Age, "30");
    assert.equal(main?.odds?.medianMl?.a, -143);
    assert.equal(main?.links?.a?.books?.FanDuel, -154);
    assert.equal(main?.links?.a?.noVigPct, 56);
  });

  it("refuses a bare data.json array", () => {
    assert.throws(
      () => parseBreakdownBody([{ n: 1, A: { name: "A" }, B: { name: "B" } }]),
      /data\.json/,
    );
  });
});

describe("breakdown upsert", () => {
  it("inserts, dedupes an identical row, and updates a changed one", () => {
    const first = applyBreakdowns([], parseBreakdownBody([camel()]));
    assert.equal(first.changed, true);
    assert.equal(first.results[0]?.deduped, false);
    const again = applyBreakdowns(first.rows, parseBreakdownBody([camel()]));
    assert.equal(again.changed, false);
    assert.equal(again.results[0]?.deduped, true);
    assert.equal(again.results.every((row) => row.deduped), true);
    const edited = applyBreakdowns(again.rows, parseBreakdownBody([camel({ why: "Updated why." })]));
    assert.equal(edited.changed, true);
    assert.equal(edited.results[0]?.deduped, false);
    assert.equal(edited.rows[0]?.why, "Updated why.");
  });
});

describe("fight page resolver", () => {
  const breakdown = (): FightBreakdown => parseBreakdownBody(siteFight())[0] as FightBreakdown;

  it("resolves a breakdown with no bet", () => {
    const view = resolveFightView({ eventSlug: EVENT, fightSlug: SLUG, breakdowns: [breakdown()], bets: [] });
    assert.equal(view.status, "ready");
    if (view.status !== "ready") return;
    assert.equal(view.fight.lean, "Brendan Allen");
    assert.equal(view.fight.confidence, "Lean");
    assert.equal(view.fight.xFactor, "The line moved.");
    assert.equal(view.fight.edges[0], "Form: Allen 15-4 UFC.");
    assert.equal(view.bets.length, 0);
    const visible = fightDetailVisibility(view.fight, view.bets, null);
    assert.equal(visible.lean, true);
    assert.equal(visible.stake, false);
    assert.equal(visible.stats, false);
    assert.equal(visible.highlights, false);
  });

  it("resolves a bet with no breakdown and hides empty analysis", () => {
    const view = resolveFightView({ eventSlug: EVENT, fightSlug: SLUG, breakdowns: [], bets: [bet()] });
    assert.equal(view.status, "ready");
    if (view.status !== "ready") return;
    assert.equal(view.fight.A.name, "Brendan Allen");
    assert.equal(view.fight.B.name, "Christian Leroy Duncan");
    assert.equal(view.fight.lean, undefined);
    assert.equal(view.bets.length, 1);
    const visible = fightDetailVisibility(view.fight, view.bets, null);
    assert.equal(visible.lean, false);
    assert.equal(visible.odds, false);
    assert.equal(visible.stats, false);
    assert.equal(visible.stake, true);
    assert.equal(visible.result, true);
  });

  it("is missing when neither a breakdown nor a bet exists", () => {
    const view = resolveFightView({
      eventSlug: EVENT,
      fightSlug: "nobody-vs-nobody",
      breakdowns: [breakdown()],
      bets: [bet()],
    });
    assert.equal(view.status, "missing");
  });

  it("keeps UFC 332 on the static catalog", () => {
    const staticView = resolveFightView({
      eventSlug: "ufc-332",
      fightSlug: "natalia-silva-vs-wang-cong",
      breakdowns: [],
      bets: [],
    });
    assert.equal(staticView.status, "static");
    const ignored = resolveFightView({
      eventSlug: "ufc-332",
      fightSlug: "not-a-real-fight",
      breakdowns: [breakdown()],
      bets: [bet({ fightSlug: "not-a-real-fight", event: "UFC 332: Silva vs Wang" })],
    });
    assert.equal(ignored.status, "missing");
  });

  it("puts lean, conf, tier, and why on the fight card and links it", () => {
    const [row] = parseBreakdownBody(siteFight());
    assert.ok(row);
    const fights = annotateDeskFights(
      [
        {
          slug: SLUG,
          title: "Brendan Allen vs Christian Leroy Duncan",
          kicker: "",
          detail: "",
          segment: "main-card",
          bets: [bet()],
        },
      ],
      EVENT,
      [row],
    );
    assert.equal(fights[0]?.href, `/fights/${EVENT}/${SLUG}`);
    assert.equal(fights[0]?.lean, "Brendan Allen");
    assert.equal(fights[0]?.conf, "Lean");
    assert.equal(fights[0]?.tier, "LEAN");
    assert.equal(fights[0]?.why, "Allen is the better grappler.");
    assert.equal(fights[0]?.segment, "main-card");
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ALLEN_FIRST_TO_LAST = [
  "ernesta-kareckaite-vs-melissa-gatto",
  "alice-pereira-vs-darya-zheleznyakova",
  "allen-frye-jr-vs-rj-harris",
  "felipe-franco-vs-brendson-ribeiro",
  "niko-price-vs-leon-shahbazyan",
  "francisco-prado-vs-ismael-bonfim",
  "julius-walker-vs-gerald-meerschaert",
  "malcolm-wellmaker-vs-otari-tanzilovi",
  "andre-fili-vs-kai-kamaka-iii",
  "lupita-godinez-vs-ketlen-souza",
  "matheus-camilo-vs-jai-herbert",
  "brendan-allen-vs-christian-leroy-duncan",
] as const;

function allenSite() {
  const fights: Record<string, { fightSlug: string }> = {};
  const data: { n: number; card: string; A: { name: string }; B: { name: string } }[] = [];
  ALLEN_FIRST_TO_LAST.forEach((slug, index) => {
    const n = ALLEN_FIRST_TO_LAST.length - index;
    const card = n <= 5 ? "Main card" : "Prelims";
    fights[String(n)] = { fightSlug: slug };
    data.push({ n, card, A: { name: "A" }, B: { name: "B" } });
  });
  return { eventSlug: EVENT, fights, data };
}

describe("card bout order", () => {
  it("lists Allen vs Duncan from the prelims opener to the main event", () => {
    const rows = parseBreakdownBody(allenSite());
    assert.equal(rows.length, 12);
    assert.equal(rows.find((row) => row.fightSlug === SLUG)?.boutOrder, null);
    assert.equal(rows.find((row) => row.fightSlug === SLUG)?.fightN, 1);
    const fights = fightsFromBreakdowns(EVENT, rows);
    assert.deepEqual(
      fights.map((fight) => fight.slug),
      [...ALLEN_FIRST_TO_LAST],
    );
    assert.equal(fights[0]?.boutOrder, 1);
    assert.equal(fights.at(-1)?.boutOrder, 12);
    const layout = eventBoutSections(fights);
    assert.equal(layout.kind, "sections");
    if (layout.kind !== "sections") return;
    assert.deepEqual(
      layout.sections.map((section) => section.id),
      ["prelims", "main-card"],
    );
    assert.equal(layout.sections[0]?.fights[0]?.slug, "ernesta-kareckaite-vs-melissa-gatto");
    assert.equal(layout.sections[1]?.fights.at(-1)?.slug, SLUG);
  });

  it("derives boutOrder from n when the post omits it", () => {
    const rows = parseBreakdownBody(allenSite());
    const main = rows.find((row) => row.fightN === 1);
    const opener = rows.find((row) => row.fightN === 12);
    assert.ok(main && opener);
    assert.equal(derivedBoutOrder(main, rows), 12);
    assert.equal(derivedBoutOrder(opener, rows), 1);
    const explicit = parseBreakdownBody([
      camel({ fightSlug: "late-vs-late", fightN: 1, boutOrder: 5, card: "Main card" }),
      camel({
        fightSlug: "early-vs-early",
        fightN: 2,
        card: "Prelims",
      }),
    ]);
    assert.equal(explicit[0]?.boutOrder, 5);
    assert.equal(explicit[1]?.boutOrder, null);
    assert.equal(derivedBoutOrder(explicit[1]!, explicit), 1);
    assert.deepEqual(
      fightsFromBreakdowns(EVENT, explicit).map((fight) => fight.slug),
      ["early-vs-early", "late-vs-late"],
    );
  });

  it("orders early prelims, then prelims, then the main card, and leaves unknown order last", () => {
    const rows = parseBreakdownBody([
      camel({ fightSlug: "main-late", card: "Main card", boutOrder: 2, fightN: null }),
      camel({ fightSlug: "prelim-first", card: "Prelims", boutOrder: 1, fightN: null }),
      camel({ fightSlug: "early-late", card: "Early prelims", boutOrder: 3, fightN: null }),
      camel({ fightSlug: "early-first", card: "Early prelims", boutOrder: 1, fightN: null }),
      camel({ fightSlug: "main-first", card: "Main card", boutOrder: 1, fightN: null }),
      camel({ fightSlug: "prelim-unknown", card: "Prelims", fightN: null }),
      camel({ fightSlug: "prelim-unknown-2", card: "Prelims", fightN: null }),
    ]);
    assert.deepEqual(
      fightsFromBreakdowns(EVENT, rows).map((fight) => fight.slug),
      [
        "early-first",
        "early-late",
        "prelim-first",
        "prelim-unknown",
        "prelim-unknown-2",
        "main-first",
        "main-late",
      ],
    );
    const layout = eventBoutSections(fightsFromBreakdowns(EVENT, rows));
    assert.equal(layout.kind, "sections");
    if (layout.kind !== "sections") return;
    assert.deepEqual(
      layout.sections.map((section) => section.id),
      ["early-prelims", "prelims", "main-card"],
    );
  });

  it("joins a bet list to breakdown bout order and keeps an unordered bet last", () => {
    const rows = parseBreakdownBody(allenSite());
    const fights = annotateDeskFights(
      [
        {
          slug: SLUG,
          title: "Brendan Allen vs Christian Leroy Duncan",
          kicker: "",
          detail: "",
          segment: "main-card",
          bets: [bet()],
        },
        {
          slug: "ernesta-kareckaite-vs-melissa-gatto",
          title: "Ernesta Kareckaite vs Melissa Gatto",
          kicker: "",
          detail: "",
          segment: null,
          bets: [bet({ id: "opener", fightSlug: "ernesta-kareckaite-vs-melissa-gatto" })],
        },
        {
          slug: "nobody-vs-nobody",
          title: "Nobody vs Nobody",
          kicker: "",
          detail: "",
          segment: "prelims",
          bets: [bet({ id: "extra", fightSlug: "nobody-vs-nobody", fight: "Nobody vs Nobody" })],
        },
      ],
      EVENT,
      rows,
    );
    assert.deepEqual(
      fights.map((fight) => fight.slug),
      ["ernesta-kareckaite-vs-melissa-gatto", "nobody-vs-nobody", SLUG],
    );
    const card = deskFightsForEvent(
      EVENT,
      fights.filter((fight) => fight.slug === SLUG || fight.slug === "nobody-vs-nobody"),
      rows,
    );
    assert.equal(card[0]?.slug, "ernesta-kareckaite-vs-melissa-gatto");
    assert.equal(card.at(-1)?.slug, SLUG);
    assert.equal(card.find((fight) => fight.slug === SLUG)?.bets.length, 1);
    assert.equal(card.length, 13);
  });

  it("uses the DWCS week 9 card order and leaves an unlisted bet last", () => {
    const ordered = applyStaticCard("dwcs-s10-week-9", [
      {
        slug: "summer-onley-vs-alivia-bierley",
        title: "Summer Onley vs Alivia Bierley",
        kicker: "",
        detail: "",
        segment: null,
        bets: [],
      },
      {
        slug: "unlisted-vs-unlisted",
        title: "Unlisted vs Unlisted",
        kicker: "",
        detail: "",
        segment: null,
        bets: [],
      },
    ]);
    assert.deepEqual(
      ordered.map((fight) => fight.slug),
      [...DWCS_S10_WEEK_9.fights.map((fight) => fight.slug), "unlisted-vs-unlisted"],
    );
    assert.equal(ordered[0]?.title, "Preston LaGrange vs Nell Ariano");
    assert.equal(ordered[4]?.title, "Summer Onley vs Alivia Bierley");
  });

  it("rejects a non-positive boutOrder", () => {
    assert.throws(() => parseBreakdownBody([camel({ boutOrder: 0 })]), /boutOrder must be a positive integer/);
    assert.throws(() => parseBreakdownBody([camel({ boutOrder: 1.5 })]), /boutOrder must be an integer/);
  });
});

function createMemorySql(): SqlClient {
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

function request(method: "GET" | "POST", body?: unknown, token = "test-token"): Request {
  const url = method === "GET"
    ? `https://resonance3.vercel.app/api/fights/breakdown?event=${EVENT}`
    : "https://resonance3.vercel.app/api/fights/breakdown";
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("breakdown route", { concurrency: false }, () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    blob: process.env.BLOB_READ_WRITE_TOKEN,
    vercel: process.env.VERCEL,
    secret: process.env.RESONANCE_SYNC_SECRET,
    file: process.env.RESONANCE_FIGHT_BREAKDOWNS_FILE,
  };
  let directory = "";

  after(async () => {
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.blob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous.blob;
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    if (previous.secret === undefined) delete process.env.RESONANCE_SYNC_SECRET;
    else process.env.RESONANCE_SYNC_SECRET = previous.secret;
    if (previous.file === undefined) delete process.env.RESONANCE_FIGHT_BREAKDOWNS_FILE;
    else process.env.RESONANCE_FIGHT_BREAKDOWNS_FILE = previous.file;
    setSqlClientForTests(null);
    setBlobSdkForTests(null);
    resetBlobReadCacheForTests();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "breakdowns-"));
    delete process.env.DATABASE_URL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    process.env.RESONANCE_SYNC_SECRET = "test-token";
    process.env.RESONANCE_FIGHT_BREAKDOWNS_FILE = path.join(directory, "fight-breakdowns.json");
    setSqlClientForTests(null);
    setBlobSdkForTests(null);
    resetBlobReadCacheForTests();
  });

  it("rejects a missing bearer and an unknown tier", async () => {
    const denied = await POST(request("POST", [camel()], ""));
    assert.equal(denied.status, 401);
    const bad = await POST(request("POST", [camel({ tier: "LOCK" })]));
    assert.equal(bad.status, 400);
    const payload = (await bad.json()) as { error?: string };
    assert.match(payload.error ?? "", /tier must be STRONG, LEAN, or null/);
  });

  it("upserts on the file store and dedupes the same body", async () => {
    const created = await POST(request("POST", siteFight()));
    assert.equal(created.status, 200);
    const first = (await created.json()) as {
      ok: boolean;
      backend: string;
      deduped: boolean;
      results: { deduped: boolean }[];
      updatedAt: string;
    };
    assert.equal(first.ok, true);
    assert.equal(first.backend, "file");
    assert.equal(first.deduped, false);
    assert.equal(first.results.length, 2);
    const again = await POST(request("POST", siteFight()));
    const second = (await again.json()) as { deduped: boolean; updatedAt: string };
    assert.equal(second.deduped, true);
    assert.equal(second.updatedAt, first.updatedAt);
    const read = await GET(request("GET"));
    const listed = (await read.json()) as { ok: boolean; breakdowns: FightBreakdown[] };
    assert.equal(listed.ok, true);
    assert.equal(listed.breakdowns.length, 2);
    assert.equal(listed.breakdowns[0]?.fightSlug, "andre-fili-vs-kai-kamaka-iii");
    assert.equal(listed.breakdowns[1]?.fightSlug, SLUG);
    assert.equal(listed.breakdowns[1]?.why, "Allen is the better grappler.");
  });

  it("returns 503 when the store is not configured", async () => {
    process.env.VERCEL = "1";
    delete process.env.RESONANCE_FIGHT_BREAKDOWNS_FILE;
    const response = await POST(request("POST", [camel()]));
    assert.equal(response.status, 503);
  });

  it("upserts through postgres and dedupes after a reload", async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    setSqlClientForTests(createMemorySql());
    const migrated = await migrate();
    assert.ok(migrated.applied.includes("004_fight_breakdowns"));
    const written = await postFightBreakdowns(parseBreakdownBody([camel()]));
    assert.equal(written.backend, "postgres");
    assert.equal(written.results[0]?.deduped, false);
    const again = await postFightBreakdowns(parseBreakdownBody([camel()]));
    assert.equal(again.results[0]?.deduped, true);
    const changed = await postFightBreakdowns(parseBreakdownBody([camel({ conf: "Strong", tier: "STRONG" })]));
    assert.equal(changed.results[0]?.deduped, false);
    assert.equal(changed.results[0]?.breakdown.tier, "STRONG");
    const ordered = await postFightBreakdowns(parseBreakdownBody([camel({ boutOrder: 7, fightN: 1 })]));
    assert.equal(ordered.results[0]?.deduped, false);
    assert.equal(ordered.results[0]?.breakdown.boutOrder, 7);
    const orderedAgain = await postFightBreakdowns(parseBreakdownBody([camel({ boutOrder: 7, fightN: 1 })]));
    assert.equal(orderedAgain.results[0]?.deduped, true);
    assert.equal(orderedAgain.results[0]?.breakdown.boutOrder, 7);
    const stored = linksColumn(orderedAgain.results[0]!.breakdown);
    assert.equal(isRecord(stored) ? stored.boutOrder : null, 7);
  });

  it("writes and dedupes on the blob fallback", async () => {
    delete process.env.RESONANCE_FIGHT_BREAKDOWNS_FILE;
    process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
    const objects = new Map<string, string>();
    setBlobSdkForTests({
      async get(pathname) {
        const text = objects.get(pathname);
        if (text == null) return { statusCode: 404, stream: null };
        return { statusCode: 200, stream: new Response(text).body };
      },
      async put(pathname, body) {
        objects.set(pathname, body);
      },
    });
    const written = await postFightBreakdowns(parseBreakdownBody([camel()]));
    assert.equal(written.backend, "blob");
    assert.equal(written.results[0]?.deduped, false);
    const again = await postFightBreakdowns(parseBreakdownBody([camel()]));
    assert.equal(again.results[0]?.deduped, true);
    assert.equal(objects.size, 1);
  });
});
