import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { FLARE_VAULT_XRP } from "@/data/xrp-sleeves";
import { FillIngestError, parseFillEvent, rewardIdempotencyKey } from "@/lib/fill-event";
import { ingestFillIntoEnvelope, createEmptyFillsEnvelope } from "@/lib/fills-store-core";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS, XRP_VAULT_REWARD_SQL } from "@/lib/pg/embedded-migrations";
import { applyMigrations, splitSqlStatements } from "@/lib/pg/migrate";
import { assembleNodePosition, buildLotsLedger, vaultUnknownLine } from "@/lib/position-lots";

const KEY = "manual:reward:flare-vault:xrp:2026-10-09t17:25";
const ORDER = "reward:flare-vault:XRP:2026-10-09T17:25";
const MIGRATION_ID = "021_xrp_vault_reward";

const rewardBody = {
  kind: "reward",
  venue: "manual",
  orderId: ORDER,
  idempotencyKey: KEY,
  ticker: "XRP",
  quantity: "6",
  sleeve: "flare-vault",
  filledAt: "2026-10-09T17:25:00-05:00",
  result: "filled",
  note: "Vault yield/rewards, manual update",
};

function rewardFill() {
  return {
    kind: "reward" as const,
    time: "2026-10-09T17:25:00-05:00",
    symbol: "XRP",
    quantity: "6",
    venue: "manual" as const,
    sleeve: "flare-vault" as const,
    orderId: ORDER,
    idempotencyKey: KEY,
    result: "filled",
    note: "Vault yield/rewards, manual update",
  };
}

async function postgres(): Promise<SqlClient> {
  const db = new PGlite();
  async function query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
    const result = await db.query<T>(text, [...params]);
    return result.rows ?? [];
  }
  return {
    query,
    async transaction(statements) {
      const results: Record<string, unknown>[][] = [];
      await query("BEGIN");
      try {
        for (const statement of statements) {
          results.push(await query(statement.text, statement.params ?? []));
        }
        await query("COMMIT");
        return results;
      } catch (error) {
        await query("ROLLBACK");
        throw error;
      }
    },
  };
}

describe("vault reward", () => {
  after(() => {
    setSqlClientForTests(null);
  });

  it("accepts the yield row and rejects a missing key, a price, or a trade sleeve", () => {
    assert.equal(rewardIdempotencyKey("2026-10-09T17:25:00-05:00"), KEY);
    const event = parseFillEvent(rewardBody);
    assert.equal(event.kind, "reward");
    if (event.kind !== "reward") return;
    assert.equal(event.qty, "6");
    assert.equal(event.sleeve, "flare-vault");
    assert.equal(event.idempotencyKey, KEY);
    assert.equal("price" in event && event.price != null, false);
    assert.throws(() => parseFillEvent({ ...rewardBody, idempotencyKey: undefined }), /idempotencyKey is required/);
    assert.throws(() => parseFillEvent({ ...rewardBody, price: "1.20" }), /no price/);
    assert.throws(() => parseFillEvent({ ...rewardBody, side: "buy" }), /cannot include a trade side/);
    assert.throws(
      () => parseFillEvent({ ...rewardBody, sleeve: "coinbase" }),
      (error: unknown) => error instanceof FillIngestError && /flare-vault/.test(error.message),
    );
  });

  it("logs the reward without a buy, a cost, or a sleeve move", () => {
    const empty = createEmptyFillsEnvelope("2026-10-09T22:25:00.000Z");
    const first = ingestFillIntoEnvelope(empty, parseFillEvent(rewardBody));
    assert.equal(first.applied, false);
    assert.equal(first.deduped, false);
    assert.equal(first.fill.kind, "reward");
    assert.deepEqual(first.envelope.sleevePrints, {});
    const again = ingestFillIntoEnvelope(first.envelope, parseFillEvent(rewardBody));
    assert.equal(again.deduped, true);
    assert.equal(again.envelope.fills.length, 1);

    const buy = {
      time: "2026-09-15T12:44:27-05:00",
      symbol: "XRP",
      side: "buy" as const,
      quantity: "61.601",
      price: "1.41454",
      sleeve: "rh-agentic",
      result: "filled",
    };
    const before = buildLotsLedger({
      fills: [buy],
      ticker: "XRP",
      sleeve: "rh-agentic",
      quantity: "51.601",
      livePrice: 1.4,
    });
    const after = buildLotsLedger({
      fills: [buy, rewardFill()],
      ticker: "XRP",
      sleeve: "rh-agentic",
      quantity: "51.601",
      livePrice: 1.4,
    });
    assert.equal(after.costUsd, before.costUsd);
    assert.deepEqual(after.closedLots, []);
    assert.equal(after.openLots.length, before.openLots.length);
    const position = assembleNodePosition({
      fills: [buy, rewardFill()],
      ticker: "XRP",
      sleeves: [
        { id: "rh-agentic", quantity: "51.601" },
        { id: "flare-vault", quantity: "28287" },
      ],
      priceUsd: 1.4,
      closes: [],
      today: "2026-10-09",
      vaultQuantity: "28287",
    });
    assert.equal(
      position?.vaultLine,
      vaultUnknownLine("28287", "6"),
    );
    assert.match(position?.vaultLine ?? "", /reward 6/);
    assert.equal((position?.vaultLine ?? "").includes("$"), false);
    assert.equal(FLARE_VAULT_XRP, "28287");
  });

  it("inserts the reward and the 28287 print only when the vault is the 28281 seed", async () => {
    const file = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../../db/migrations/021_xrp_vault_reward.sql"),
      "utf8",
    );
    assert.equal(XRP_VAULT_REWARD_SQL, file);
    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === "001_domain_tables"));
    const sql = splitSqlStatements(XRP_VAULT_REWARD_SQL);
    const missed = await sqlQuery<{ reward_rows: number; vault_rows: number }>(sql[0] ?? "");
    assert.equal(Number(missed[0]?.reward_rows), 1);
    assert.equal(Number(missed[0]?.vault_rows), 1);
    const again = await sqlQuery<{ reward_rows: number; vault_rows: number }>(sql[0] ?? "");
    assert.equal(Number(again[0]?.reward_rows), 0);
    assert.equal(Number(again[0]?.vault_rows), 0);
    const stored = await sqlQuery<{ side: string; price: string | null; sleeve: string; qty: string }>(
      `SELECT side, price::text AS price, sleeve, quantity::text AS qty FROM fills WHERE external_id = $1`,
      [KEY],
    );
    assert.equal(stored[0]?.side, "reward");
    assert.equal(stored[0]?.price, null);
    assert.equal(stored[0]?.sleeve, "flare-vault");
    assert.equal(stored[0]?.qty, "6");
    const buys = await sqlQuery<{ n: string }>(
      `SELECT count(*)::text AS n FROM fills WHERE side IN ('buy', 'sell')`,
      [],
    );
    assert.equal(buys[0]?.n, "0");
    const print = await sqlQuery<{ quantity: string }>(
      `SELECT quantity FROM sleeve_prints WHERE ticker = 'XRP' AND sleeve_id = 'flare-vault'`,
    );
    assert.equal(print[0]?.quantity, "28287");

    setSqlClientForTests(await postgres());
    await applyMigrations(EMBEDDED_MIGRATIONS.filter((entry) => entry.id === "001_domain_tables"));
    await sqlQuery(
      `INSERT INTO sleeve_prints (ticker, sleeve_id, quantity) VALUES ('XRP', 'flare-vault', '100')`,
    );
    const blocked = await sqlQuery<{ reward_rows: number; vault_rows: number }>(
      splitSqlStatements(XRP_VAULT_REWARD_SQL)[0] ?? "",
    );
    assert.equal(Number(blocked[0]?.reward_rows), 0);
    assert.equal(Number(blocked[0]?.vault_rows), 0);
    const still = await sqlQuery<{ quantity: string }>(
      `SELECT quantity FROM sleeve_prints WHERE ticker = 'XRP' AND sleeve_id = 'flare-vault'`,
    );
    assert.equal(still[0]?.quantity, "100");
    const none = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fills`);
    assert.equal(none[0]?.n, "0");

    const warns: string[] = [];
    const warn = console.warn;
    console.warn = (message?: unknown) => {
      warns.push(String(message));
    };
    try {
      const applied = await applyMigrations(
        EMBEDDED_MIGRATIONS.filter((entry) => entry.id === MIGRATION_ID),
      );
      assert.deepEqual(applied.applied, [MIGRATION_ID]);
    } finally {
      console.warn = warn;
    }
    assert.equal(warns.some((line) => line.includes("021_xrp_vault_reward: guard not met")), true);
  });
});
