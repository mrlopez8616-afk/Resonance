import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { newDb } from "pg-mem";
import { NextRequest } from "next/server";
import type { CalendarEvent } from "@/data/calendar";
import { GET } from "@/app/api/fights/fighters/[slug]/route";
import { POST } from "@/app/api/fights/fighters/route";
import {
  appendSettledResults,
  careerRecord,
  careerTrends,
  NOT_RECORDED,
  parseFighterCareer,
  type CareerFight,
} from "@/lib/fighter-careers";
import type { FightResult } from "@/lib/fight-results";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";
import { resetBlobReadCacheForTests } from "@/lib/blob-read";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "fighter-career-sync-secret";

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
  const props = node.props as { children?: ReactNode; className?: string; href?: string };
  const type = node.type;
  const body = typeof type === "function" ? render((type as (props: unknown) => ReactNode)(node.props)) : render(props.children);
  return `${props.className ?? ""} ${props.href ?? ""} ${body}`;
}

function memorySql(): SqlClient {
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

function blankFight(patch: Partial<CareerFight> & Pick<CareerFight, "date" | "opponent">): CareerFight {
  return {
    event: null,
    result: null,
    method: null,
    round: null,
    time: null,
    sigStrikesLanded: null,
    sigStrikesAttempted: null,
    totalStrikesLanded: null,
    totalStrikesAttempted: null,
    takedownsLanded: null,
    takedownsAttempted: null,
    subAttempts: null,
    controlTimeSeconds: null,
    knockdowns: null,
    ...patch,
  };
}

const CAREER: CareerFight[] = [
  blankFight({
    date: "2026-10-24",
    event: "UFC 333",
    opponent: "Alpha",
    result: "win",
    method: "KO/TKO (Punch)",
    round: 1,
    time: "1:00",
    sigStrikesLanded: 10,
    sigStrikesAttempted: 20,
    totalStrikesLanded: 12,
    totalStrikesAttempted: 22,
    takedownsLanded: 1,
    takedownsAttempted: 2,
    subAttempts: 0,
    controlTimeSeconds: 60,
    knockdowns: 1,
  }),
  blankFight({
    date: "2026-08-01",
    event: "UFC 330",
    opponent: "Casey",
    result: "win",
    method: "Decision - Unanimous",
    round: 3,
    time: "5:00",
    sigStrikesLanded: 30,
    sigStrikesAttempted: 60,
    takedownsLanded: 0,
    takedownsAttempted: 1,
    subAttempts: 1,
    controlTimeSeconds: 180,
    knockdowns: 0,
  }),
  blankFight({
    date: "2026-06-01",
    event: "UFC 320",
    opponent: "Drew",
    result: "loss",
    method: "Submission (Rear-Naked Choke)",
    round: 2,
    time: "2:00",
    sigStrikesLanded: 5,
    sigStrikesAttempted: 10,
    totalStrikesLanded: 8,
    subAttempts: 0,
  }),
  blankFight({
    date: "2026-01-01",
    event: "UFC 310",
    opponent: "Eden",
    result: "win",
    method: "Submission",
    round: 1,
    time: "3:00",
    sigStrikesLanded: 12,
    takedownsLanded: 2,
    takedownsAttempted: 3,
    subAttempts: 2,
    controlTimeSeconds: 90,
    knockdowns: 0,
  }),
  blankFight({
    date: "2025-10-01",
    opponent: "Fran",
    result: "win",
    method: "Decision - Split",
    round: 3,
    time: "5:00",
  }),
];

function trend(id: string) {
  const row = careerTrends(CAREER).find((item) => item.id === id);
  assert.ok(row, id);
  return row;
}

const POSTED = {
  name: "Bravo",
  metadata: { division: "Lightweight" },
  fights: [
    {
      date: "2026-10-24",
      event: "UFC 333",
      opponent: "Alpha",
      result: "win",
      method: "KO/TKO (Punch)",
      round: 1,
      time: "1:00",
      sigStrikesLanded: 10,
      sigStrikesAttempted: 20,
      takedownsLanded: 1,
      takedownsAttempted: 2,
      control: "1:00",
      knockdowns: 0,
    },
    {
      date: "2026-08-01",
      event: "UFC 330",
      opponent: "Casey",
      result: "loss",
      method: "Decision - Unanimous",
      round: 3,
      time: "5:00",
      sigStrikesLanded: 4,
    },
  ],
};

describe("fighter career trends", () => {
  it("compares the last 3 fights with the career and leaves gaps unrecorded", () => {
    const file = readFileSync(path.join(root, "db/migrations/033_fighter_careers.sql"), "utf8");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "033_fighter_careers");
    assert.equal(embedded?.sql, file);
    assert.equal(file.includes("INSERT"), false);
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "040_market_quotes");

    const parsed = parseFighterCareer({
      name: "Bravo",
      fights: [{ date: "2026-10-24", opponent: "Alpha", control: "2:11", knockdowns: 0, sigStrikesLanded: null }],
    });
    assert.equal(parsed.slug, "bravo");
    assert.equal(parsed.fights[0]?.controlTimeSeconds, 131);
    assert.equal(parsed.fights[0]?.knockdowns, 0);
    assert.equal(parsed.fights[0]?.sigStrikesLanded, null);
    assert.equal(parsed.metadataProvided, false);
    assert.throws(() => parseFighterCareer({ name: "Bravo", fights: [{ date: "2026-10-24", opponent: "Alpha", knockdowns: -1 }] }), /whole number/);
    assert.throws(() => parseFighterCareer({ name: "Bravo", fights: [{ date: "10/24/2026", opponent: "Alpha" }] }), /YYYY-MM-DD/);
    assert.throws(
      () =>
        parseFighterCareer({
          name: "Bravo",
          fights: [
            { date: "2026-10-24", opponent: "Alpha" },
            { date: "2026-10-24", opponent: "Alpha" },
          ],
        }),
      /date and opponent/,
    );

    assert.equal(careerRecord(CAREER), "4-1");
    const finish = trend("finish-rate");
    assert.equal(finish.headline, "33.3%");
    assert.equal(finish.direction, "worse");
    assert.equal(finish.lastN, 3);
    assert.equal(finish.careerN, 5);
    assert.match(finish.status, /↓ career 40\.0% · n=3\/5/);

    const finished = trend("times-finished");
    assert.equal(finished.headline, "1 of 3");
    assert.equal(finished.direction, "worse");
    assert.match(finished.status, /career 1 of 5 · n=3\/5/);

    const td = trend("td-per-15");
    assert.equal(td.headline, "0.9");
    assert.equal(td.direction, "worse");
    assert.match(td.status, /career 2\.4 · n=2\/3/);

    const strikes = trend("sig-strikes");
    assert.equal(strikes.label, "Sig strikes/15");
    assert.equal(strikes.headline, "29.3");
    assert.equal(strikes.direction, "worse");
    assert.match(strikes.status, /career 32\.9 · n=3\/4/);

    const control = trend("control-time");
    assert.equal(control.headline, "2:00");
    assert.equal(control.direction, "better");
    assert.match(control.status, /↑ career 1:50 · n=2\/3/);

    const empty = careerTrends([]);
    assert.equal(empty.every((row) => row.headline === NOT_RECORDED), true);
    assert.equal(empty.every((row) => row.direction === null), true);
    assert.equal(empty.some((row) => row.headline.includes("0")), false);
    assert.equal(empty.some((row) => row.status.includes("%")), false);

    const perFight = careerTrends([
      blankFight({ date: "2026-03-01", opponent: "A", sigStrikesLanded: 10 }),
      blankFight({ date: "2026-02-01", opponent: "B", sigStrikesLanded: 20 }),
      blankFight({ date: "2026-01-01", opponent: "C", sigStrikesLanded: 30 }),
    ]);
    const sig = perFight.find((row) => row.id === "sig-strikes");
    assert.equal(sig?.label, "Sig strikes/fight");
    assert.equal(sig?.headline, "20.0");
    assert.equal(sig?.direction, "same");
    assert.equal(perFight.find((row) => row.id === "td-per-15")?.headline, NOT_RECORDED);
  });

  it("adds a settled result only when the date is already known", () => {
    const result: FightResult = {
      event: "ufc-333",
      fightSlug: "alpha-vs-bravo",
      winner: "Bravo",
      opponent: "Alpha",
      method: "KO/TKO (Punch)",
      round: 1,
      time: "1:00",
      status: "final",
    };
    const event = {
      id: "ufc-333-night",
      start: "2026-10-24T23:00:00-05:00",
      title: "UFC 333",
      status: "confirmed",
      writer: "agent",
      kind: "fight",
      eventSlug: "ufc-333",
    } as CalendarEvent;
    const added = appendSettledResults([], { slug: "bravo", results: [result], events: [event] });
    assert.equal(added.length, 1);
    assert.equal(added[0]?.date, "2026-10-24");
    assert.equal(added[0]?.opponent, "Alpha");
    assert.equal(added[0]?.result, "win");
    assert.equal(added[0]?.fromResult, true);
    assert.equal(added[0]?.sigStrikesLanded, null);
    assert.equal(added[0]?.takedownsLanded, null);
    assert.equal(added[0]?.controlTimeSeconds, null);

    assert.equal(appendSettledResults([], { slug: "bravo", results: [result] }).length, 0);
    const ambiguous = appendSettledResults([], {
      slug: "bravo",
      results: [result],
      events: [event, { ...event, id: "other", start: "2026-10-25T23:00:00-05:00" }],
    });
    assert.equal(ambiguous.length, 0);

    const fromSlot = appendSettledResults([], {
      slug: "bravo",
      results: [result],
      boutDates: [{ event: "ufc-333", fightSlug: "alpha-vs-bravo", date: "2026-10-24" }],
    });
    assert.equal(fromSlot[0]?.event, "ufc-333");
    assert.equal(fromSlot[0]?.sigStrikesLanded, null);

    const kept = appendSettledResults(
      [blankFight({ date: "2026-10-24", opponent: "Alpha", method: "Decision - Unanimous", result: "win" })],
      { slug: "bravo", results: [result], events: [event] },
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.method, "Decision - Unanimous");
    assert.equal(kept[0]?.fromResult, undefined);

    const filled = appendSettledResults([blankFight({ date: "2026-10-24", opponent: "Alpha" })], {
      slug: "bravo",
      results: [result],
      events: [event],
    });
    assert.equal(filled.length, 1);
    assert.equal(filled[0]?.method, "KO/TKO (Punch)");
    assert.equal(filled[0]?.result, "win");
    assert.equal(filled[0]?.sigStrikesLanded, null);
  });
});

describe("fighter career route", { concurrency: false }, () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  };

  before(async () => {
    process.env.DATABASE_URL = "postgres://resonance@127.0.0.1:5432/resonance";
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    setSqlClientForTests(memorySql());
    resetBlobReadCacheForTests();
    await migrate();
  });

  beforeEach(async () => {
    await sqlQuery(`DELETE FROM fighter_fights`);
    await sqlQuery(`DELETE FROM fighters`);
  });

  after(() => {
    setSqlClientForTests(null);
    resetBlobReadCacheForTests();
    if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.DATABASE_URL;
    if (previous.RESONANCE_SYNC_SECRET === undefined) delete process.env.RESONANCE_SYNC_SECRET;
    else process.env.RESONANCE_SYNC_SECRET = previous.RESONANCE_SYNC_SECRET;
    if (previous.BLOB_READ_WRITE_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous.BLOB_READ_WRITE_TOKEN;
  });

  it("upserts a fighter and does not add a second row for the same date and opponent", async () => {
    const denied = await POST(
      new NextRequest("https://resonance3.vercel.app/api/fights/fighters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(POSTED),
      }),
    );
    assert.equal(denied.status, 401);

    const first = await POST(
      new NextRequest("https://resonance3.vercel.app/api/fights/fighters", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify(POSTED),
      }),
    );
    assert.equal(first.status, 200);
    const created = (await first.json()) as {
      deduped: boolean;
      fighter: { slug: string; metadata: { division: string } };
      fights: CareerFight[];
    };
    assert.equal(created.deduped, false);
    assert.equal(created.fighter.slug, "bravo");
    assert.equal(created.fighter.metadata.division, "Lightweight");
    assert.equal(created.fights.length, 2);
    assert.equal(created.fights.find((fight) => fight.opponent === "Casey")?.takedownsLanded, null);
    assert.equal(created.fights.find((fight) => fight.opponent === "Alpha")?.knockdowns, 0);
    assert.equal(created.fights.find((fight) => fight.opponent === "Alpha")?.controlTimeSeconds, 60);

    const again = await POST(
      new NextRequest("https://resonance3.vercel.app/api/fights/fighters", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify(POSTED),
      }),
    );
    const repeat = (await again.json()) as { deduped: boolean };
    assert.equal(repeat.deduped, true);
    const counts = await sqlQuery<{ count: string | number }>(
      `SELECT count(*)::text AS count FROM fighter_fights WHERE fighter_slug = 'bravo'`,
    );
    assert.equal(String(counts[0]?.count), "2");

    const updated = await POST(
      new NextRequest("https://resonance3.vercel.app/api/fights/fighters", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({
          ...POSTED,
          fights: POSTED.fights.map((fight) =>
            fight.opponent === "Alpha" ? { ...fight, sigStrikesLanded: 18 } : fight,
          ),
        }),
      }),
    );
    const changed = (await updated.json()) as { deduped: boolean; fights: CareerFight[] };
    assert.equal(changed.deduped, false);
    assert.equal(changed.fights.find((fight) => fight.opponent === "Alpha")?.sigStrikesLanded, 18);
    const after = await sqlQuery<{ count: string | number }>(
      `SELECT count(*)::text AS count FROM fighter_fights WHERE fighter_slug = 'bravo'`,
    );
    assert.equal(String(after[0]?.count), "2");

    const unnamed = await POST(
      new NextRequest("https://resonance3.vercel.app/api/fights/fighters", {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "Bravo", fights: [] }),
      }),
    );
    const kept = (await unnamed.json()) as { fighter: { metadata: { division: string } | null } };
    assert.equal(kept.fighter.metadata?.division, "Lightweight");

    const read = await GET(new NextRequest("https://resonance3.vercel.app/api/fights/fighters/bravo", { headers: { authorization: `Bearer ${SECRET}` } }), {
      params: Promise.resolve({ slug: "bravo" }),
    });
    assert.equal(read.status, 200);
    const body = (await read.json()) as {
      fights: CareerFight[];
      trends: { id: string; headline: string; lastN: number }[];
      record: string;
    };
    assert.equal(body.record, "1-1");
    assert.equal(body.fights.find((fight) => fight.opponent === "Casey")?.takedownsLanded, null);
    assert.equal(body.fights.find((fight) => fight.opponent === "Alpha")?.knockdowns, 0);
    const td = body.trends.find((row) => row.id === "td-per-15");
    assert.equal(td?.headline, "15.0");
    assert.equal(td?.lastN, 1);
    assert.equal(JSON.stringify(body).includes("$"), false);

    const { FighterCareerView } = await import("@/components/fighter-career");
    const html = render(createElement(FighterCareerView, { name: "Bravo", fights: CAREER }));
    assert.match(html, /node-face/);
    assert.match(html, /Finish rate/);
    assert.match(html, /33\.3%/);
    assert.match(html, /not recorded/);
    assert.match(html, /↑/);
    assert.match(html, /\/fights\/fighters\/alpha/);
    assert.equal(html.includes("$"), false);
  });
});
