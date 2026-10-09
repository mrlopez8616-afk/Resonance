import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { newDb } from "pg-mem";
import { POST } from "@/app/api/fills/route";
import { cbAgenticLotLines } from "@/lib/position-lots";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";
import { loadFillsStoreFresh } from "@/lib/fills-store";

const SECRET = "hub-secret";
const XRP_ORDER = "7ebf6708-5ed7-48fc-baa3-14f1eed95f11";
const SUI_ORDER = "4f8720ee-fd80-4a8e-b7f2-ec4c9f8c1f79";

export const CB_AGENTIC_XRP_SELL = {
  venue: "coinbase",
  orderId: XRP_ORDER,
  ticker: "XRP",
  side: "sell",
  qty: "1",
  price: "1.3896",
  sleeve: "cb-agentic",
  filledAt: "2026-10-09T15:21:28-05:00",
  fee: "0.0125",
  result: "filled",
};

export const CB_AGENTIC_SUI_BUY = {
  venue: "coinbase",
  orderId: SUI_ORDER,
  ticker: "SUI",
  side: "buy",
  qty: "1.2",
  price: "1.0601340274",
  sleeve: "cb-agentic",
  filledAt: "2026-10-09T15:21:33-05:00",
  fee: "0.0114",
  result: "filled",
};

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

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/fills", {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("cb-agentic live fills", { concurrency: false }, () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    secret: process.env.RESONANCE_SYNC_SECRET,
    fillsFile: process.env.RESONANCE_FILLS_FILE,
  };

  after(() => {
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.secret === undefined) delete process.env.RESONANCE_SYNC_SECRET;
    else process.env.RESONANCE_SYNC_SECRET = previous.secret;
    if (previous.fillsFile === undefined) delete process.env.RESONANCE_FILLS_FILE;
    else process.env.RESONANCE_FILLS_FILE = previous.fillsFile;
    setSqlClientForTests(null);
  });

  it("applies the two live orders once and keeps the transfer lot uncosted", async () => {
    delete process.env.RESONANCE_FILLS_FILE;
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    setSqlClientForTests(memorySql());
    const migrated = await migrate();
    assert.ok(migrated.applied.includes("012_sui_agentic_sleeve"));
    assert.ok(migrated.applied.includes("013_sui_coinbase_backfill"));
    assert.ok(migrated.applied.includes("014_cb_agentic_xrp"));

    const xrpFirst = await post(CB_AGENTIC_XRP_SELL);
    assert.equal(xrpFirst.status, 200, await xrpFirst.clone().text());
    const xrpBody = (await xrpFirst.json()) as {
      deduped: boolean;
      applied: boolean;
      fill: { feeUsd?: string };
      sleeves: { sleeves: { id: string; quantity: string }[] };
    };
    assert.equal(xrpBody.deduped, false);
    assert.equal(xrpBody.applied, true);
    assert.equal(xrpBody.fill.feeUsd, "0.0125");
    assert.equal(xrpBody.sleeves.sleeves.find((row) => row.id === "cb-agentic")?.quantity, "9");

    const xrpAgain = await post(CB_AGENTIC_XRP_SELL);
    assert.equal(xrpAgain.status, 200);
    const xrpReplay = (await xrpAgain.json()) as { deduped: boolean; applied: boolean };
    assert.equal(xrpReplay.deduped, true);
    assert.equal(xrpReplay.applied, false);

    const suiFirst = await post(CB_AGENTIC_SUI_BUY);
    assert.equal(suiFirst.status, 200, await suiFirst.clone().text());
    const suiBody = (await suiFirst.json()) as {
      deduped: boolean;
      applied: boolean;
      fill: { feeUsd?: string };
      sleeves: { sleeves: { id: string; quantity: string }[] };
    };
    assert.equal(suiBody.deduped, false);
    assert.equal(suiBody.applied, true);
    assert.equal(suiBody.fill.feeUsd, "0.0114");
    assert.equal(suiBody.sleeves.sleeves.find((row) => row.id === "cb-agentic")?.quantity, "1.2");
    assert.equal(suiBody.sleeves.sleeves.find((row) => row.id === "coinbase")?.quantity, "33.7");

    const suiAgain = await post(CB_AGENTIC_SUI_BUY);
    assert.equal(suiAgain.status, 200);
    const suiReplay = (await suiAgain.json()) as { deduped: boolean; applied: boolean };
    assert.equal(suiReplay.deduped, true);
    assert.equal(suiReplay.applied, false);

    const stored = await sqlQuery<{ external_id: string; fee: string | null }>(
      `SELECT external_id, payload->>'feeUsd' AS fee
       FROM fills
       WHERE external_id IN ($1, $2)
       ORDER BY external_id`,
      [`coinbase:${XRP_ORDER}`, `coinbase:${SUI_ORDER}`],
    );
    assert.deepEqual(
      stored.map((row) => row.external_id),
      [`coinbase:${SUI_ORDER}`, `coinbase:${XRP_ORDER}`],
    );
    assert.deepEqual(
      stored.map((row) => row.fee),
      ["0.0114", "0.0125"],
    );

    const prints = await sqlQuery<{ ticker: string; sleeve_id: string; quantity: string }>(
      `SELECT ticker, sleeve_id, quantity FROM sleeve_prints
       WHERE sleeve_id = 'cb-agentic'
       ORDER BY ticker`,
    );
    assert.deepEqual(prints, [
      { ticker: "SUI", sleeve_id: "cb-agentic", quantity: "1.2" },
      { ticker: "XRP", sleeve_id: "cb-agentic", quantity: "9" },
    ]);

    const loaded = await loadFillsStoreFresh();
    const xrpLines = cbAgenticLotLines({
      ticker: "XRP",
      fills: loaded.envelope.fills,
      quantity: loaded.envelope.sleevePrints.XRP?.["cb-agentic"] ?? null,
      livePrice: 1.3896,
    });
    assert.equal(xrpLines[0]?.secondary, "entry unknown · 9 of 10");
    assert.equal(xrpLines[0]?.pnlUsd, null);
    const suiLines = cbAgenticLotLines({
      ticker: "SUI",
      fills: loaded.envelope.fills,
      quantity: loaded.envelope.sleevePrints.SUI?.["cb-agentic"] ?? null,
      livePrice: 1.06,
    });
    assert.match(suiLines[0]?.secondary ?? "", /1\.2 @ \$1\.06/);
    assert.equal(
      loaded.envelope.fills.filter((row) => row.orderId === XRP_ORDER || row.orderId === SUI_ORDER).length,
      2,
    );
  });
});
