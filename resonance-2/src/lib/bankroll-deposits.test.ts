import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { newDb } from "pg-mem";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/fights/bankroll/route";
import { POST } from "@/app/api/fights/bankroll/deposit/route";
import { computeBankroll } from "@/lib/bankroll";
import { parseBankrollDeposit } from "@/lib/bankroll-deposits";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";
import { resetBlobReadCacheForTests } from "@/lib/blob-read";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "bankroll-deposit-sync-secret";

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

function depositRequest(body: unknown, authorization = `Bearer ${SECRET}`) {
  return new NextRequest("https://resonance3.vercel.app/api/fights/bankroll/deposit", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ledgerRequest(authorization = `Bearer ${SECRET}`) {
  return new NextRequest("https://resonance3.vercel.app/api/fights/bankroll", {
    headers: { authorization },
  });
}

const DEPOSIT = {
  id: "coinbase-2026-10-18",
  date: "2026-10-18",
  amount: "6.84",
  note: "Coinbase transfer",
};

describe("bankroll deposit validation", () => {
  it("accepts a decimal string and rejects a loose amount, date, or id", () => {
    const row = parseBankrollDeposit(DEPOSIT);
    assert.equal(row.amount, "6.84");
    assert.equal(row.note, "Coinbase transfer");
    assert.equal(parseBankrollDeposit({ ...DEPOSIT, amount: "-2.5", note: "" }).amount, "-2.50");
    assert.equal(parseBankrollDeposit({ ...DEPOSIT, amount: "-2.5", note: "" }).note, null);
    assert.throws(() => parseBankrollDeposit({ ...DEPOSIT, amount: 6.84 }), /decimal string/);
    assert.throws(() => parseBankrollDeposit({ ...DEPOSIT, amount: "6.849" }), /decimal string/);
    assert.throws(() => parseBankrollDeposit({ ...DEPOSIT, date: "10/18/2026" }), /YYYY-MM-DD/);
    assert.throws(() => parseBankrollDeposit({ ...DEPOSIT, date: "2026-02-31" }), /YYYY-MM-DD/);
    assert.throws(() => parseBankrollDeposit({ ...DEPOSIT, id: "Coinbase Transfer" }), /lowercase slug/);
    assert.throws(() => parseBankrollDeposit({ ...DEPOSIT, note: 1 }), /note must be a string/);
    const file = readFileSync(path.join(root, "db/migrations/032_bankroll_deposits.sql"), "utf8");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "032_bankroll_deposits");
    assert.equal(embedded?.sql, file);
    assert.equal(file.includes("INSERT"), false);
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "033_fighter_careers");
  });

  it("shows the deposit total in dollars and a percent with no dollar sign in public mode", async () => {
    const { BankrollLedgerView } = await import("@/components/predictions-floor");
    const ledger = computeBankroll([], [], [{ date: "2026-10-18", amount: "6.84" }]);
    const privateCard = render(createElement(BankrollLedgerView, { ledger }));
    assert.match(privateCard, /Deposits/);
    assert.match(privateCard, /\+\$6\.84/);
    const publicCard = render(createElement(BankrollLedgerView, { ledger, publicMode: true }));
    assert.match(publicCard, /Deposits/);
    assert.match(publicCard, /\+28\.62%/);
    assert.equal(publicCard.includes("$"), false);
  });
});

describe("bankroll deposit route", { concurrency: false }, () => {
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
    await sqlQuery(`DELETE FROM bankroll_deposits`);
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

  it("changes bankroll and cash, keeps the flat stake, and a repeat id does not double-count", async () => {
    const denied = await POST(depositRequest(DEPOSIT, ""));
    assert.equal(denied.status, 401);

    const before = await GET(ledgerRequest());
    assert.equal(before.status, 200);
    const opened = (await before.json()) as {
      bankroll: string;
      cash: string;
      suggestedStake: string;
      recordLabel: string;
      realizedLabel: string;
      roiLabel: string;
      tiers: unknown;
      deposits: unknown[];
    };

    const first = await POST(depositRequest(DEPOSIT));
    assert.equal(first.status, 200);
    const created = (await first.json()) as { deduped: boolean; deposit: { amount: string; id: string } };
    assert.equal(created.deduped, false);
    assert.equal(created.deposit.amount, "6.84");

    const again = await POST(depositRequest({ ...DEPOSIT, amount: "9.99", note: "different" }));
    assert.equal(again.status, 200);
    const repeat = (await again.json()) as { deduped: boolean; deposit: { amount: string; note: string | null } };
    assert.equal(repeat.deduped, true);
    assert.equal(repeat.deposit.amount, "6.84");
    assert.equal(repeat.deposit.note, "Coinbase transfer");

    const after = await GET(ledgerRequest());
    assert.equal(after.status, 200);
    const closed = (await after.json()) as typeof opened & { depositTotal: string };
    assert.equal(closed.deposits.length, 1);
    assert.equal(closed.depositTotal, "6.84");
    assert.equal(closed.recordLabel, opened.recordLabel);
    assert.equal(closed.realizedLabel, opened.realizedLabel);
    assert.equal(closed.roiLabel, opened.roiLabel);
    assert.deepEqual(closed.tiers, opened.tiers);
    assert.notEqual(closed.bankroll, opened.bankroll);
    assert.notEqual(closed.cash, opened.cash);
    assert.equal(opened.suggestedStake, "1.00");
    assert.equal(closed.suggestedStake, "1.00");
    const rows = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM bankroll_deposits`);
    assert.equal(String(rows[0]?.n), "1");
  });
});
