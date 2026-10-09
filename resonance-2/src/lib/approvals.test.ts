import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/approvals/route";
import { POST as decide } from "@/app/api/approvals/[id]/decision/route";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import {
  SECRET_OR_ACCOUNT_ERROR,
  approvalsLabel,
  parseApprovalBody,
  parseDecisionBody,
  payloadLooksSecret,
  textLooksSecret,
} from "@/lib/approvals";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations, migrate } from "@/lib/pg/migrate";
import { PUBLIC_MODE_COOKIE, isHiddenInPublicMode } from "@/lib/public-mode";
import { proxy } from "@/proxy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "approval-sync-secret";

function envSnapshot() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
    AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
  };
}

function restore(previous: ReturnType<typeof envSnapshot>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
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

function draft(partial: Record<string, unknown> = {}) {
  return {
    idempotency_key: "floor-desk:thursday-walkthrough",
    requested_by_agent: "floor-desk",
    title: "Clear the Thursday walkthrough",
    detail: "Confirm the room is booked. This request only asks for a yes or no.",
    category: "other",
    ...partial,
  };
}

function submit(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("https://resonance3.vercel.app/api/approvals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SECRET}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

function ownerDecision(id: string, token: string, body: unknown, extra: Record<string, string> = {}) {
  return decide(
    new Request(`https://resonance3.vercel.app/api/approvals/${id}/decision`, {
      method: "POST",
      headers: {
        host: "resonance3.vercel.app",
        origin: "https://resonance3.vercel.app",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${token}`,
        ...extra,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("approval text", () => {
  it("rejects secrets and full account numbers and keeps ordinary notes", () => {
    assert.equal(textLooksSecret("Confirm the room is booked."), false);
    assert.equal(textLooksSecret("No secrets are included."), false);
    assert.equal(textLooksSecret("Move ten tokens."), false);
    assert.equal(textLooksSecret("order 6aad6b7a-415a-4895-b43c-72c0eca79a55"), false);
    assert.equal(textLooksSecret("reference 12345678901"), false);
    assert.equal(textLooksSecret("sk_live_abc123456789"), true);
    assert.equal(textLooksSecret("-----BEGIN PRIVATE KEY-----\nabc"), true);
    assert.equal(textLooksSecret("account 123456789012"), true);
    assert.equal(textLooksSecret("routing 021000021"), true);
    assert.equal(textLooksSecret("4111 1111 1111 1111"), true);
    assert.equal(textLooksSecret(`token=${"a".repeat(32)}`), true);
    assert.equal(payloadLooksSecret({ password: "hunter2" }), true);
    assert.equal(payloadLooksSecret({ account_number: "12" }), true);
    assert.equal(payloadLooksSecret(draft()), false);

    const secret = parseApprovalBody(draft({ detail: "key sk_live_abc123456789" }));
    assert.equal(secret.ok, false);
    if (!secret.ok) assert.equal(secret.error, SECRET_OR_ACCOUNT_ERROR);
    const labeled = parseDecisionBody({ decision: "approved", note: "card 4111111111111111" });
    assert.equal(labeled.ok, false);
    const clean = parseApprovalBody(draft());
    assert.equal(clean.ok, true);
    assert.equal(approvalsLabel(0), "Approvals");
    assert.equal(approvalsLabel(2), "Approvals, 2 pending");
  });
});

describe("approval queue", { concurrency: false }, () => {
  const previous = envSnapshot();

  before(async () => {
    process.env.DATABASE_URL = "postgres://resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$dummy";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-approval-tests";
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    setSqlClientForTests(await postgres());
    await migrate();
  });

  after(() => {
    setSqlClientForTests(null);
    restore(previous);
  });

  beforeEach(async () => {
    await sqlQuery(`DELETE FROM approvals`);
  });

  it("applies migration 022 once and leaves the table empty", async () => {
    const file = readFileSync(path.join(root, "db/migrations/022_approvals.sql"), "utf8");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "022_approvals");
    assert.equal(embedded?.sql, file);
    const columns = await sqlQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'approvals' ORDER BY ordinal_position`,
    );
    assert.deepEqual(
      columns.map((column) => column.column_name),
      [
        "id",
        "created_at",
        "requested_by_agent",
        "title",
        "detail",
        "category",
        "node",
        "status",
        "decided_by",
        "decided_at",
        "decision_note",
        "idempotency_key",
      ],
    );
    const empty = await sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM approvals`);
    assert.equal(Number(empty[0]?.n), 0);

    const skipped = await migrate();
    assert.equal(skipped.applied.includes("022_approvals"), false);
    assert.equal(skipped.skipped.includes("022_approvals"), true);

    await sqlQuery(
      `INSERT INTO approvals (id, requested_by_agent, title, category, idempotency_key)
       VALUES ('appr_abcdefghijklmnop', 'floor-desk', 'Keep me', 'other', 'idem-keep-1')`,
    );
    await assert.rejects(() =>
      sqlQuery(
        `INSERT INTO approvals (id, requested_by_agent, title, category, idempotency_key)
         VALUES ('appr_secondkey00000000', 'floor-desk', 'Again', 'other', 'idem-keep-1')`,
      ),
    );
    await assert.rejects(() =>
      sqlQuery(
        `INSERT INTO approvals (id, requested_by_agent, title, category, status, idempotency_key)
         VALUES ('appr_badstatus00000000', 'floor-desk', 'No', 'other', 'expired', 'idem-bad-1')`,
      ),
    );

    await sqlQuery(`DELETE FROM schema_migrations WHERE id = '022_approvals'`);
    const rerun = await applyMigrations([{ id: "022_approvals", sql: file }]);
    assert.deepEqual(rerun.applied, ["022_approvals"]);
    const kept = await sqlQuery<{ title: string }>(`SELECT title FROM approvals`);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.title, "Keep me");
  });

  it("submits once for an idempotency key and rejects a session submit", async () => {
    const first = await submit(draft());
    assert.equal(first.status, 200);
    const created = (await first.json()) as {
      ok: boolean;
      replay: boolean;
      approval: { id: string; title: string; status: string };
    };
    assert.equal(created.ok, true);
    assert.equal(created.replay, false);
    assert.equal(created.approval.status, "pending");
    assert.match(created.approval.id, /^appr_[A-Za-z0-9_-]{16}$/);

    const second = await submit(draft({ title: "A different title" }));
    assert.equal(second.status, 200);
    const replay = (await second.json()) as {
      replay: boolean;
      approval: { id: string; title: string };
    };
    assert.equal(replay.replay, true);
    assert.equal(replay.approval.id, created.approval.id);
    assert.equal(replay.approval.title, "Clear the Thursday walkthrough");
    const rows = await sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM approvals`);
    assert.equal(Number(rows[0]?.n), 1);

    const token = await createSession("Test");
    const cookieOnly = await submit(draft({ idempotency_key: "floor-desk:other-note" }), {
      authorization: "",
      cookie: `${SESSION_COOKIE}=${token}`,
    });
    assert.equal(cookieOnly.status, 401);
    const still = await sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM approvals`);
    assert.equal(Number(still[0]?.n), 1);
  });

  it("rejects secret-shaped fields before insert", async () => {
    const cases = [
      draft({ detail: "-----BEGIN PRIVATE KEY-----\nabc" }),
      draft({ title: "Use sk_live_abc123456789" }),
      draft({ detail: "account 123456789012" }),
      { ...draft(), account_number: "00112233" },
      { ...draft(), password: "hunter2" },
    ];
    for (const body of cases) {
      const response = await submit(body);
      assert.equal(response.status, 400);
      const payload = (await response.json()) as { error: string };
      assert.equal(payload.error, SECRET_OR_ACCOUNT_ERROR);
    }
    const rows = await sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM approvals`);
    assert.equal(Number(rows[0]?.n), 0);
  });

  it("records one decision and refuses a second", async () => {
    const created = await submit(draft());
    const approval = ((await created.json()) as { approval: { id: string } }).approval;
    const token = await createSession("Test");
    const fillsBefore = await sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM fills`);

    const approved = await ownerDecision(approval.id, token, {
      decision: "approved",
      note: "Cleared for the work window.",
    });
    assert.equal(approved.status, 200);
    const body = (await approved.json()) as {
      executed: boolean;
      approval: { status: string; decided_by: string; decision_note: string };
    };
    assert.equal(body.executed, false);
    assert.equal(body.approval.status, "approved");
    assert.equal(body.approval.decided_by, "owner");
    assert.equal(body.approval.decision_note, "Cleared for the work window.");

    const again = await ownerDecision(approval.id, token, { decision: "declined" });
    assert.equal(again.status, 409);
    const still = await sqlQuery<{ status: string }>(`SELECT status FROM approvals WHERE id = $1`, [
      approval.id,
    ]);
    assert.equal(still[0]?.status, "approved");
    const fillsAfter = await sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM fills`);
    assert.equal(Number(fillsAfter[0]?.n), Number(fillsBefore[0]?.n));

    const route = readFileSync(
      path.join(root, "src/app/api/approvals/[id]/decision/route.ts"),
      "utf8",
    );
    assert.match(route, /executed: false/);
    assert.doesNotMatch(route, /coinbase|robinhood|xrpl|placeOrder|fetch\(/i);
  });

  it("requires an owner session to decide and hides the queue from a signed-out caller", async () => {
    const created = await submit(draft());
    const approval = ((await created.json()) as { approval: { id: string } }).approval;

    const signedOut = await decide(
      new Request(`https://resonance3.vercel.app/api/approvals/${approval.id}/decision`, {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          origin: "https://resonance3.vercel.app",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
        },
        body: JSON.stringify({ decision: "approved" }),
      }),
      { params: Promise.resolve({ id: approval.id }) },
    );
    assert.equal(signedOut.status, 401);

    const token = await createSession("Test");
    const bearer = await ownerDecision(approval.id, token, { decision: "approved" }, {
      authorization: `Bearer ${SECRET}`,
    });
    assert.equal(bearer.status, 401);

    const crossSite = await decide(
      new Request(`https://resonance3.vercel.app/api/approvals/${approval.id}/decision`, {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify({ decision: "approved" }),
      }),
      { params: Promise.resolve({ id: approval.id }) },
    );
    assert.equal(crossSite.status, 403);

    const list = await GET(new Request("https://resonance3.vercel.app/api/approvals"));
    assert.equal(list.status, 401);

    const page = await proxy(new NextRequest("https://resonance3.vercel.app/n/approvals"));
    assert.equal(page.status, 307);
    assert.match(page.headers.get("location") ?? "", /\/login\?next=%2Fn%2Fapprovals$/);
    const child = await proxy(new NextRequest("https://resonance3.vercel.app/n/approvals/pending"));
    assert.equal(child.status, 307);
    const api = await proxy(new NextRequest("https://resonance3.vercel.app/api/approvals"));
    assert.equal(api.status, 401);

    await sqlQuery(`UPDATE users SET role = 'operator' WHERE username = 'andres'`);
    try {
      const operator = await ownerDecision(approval.id, token, { decision: "approved" });
      assert.equal(operator.status, 403);
    } finally {
      await sqlQuery(`UPDATE users SET role = 'owner' WHERE username = 'andres'`);
    }
    const pending = await sqlQuery<{ status: string }>(`SELECT status FROM approvals WHERE id = $1`, [
      approval.id,
    ]);
    assert.equal(pending[0]?.status, "pending");
  });

  it("hides the queue in public mode", async () => {
    const created = await submit(
      draft({ title: "Clear the Thursday walkthrough", idempotency_key: "floor-desk:public-hide" }),
    );
    const approval = ((await created.json()) as { approval: { id: string; title: string } }).approval;
    const token = await createSession("Test");
    const hidden = await GET(
      new Request("https://resonance3.vercel.app/api/approvals", {
        headers: { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` },
      }),
    );
    assert.equal(hidden.status, 404);
    const text = await hidden.text();
    assert.match(text, /Private/);
    assert.equal(text.includes(approval.title), false);

    const decision = await ownerDecision(
      approval.id,
      token,
      { decision: "approved" },
      { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` },
    );
    assert.equal(decision.status, 404);
    const still = await sqlQuery<{ status: string }>(`SELECT status FROM approvals WHERE id = $1`, [
      approval.id,
    ]);
    assert.equal(still[0]?.status, "pending");

    for (const path of ["/n/approvals", "/n/approvals/pending", "/n/approvals/done", "/api/approvals"]) {
      assert.equal(isHiddenInPublicMode(path), true, path);
    }
    const parent = readFileSync(path.join(root, "src/app/n/approvals/page.tsx"), "utf8");
    const view = readFileSync(path.join(root, "src/app/n/approvals/[view]/page.tsx"), "utf8");
    const toolbar = readFileSync(path.join(root, "src/components/operator-toolbar.tsx"), "utf8");
    assert.ok(parent.indexOf("blockedPublicPage") < parent.indexOf("loadApprovalBoard"));
    assert.ok(view.indexOf("blockedPublicPage") < view.indexOf("listApprovals"));
    assert.match(toolbar, /phoneTabHidden/);
    assert.match(toolbar, /publicMode \? null/);
  });
});
