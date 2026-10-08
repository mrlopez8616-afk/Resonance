import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { newDb } from "pg-mem";
import { GET, POST } from "@/app/api/finance/snapshot/route";
import { proxy } from "@/proxy";
import { planAccess } from "@/lib/auth-core";
import {
  decryptFinancePayload,
  encryptFinancePayload,
  financeKeyFromEnv,
} from "@/lib/finance/crypto";
import { SYNTHETIC_FINANCE_SNAPSHOT } from "@/lib/finance/fixture";
import { parseFinanceSnapshot, type FinanceSnapshot } from "@/lib/finance/schema";
import { readLatestFinanceSnapshot } from "@/lib/finance/store";
import {
  financeAsOfStale,
  financeCards,
  financeDetail,
  financeHomeForRole,
  notLinkedCount,
} from "@/lib/finance/view";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";

const TOKEN = "finance-ingest-token-for-tests";
const KEY = "11".repeat(32);
const OTHER_KEY = "22".repeat(32);

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

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new Request("https://resonance.test/api/finance/snapshot", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function minimalSnapshot(asOf: string, balance = 5000): FinanceSnapshot {
  return {
    asOf,
    accounts: [
      {
        id: "chk-1",
        name: "Everyday Checking",
        institution: "Northwind Bank",
        type: "checking",
        last4: "1001",
        balance,
        linked: true,
      },
    ],
    unlinked: [],
    cashFlow: {
      months: [],
      thisMonth: { income: 1000, spend: 400, net: 600, daysElapsed: 1 },
      avgNet3: 600,
      avgNet12: 600,
    },
    categories: [],
    recurring: [],
    debts: [],
    fees: [],
    alerts: [],
    coverage: { missing: ["Coinbase"] },
  };
}

function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, (date ?? 1) + delta));
  return utc.toISOString().slice(0, 10);
}

describe("finance snapshot", { concurrency: false }, () => {
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    token: process.env.FINANCE_INGEST_TOKEN,
    key: process.env.FINANCE_ENC_KEY,
    secret: process.env.RESONANCE_SYNC_SECRET,
    password: process.env.AUTH_PASSWORD_HASH,
    totp: process.env.AUTH_TOTP_SECRET,
    session: process.env.AUTH_SESSION_SECRET,
  };

  after(() => {
    for (const [name, value] of Object.entries({
      DATABASE_URL: previous.databaseUrl,
      FINANCE_INGEST_TOKEN: previous.token,
      FINANCE_ENC_KEY: previous.key,
      RESONANCE_SYNC_SECRET: previous.secret,
      AUTH_PASSWORD_HASH: previous.password,
      AUTH_TOTP_SECRET: previous.totp,
      AUTH_SESSION_SECRET: previous.session,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    setSqlClientForTests(null);
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.FINANCE_INGEST_TOKEN = TOKEN;
    process.env.FINANCE_ENC_KEY = KEY;
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    process.env.AUTH_PASSWORD_HASH = "hash";
    process.env.AUTH_TOTP_SECRET = "totp";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    setSqlClientForTests(memorySql());
    await migrate();
  });

  it("fails closed without the ingest token, encryption key, or database", async () => {
    delete process.env.FINANCE_INGEST_TOKEN;
    const closed = await post(SYNTHETIC_FINANCE_SNAPSHOT);
    assert.equal(closed.status, 503);

    process.env.FINANCE_INGEST_TOKEN = TOKEN;
    delete process.env.FINANCE_ENC_KEY;
    const noKey = await post(SYNTHETIC_FINANCE_SNAPSHOT);
    assert.equal(noKey.status, 503);

    process.env.FINANCE_ENC_KEY = "abcd";
    const shortKey = await post(SYNTHETIC_FINANCE_SNAPSHOT);
    assert.equal(shortKey.status, 503);
    assert.equal(financeKeyFromEnv(), null);

    process.env.FINANCE_ENC_KEY = KEY;
    delete process.env.DATABASE_URL;
    const noDb = await post(SYNTHETIC_FINANCE_SNAPSHOT);
    assert.equal(noDb.status, 503);
  });

  it("rejects a missing token, a wrong token, and the hub secret", async () => {
    const missing = await post(SYNTHETIC_FINANCE_SNAPSHOT, { authorization: "" });
    assert.equal(missing.status, 401);
    const wrong = await post(SYNTHETIC_FINANCE_SNAPSHOT, { authorization: "Bearer not-the-token" });
    assert.equal(wrong.status, 401);
    const hub = await post(SYNTHETIC_FINANCE_SNAPSHOT, { authorization: "Bearer hub-secret" });
    assert.equal(hub.status, 401);
  });

  it("rejects a bearer GET and redirects an anonymous finance page", async () => {
    const bearer = await GET(
      new Request("https://resonance.test/api/finance/snapshot", {
        headers: { authorization: "Bearer hub-secret" },
      }),
    );
    assert.equal(bearer.status, 401);
    const body = await bearer.json();
    assert.equal(JSON.stringify(body).includes("5000"), false);

    const anonymous = await GET(new Request("https://resonance.test/api/finance/snapshot"));
    assert.equal(anonymous.status, 401);

    assert.equal(
      planAccess({
        pathname: "/api/finance/snapshot",
        method: "GET",
        sessionToken: null,
        bearerOk: true,
        loginConfigured: true,
        nextPath: "/api/finance/snapshot",
      }).kind,
      "deny",
    );

    const proxied = await proxy(
      new NextRequest("https://resonance.test/api/finance/snapshot", {
        headers: { authorization: "Bearer hub-secret" },
      }),
    );
    assert.equal(proxied.status, 401);
    const bets = await proxy(
      new NextRequest("https://resonance.test/api/bets", {
        headers: { authorization: "Bearer hub-secret" },
      }),
    );
    assert.notEqual(bets.status, 401);

    const page = await proxy(new NextRequest("https://resonance.test/n/finance"));
    assert.equal(page.status, 307);
    assert.match(page.headers.get("location") ?? "", /\/login\?next=%2Fn%2Ffinance$/);
    const child = await proxy(new NextRequest("https://resonance.test/n/finance/net-worth"));
    assert.match(child.headers.get("location") ?? "", /\/login\?next=%2Fn%2Ffinance%2Fnet-worth$/);
  });

  it("rejects unknown keys, a negative spend, and a fee older than 90 days", () => {
    const unknown = parseFinanceSnapshot({ ...SYNTHETIC_FINANCE_SNAPSHOT, leak: "secret-value" });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.error.includes("secret-value"), false);

    const nested = parseFinanceSnapshot({
      ...SYNTHETIC_FINANCE_SNAPSHOT,
      accounts: SYNTHETIC_FINANCE_SNAPSHOT.accounts.map((account, index) =>
        index === 0 ? { ...account, nickname: "nope" } : account,
      ),
    });
    assert.equal(nested.ok, false);

    const spend = parseFinanceSnapshot({
      ...SYNTHETIC_FINANCE_SNAPSHOT,
      cashFlow: {
        ...SYNTHETIC_FINANCE_SNAPSHOT.cashFlow,
        thisMonth: { ...SYNTHETIC_FINANCE_SNAPSHOT.cashFlow.thisMonth, spend: -20 },
      },
    });
    assert.equal(spend.ok, false);

    const oldFee = parseFinanceSnapshot({
      ...minimalSnapshot("2026-10-07"),
      fees: [
        {
          date: "2026-06-01",
          account: "Everyday Checking",
          amount: 10,
          kind: "other",
          name: "Old fee",
        },
      ],
    });
    assert.equal(oldFee.ok, false);

    const parsed = parseFinanceSnapshot(SYNTHETIC_FINANCE_SNAPSHOT);
    assert.equal(parsed.ok, true);
  });

  it("dedupes the same canonical body and replaces the same as-of", async () => {
    const first = await post(SYNTHETIC_FINANCE_SNAPSHOT);
    assert.equal(first.status, 200);
    const created = await first.json();
    assert.equal(created.ok, true);
    assert.equal(created.deduped, false);
    assert.equal(created.asOf, "2026-10-07");
    assert.equal(typeof created.storedAt, "string");

    const shuffled = {
      coverage: SYNTHETIC_FINANCE_SNAPSHOT.coverage,
      alerts: SYNTHETIC_FINANCE_SNAPSHOT.alerts,
      fees: SYNTHETIC_FINANCE_SNAPSHOT.fees,
      debts: SYNTHETIC_FINANCE_SNAPSHOT.debts,
      recurring: SYNTHETIC_FINANCE_SNAPSHOT.recurring,
      categories: SYNTHETIC_FINANCE_SNAPSHOT.categories,
      cashFlow: SYNTHETIC_FINANCE_SNAPSHOT.cashFlow,
      unlinked: SYNTHETIC_FINANCE_SNAPSHOT.unlinked,
      accounts: SYNTHETIC_FINANCE_SNAPSHOT.accounts,
      asOf: SYNTHETIC_FINANCE_SNAPSHOT.asOf,
    };
    const second = await post(shuffled);
    const deduped = await second.json();
    assert.equal(second.status, 200);
    assert.equal(deduped.deduped, true);
    assert.equal(deduped.storedAt, created.storedAt);

    const stored = await sqlQuery<{ n: string; payload_enc: string }>(
      `SELECT count(*) AS n, max(payload_enc) AS payload_enc FROM finance_snapshots`,
    );
    assert.equal(Number(stored[0]?.n), 1);
    assert.equal(String(stored[0]?.payload_enc).includes("Northwind"), false);
    assert.equal(String(stored[0]?.payload_enc).includes("Everyday"), false);

    const replaced = await post({
      ...SYNTHETIC_FINANCE_SNAPSHOT,
      accounts: SYNTHETIC_FINANCE_SNAPSHOT.accounts.map((account) =>
        account.id === "chk-1" ? { ...account, balance: 9000 } : account,
      ),
    });
    const updated = await replaced.json();
    assert.equal(updated.deduped, false);
    assert.equal(updated.asOf, "2026-10-07");
    const latest = await readLatestFinanceSnapshot();
    assert.equal(latest?.snapshot.accounts.find((account) => account.id === "chk-1")?.balance, 9000);
    const stillOne = await sqlQuery<{ n: string }>(`SELECT count(*) AS n FROM finance_snapshots`);
    assert.equal(Number(stillOne[0]?.n), 1);
  });

  it("keeps the last 30 snapshots", async () => {
    for (let index = 0; index < 31; index += 1) {
      const response = await post(minimalSnapshot(addDays("2026-01-01", index), 1000 + index));
      assert.equal(response.status, 200);
    }
    const rows = await sqlQuery<{ as_of: unknown }>(
      `SELECT as_of FROM finance_snapshots ORDER BY as_of`,
    );
    const days = rows.map((row) => {
      const value = row.as_of;
      if (value instanceof Date) {
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const date = String(value.getDate()).padStart(2, "0");
        return `${value.getFullYear()}-${month}-${date}`;
      }
      return String(value).slice(0, 10);
    });
    assert.equal(days.length, 30);
    assert.equal(days.includes("2026-01-01"), false);
    assert.equal(days.includes("2026-01-31"), true);
  });

  it("round-trips the ciphertext and rejects a wrong key", () => {
    const key = Buffer.from(KEY, "hex");
    const encrypted = encryptFinancePayload("synthetic-body", key, "2026-10-07");
    assert.equal(decryptFinancePayload(encrypted, key, "2026-10-07"), "synthetic-body");
    assert.throws(() => decryptFinancePayload(encrypted, Buffer.from(OTHER_KEY, "hex"), "2026-10-07"));
    assert.equal(encrypted.payloadEnc.includes("synthetic-body"), false);
  });

  it("hides empty lines and labels net worth partial", () => {
    const cards = financeCards(SYNTHETIC_FINANCE_SNAPSHOT);
    const net = cards.find((card) => card.id === "net-worth");
    assert.equal(net?.headline, "$40,000");
    assert.deepEqual(net?.lines, ["partial"]);
    const debt = cards.find((card) => card.id === "debt");
    assert.equal(debt?.headline, "$10,000");
    assert.deepEqual(debt?.lines, ["$250 minimums", "1 not linked"]);
    assert.equal(notLinkedCount(SYNTHETIC_FINANCE_SNAPSHOT), 1);

    const quiet: FinanceSnapshot = {
      ...SYNTHETIC_FINANCE_SNAPSHOT,
      alerts: [],
      unlinked: [],
      debts: SYNTHETIC_FINANCE_SNAPSHOT.debts.filter((item) => item.linked).map((item) => ({
        ...item,
        minPayment: null,
      })),
      coverage: { missing: [] },
    };
    const quietCards = financeCards(quiet);
    assert.deepEqual(quietCards.find((card) => card.id === "fees")?.lines, []);
    assert.deepEqual(quietCards.find((card) => card.id === "debt")?.lines, []);
    assert.deepEqual(quietCards.find((card) => card.id === "net-worth")?.lines, []);

    const detail = financeDetail(SYNTHETIC_FINANCE_SNAPSHOT, "debt");
    assert.ok(detail);
    const owed = detail?.tables[0]?.rows.find((row) => row[0] === "Student note");
    assert.equal(owed?.[1], "not linked");
    assert.equal(owed?.join(" ").includes("$0"), false);
    assert.equal(detail?.tables[0]?.rows.some((row) => row.includes("APR unknown")), true);

    const face = financeHomeForRole("owner", SYNTHETIC_FINANCE_SNAPSHOT);
    assert.equal(face?.headline, "$40,000 partial");
    assert.equal(face?.asOfLine, "as of 7 Oct 2026");
    assert.equal(financeHomeForRole("operator", SYNTHETIC_FINANCE_SNAPSHOT), null);
    assert.equal(financeHomeForRole("owner", null), null);
    assert.equal(financeAsOfStale("2026-10-07", new Date("2026-10-08T17:00:00Z")), false);
    assert.equal(financeAsOfStale("2026-10-01", new Date("2026-10-08T17:00:00Z")), true);

    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const rendered = spawnSync(path.join(root, "node_modules/.bin/tsx"), ["src/lib/finance-render-check.ts"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(rendered.status, 0, rendered.stderr || rendered.stdout);
  });

  it("rejects a snapshot larger than 256KB", async () => {
    const huge = await post(`{"asOf":"${"x".repeat(300_000)}"}`);
    assert.equal(huge.status, 413);
  });
});
