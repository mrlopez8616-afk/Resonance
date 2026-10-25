import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { PATCH, POST } from "@/app/api/bets/stake/route";
import { parseBetsEnvelope } from "@/lib/bets-store-core";
import { settleStoredBets } from "@/lib/bets-store";
import { resetBlobReadCacheForTests, setBlobSdkForTests } from "@/lib/blob-read";
import {
  betSeed,
  parseStakeBody,
  reviseBetStake,
  settleBet,
  type Bet,
} from "@/lib/bets";

const SECRET = "stake-edit-sync-secret";
const NOW = "2026-10-20T18:00:00.000Z";
const LATER = "2026-10-21T18:00:00.000Z";

function nolan(): Bet {
  const bet = betSeed().find((row) => row.id === "ufc-332-nolan");
  assert.ok(bet);
  return bet;
}

function stakeRequest(body: unknown, method: "POST" | "PATCH" = "POST", authorization = `Bearer ${SECRET}`) {
  return new NextRequest("https://resonance3.vercel.app/api/bets/stake", {
    method,
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("stake edit", () => {
  it("accepts a positive finite stake and rejects zero, negatives, and non-numbers", () => {
    assert.equal(parseStakeBody({ id: "ufc-332-nolan", stake: "2.5" }).stake, "2.50");
    assert.equal(parseStakeBody({ id: "UFC-332-Nolan", stake: 2.5 }).stake, "2.50");
    assert.equal(parseStakeBody({ id: "ufc-332-nolan", stake: 1 }).stake, "1.00");
    for (const stake of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "0", "0.00", "0.001", "-1.00", "", "1.239", null]) {
      assert.throws(() => parseStakeBody({ id: "ufc-332-nolan", stake }), /positive finite number/);
    }
    assert.throws(() => parseStakeBody({ stake: "1.00" }), /lowercase slug/);
    assert.throws(() => parseStakeBody({ id: "ufc-332-nolan" }), /positive finite number/);
  });

  it("changes only the stake, keeps every previous stake, and recomputes settled P&L", () => {
    const open = nolan();
    assert.equal(open.status, "open");
    const edited = reviseBetStake(open, "3.50", NOW);
    assert.equal(edited.deduped, false);
    assert.equal(edited.bet.stake, "3.50");
    assert.equal(edited.bet.realizedPnl, undefined);
    assert.equal(edited.bet.payout, open.payout);
    assert.equal(edited.bet.oddsPct, open.oddsPct);
    assert.equal(edited.bet.pick, open.pick);
    assert.deepEqual(edited.bet.stakeRevisions?.map((row) => row.stake), [open.stake]);
    const same = reviseBetStake(edited.bet, "3.50", LATER);
    assert.equal(same.deduped, true);
    assert.equal(same.bet, edited.bet);

    const won = settleBet(edited.bet, { id: open.id, status: "won" }, NOW).bet;
    const resized = reviseBetStake(won, "2.00", LATER);
    assert.equal(resized.bet.status, "won");
    assert.equal(resized.bet.payout, won.payout);
    assert.equal(resized.bet.settledPayout, won.settledPayout);
    assert.equal(resized.bet.oddsPct, won.oddsPct);
    assert.equal(resized.bet.settledAt, won.settledAt);
    assert.equal(resized.bet.realizedPnl, "5.12");
    assert.deepEqual(resized.bet.stakeRevisions?.map((row) => row.stake), [open.stake, "3.50"]);

    const lost = settleBet(open, { id: open.id, status: "lost" }, NOW).bet;
    assert.equal(reviseBetStake(lost, "2.00", LATER).bet.realizedPnl, "-2.00");
    const voided = settleBet(open, { id: open.id, status: "void" }, NOW).bet;
    assert.equal(reviseBetStake(voided, "8.00", LATER).bet.realizedPnl, "0.00");
    const sold = settleBet(open, { id: open.id, status: "sold", payout: "6.00" }, NOW).bet;
    assert.equal(reviseBetStake(sold, "2.00", LATER).bet.realizedPnl, "4.00");
    assert.equal(reviseBetStake(sold, "2.00", LATER).bet.payout, "6.00");
    const drawn = settleBet(open, { id: open.id, status: "draw", payout: "0.92" }, NOW).bet;
    assert.equal(reviseBetStake(drawn, "1.00", LATER).bet.realizedPnl, "-0.08");
    assert.equal(reviseBetStake(drawn, "1.00", LATER).bet.settledPayout, "0.92");

    const parsed = parseBetsEnvelope(JSON.parse(JSON.stringify({ bets: [resized.bet] })));
    assert.equal(parsed?.bets[0]?.stake, "2.00");
    assert.deepEqual(parsed?.bets[0]?.stakeRevisions?.map((row) => row.stake), [open.stake, "3.50"]);
    assert.equal(parsed?.bets[0]?.realizedPnl, "5.12");
  });
});

describe("stake route", { concurrency: false }, () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
    RESONANCE_BETS_FILE: process.env.RESONANCE_BETS_FILE,
    VERCEL: process.env.VERCEL,
  };
  let directory = "";

  before(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "resonance-bets-"));
    delete process.env.DATABASE_URL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    process.env.RESONANCE_BETS_FILE = path.join(directory, "bets.json");
    resetBlobReadCacheForTests();
  });

  beforeEach(() => {
    resetBlobReadCacheForTests();
  });

  after(async () => {
    if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.DATABASE_URL;
    if (previous.BLOB_READ_WRITE_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous.BLOB_READ_WRITE_TOKEN;
    if (previous.RESONANCE_SYNC_SECRET === undefined) delete process.env.RESONANCE_SYNC_SECRET;
    else process.env.RESONANCE_SYNC_SECRET = previous.RESONANCE_SYNC_SECRET;
    if (previous.RESONANCE_BETS_FILE === undefined) delete process.env.RESONANCE_BETS_FILE;
    else process.env.RESONANCE_BETS_FILE = previous.RESONANCE_BETS_FILE;
    if (previous.VERCEL === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.VERCEL;
    resetBlobReadCacheForTests();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("updates one open stake, then a settled stake, and keeps both old stakes", async () => {
    const denied = await POST(stakeRequest({ id: "ufc-332-nolan", stake: "3.50" }, "POST", ""));
    assert.equal(denied.status, 401);

    const missing = await POST(stakeRequest({ id: "missing-bet", stake: "3.50" }));
    assert.equal(missing.status, 404);
    const zero = await POST(stakeRequest({ id: "ufc-332-nolan", stake: 0 }));
    assert.equal(zero.status, 400);

    const first = await POST(stakeRequest({ id: "ufc-332-nolan", stake: "3.50" }));
    assert.equal(first.status, 200);
    const opened = (await first.json()) as {
      deduped: boolean;
      previousStake: string;
      backend: string;
      bet: Bet;
    };
    assert.equal(opened.backend, "file");
    assert.equal(opened.deduped, false);
    assert.equal(opened.previousStake, "4.84");
    assert.equal(opened.bet.stake, "3.50");
    assert.equal(opened.bet.status, "open");
    assert.equal(opened.bet.realizedPnl, undefined);
    assert.equal(opened.bet.payout, "7.12");
    assert.equal(opened.bet.oddsPct, 68);
    assert.deepEqual(opened.bet.stakeRevisions?.map((row) => row.stake), ["4.84"]);

    const repeat = await PATCH(stakeRequest({ id: "ufc-332-nolan", stake: 3.5 }, "PATCH"));
    assert.equal(repeat.status, 200);
    const same = (await repeat.json()) as { deduped: boolean; bet: Bet };
    assert.equal(same.deduped, true);
    assert.equal(same.bet.stakeRevisions?.length, 1);

    const settled = await settleStoredBets([{ id: "ufc-332-nolan", status: "lost" }]);
    assert.equal(settled.results[0]?.bet.realizedPnl, "-3.50");
    assert.equal(settled.results[0]?.bet.stake, "3.50");

    const second = await POST(stakeRequest({ id: "ufc-332-nolan", stake: "2.00" }));
    assert.equal(second.status, 200);
    const lost = (await second.json()) as { deduped: boolean; previousStake: string; bet: Bet };
    assert.equal(lost.deduped, false);
    assert.equal(lost.previousStake, "3.50");
    assert.equal(lost.bet.stake, "2.00");
    assert.equal(lost.bet.status, "lost");
    assert.equal(lost.bet.realizedPnl, "-2.00");
    assert.equal(lost.bet.payout, "7.12");
    assert.equal(lost.bet.oddsPct, 68);
    assert.deepEqual(lost.bet.stakeRevisions?.map((row) => row.stake), ["4.84", "3.50"]);

    const stored = JSON.parse(await readFile(process.env.RESONANCE_BETS_FILE ?? "", "utf8")) as {
      bets: Bet[];
    };
    const row = stored.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.equal(row?.stake, "2.00");
    assert.deepEqual(row?.stakeRevisions?.map((item) => item.stake), ["4.84", "3.50"]);
    assert.equal(stored.bets.length, betSeed().length);
    assert.equal(stored.bets.find((bet) => bet.id === "ufc-332-soldic")?.stake, "4.84");
  });
});

describe("stake route on blob", { concurrency: false }, () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
    RESONANCE_BETS_FILE: process.env.RESONANCE_BETS_FILE,
  };
  let body: string | null = null;
  let puts = 0;

  before(() => {
    previous.DATABASE_URL = process.env.DATABASE_URL;
    previous.BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
    previous.RESONANCE_SYNC_SECRET = process.env.RESONANCE_SYNC_SECRET;
    previous.RESONANCE_BETS_FILE = process.env.RESONANCE_BETS_FILE;
    delete process.env.DATABASE_URL;
    delete process.env.RESONANCE_BETS_FILE;
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test";
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    setBlobSdkForTests({
      async get() {
        if (body === null) return null;
        const stream = new Response(body).body;
        if (!stream) throw new Error("Response body missing");
        return { statusCode: 200, stream };
      },
      async put(_pathname, text) {
        puts += 1;
        body = text;
      },
    });
    resetBlobReadCacheForTests();
  });

  after(() => {
    if (previous.DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.DATABASE_URL;
    if (previous.BLOB_READ_WRITE_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previous.BLOB_READ_WRITE_TOKEN;
    if (previous.RESONANCE_SYNC_SECRET === undefined) delete process.env.RESONANCE_SYNC_SECRET;
    else process.env.RESONANCE_SYNC_SECRET = previous.RESONANCE_SYNC_SECRET;
    if (previous.RESONANCE_BETS_FILE === undefined) delete process.env.RESONANCE_BETS_FILE;
    else process.env.RESONANCE_BETS_FILE = previous.RESONANCE_BETS_FILE;
    setBlobSdkForTests(null);
    resetBlobReadCacheForTests();
  });

  it("writes the revised stake through the blob book", async () => {
    const response = await POST(stakeRequest({ id: "ufc-332-nolan", stake: "1.25" }));
    assert.equal(response.status, 200);
    const written = (await response.json()) as { backend: string; bet: Bet };
    assert.equal(written.backend, "blob");
    assert.equal(written.bet.stake, "1.25");
    assert.ok(puts >= 1);
    const stored = JSON.parse(body ?? "{}") as { bets: Bet[] };
    const row = stored.bets.find((bet) => bet.id === "ufc-332-nolan");
    assert.equal(row?.stake, "1.25");
    assert.deepEqual(row?.stakeRevisions?.map((item) => item.stake), ["4.84"]);
  });
});
