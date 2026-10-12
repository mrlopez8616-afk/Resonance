import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { GET as listGet, POST as agentPost } from "@/app/api/roundtable/route";
import { GET as threadGet } from "@/app/api/roundtable/[id]/route";
import { POST as replyPost } from "@/app/api/roundtable/[id]/reply/route";
import { SYSTEM_AGENTS } from "@/data/system-map";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations, migrate } from "@/lib/pg/migrate";
import { proxy } from "@/proxy";
import { PUBLIC_MODE_COOKIE } from "@/lib/public-mode";
import {
  ROUNDTABLE_EMPTY,
  formatRoundtableWhen,
  isRoundtableAgent,
  parseAgentPost,
  presentRoundtableCards,
  presentRoundtableThread,
  roundtableHomeModel,
  type RoundtableThread as ThreadRecord,
  type RoundtableThreadSummary,
} from "@/lib/roundtable";
import { readFounderThreads } from "@/lib/roundtable-store";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "roundtable-sync-secret";

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (normalized === "next/link" || normalized.includes("next/dist/client/link")) {
    return {
      __esModule: true,
      default: function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string; title?: string }) {
        return createElement("a", { href: props.href ?? "", className: props.className, title: props.title }, props.children);
      },
    };
  }
  if (normalized === "next/navigation" || normalized.includes("next/dist/client/components/navigation")) {
    return {
      __esModule: true,
      useRouter: () => ({ refresh() {} }),
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
  const props = node.props as { children?: ReactNode };
  return render(props.children);
}

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

function summary(partial: Partial<RoundtableThreadSummary> & Pick<RoundtableThreadSummary, "id" | "title">): RoundtableThreadSummary {
  return {
    agentId: "finance-desk",
    audience: "founder",
    createdAt: "2026-10-12T15:00:00.000Z",
    updatedAt: "2026-10-12T15:00:00.000Z",
    messageCount: 1,
    ...partial,
  };
}

describe("roundtable copy", () => {
  it("names the nine agents and hides youtube and dollars from the floor", async () => {
    assert.deepEqual(
      SYSTEM_AGENTS.map((agent) => agent.id),
      [
        "sophia",
        "robinhood-ops",
        "crypto-desk",
        "ai-stocks-desk",
        "fight-desk",
        "fitness-coach",
        "finance-desk",
        "youtube-studio",
        "architect",
      ],
    );
    for (const agent of SYSTEM_AGENTS) assert.equal(isRoundtableAgent(agent.id), true);
    assert.equal(isRoundtableAgent("carla"), false);

    const empty = roundtableHomeModel([], { publicMode: false });
    assert.deepEqual(empty, { unavailable: false, count: 0, lines: [ROUNDTABLE_EMPTY] });
    assert.equal(ROUNDTABLE_EMPTY, "no messages yet");

    const threads = [
      summary({ id: "rt-bills", title: "Wire $40 on Thursday", updatedAt: "2026-10-12T15:00:00.000Z" }),
      summary({ id: "rt-yt", title: "Episode cut", audience: "youtube", agentId: "youtube-studio" }),
      summary({ id: "rt-steps", title: "Steps are in", agentId: "fitness-coach", updatedAt: "2026-10-12T16:00:00.000Z" }),
      summary({ id: "rt-three", title: "Third", updatedAt: "2026-10-12T17:00:00.000Z" }),
      summary({ id: "rt-four", title: "Fourth stays off the home card", updatedAt: "2026-10-12T18:00:00.000Z" }),
    ];
    const home = roundtableHomeModel(threads, { publicMode: false });
    assert.equal(home?.count, 4);
    assert.deepEqual(home?.lines, ["Wire $40 on Thursday", "Steps are in", "Third"]);
    assert.equal(roundtableHomeModel(threads, { publicMode: true }), null);
    assert.equal(JSON.stringify(roundtableHomeModel(threads, { publicMode: true })), "null");

    const cards = presentRoundtableCards(threads, false);
    assert.equal(cards?.some((card) => card.id === "rt-yt"), false);
    assert.equal(JSON.stringify(cards).includes("Episode cut"), false);
    assert.equal(presentRoundtableCards(threads, true), null);
    const bill = cards?.find((card) => card.id === "rt-bills");
    assert.equal(bill?.agentName, "Finance Desk");
    assert.equal(bill?.title, "Wire $40 on Thursday");
    assert.equal(bill?.countLabel, "1 message");
    assert.equal(bill && "audience" in bill, false);
    assert.equal(formatRoundtableWhen("2026-10-12T15:00:00.000Z"), "Oct 12, 10:00 AM");

    const thread: ThreadRecord = {
      ...summary({ id: "rt-bills", title: "Wire $40 on Thursday" }),
      messages: [
        {
          id: "rm-1",
          threadId: "rt-bills",
          authorKind: "agent",
          authorId: "finance-desk",
          body: "Send $40 today.",
          createdAt: "2026-10-12T15:00:00.000Z",
        },
      ],
    };
    const shown = presentRoundtableThread(thread, false);
    assert.equal(shown?.messages[0]?.authorLabel, "Finance Desk");
    assert.equal(shown?.messages[0]?.body, "Send $40 today.");
    assert.equal(presentRoundtableThread(thread, true), null);
    assert.equal(presentRoundtableThread({ ...thread, audience: "youtube" }, false), null);

    const floor = await import("@/components/roundtable-floor");
    const homeHtml = render(
      createElement(floor.RoundtableHomeCard, {
        card: { unavailable: false, count: 0, lines: [ROUNDTABLE_EMPTY] },
      }),
    );
    assert.match(homeHtml, /no messages yet/);
    assert.equal(homeHtml.includes("$"), false);
    assert.match(render(createElement(floor.RoundtableParent, { cards: [] })), /no messages yet/);
    const threadSource = readFileSync(path.join(root, "src/components/roundtable-thread.tsx"), "utf8");
    assert.match(threadSource, /ROUNDTABLE_EMPTY/);
    assert.match(threadSource, /message.body/);
    assert.equal(threadSource.includes("youtube"), false);
    assert.equal(threadSource.includes("audience"), false);
  });

  it("rejects an unknown agent, a blank message, and a secret", () => {
    const unknown = parseAgentPost({ agent: "carla", title: "Hi", body: "Hello." });
    assert.equal(unknown.ok, false);
    const blank = parseAgentPost({ agent: "finance-desk", title: "Hi", body: "   " });
    assert.equal(blank.ok, false);
    const missingTitle = parseAgentPost({ agent: "finance-desk", body: "Hello." });
    assert.equal(missingTitle.ok, false);
    const audience = parseAgentPost({
      agent: "finance-desk",
      title: "Hi",
      body: "Hello.",
      audience: "channel",
    });
    assert.equal(audience.ok, false);
    const secret = parseAgentPost({
      agent: "finance-desk",
      title: "Hi",
      body: "password: hunter2",
    });
    assert.equal(secret.ok, false);
    const open = parseAgentPost({ agent: "sophia", title: "Desk check", body: "The floor is quiet." });
    assert.equal(open.ok, true);
    if (open.ok) {
      assert.equal(open.post.audience, null);
      assert.equal(open.post.agentId, "sophia");
    }
  });

  it("wires owner pages, the home card, and a one-level phone trail", () => {
    const home = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
    assert.match(home, /RoundtableHomeCard/);
    assert.match(home, /loadRoundtableHome/);
    assert.match(home, /session\?\.role === "owner" \? <RoundtableHomeCard/);
    const publicHome = readFileSync(path.join(root, "src/components/public-home-page.tsx"), "utf8");
    assert.equal(publicHome.includes("Roundtable"), false);
    assert.equal(publicHome.includes("loadRoundtable"), false);

    const parent = readFileSync(path.join(root, "src/app/n/roundtable/page.tsx"), "utf8");
    assert.ok(parent.indexOf('await requireRole("owner")') < parent.indexOf("await loadRoundtableCards"));
    assert.ok(parent.indexOf("blockedPublicPage") < parent.indexOf("await loadRoundtableCards"));
    assert.match(parent, /href="\/"/);
    const child = readFileSync(path.join(root, "src/app/n/roundtable/[thread]/page.tsx"), "utf8");
    assert.ok(child.indexOf('await requireRole("owner")') < child.indexOf("await loadRoundtableThread"));
    assert.ok(child.indexOf("blockedPublicPage") < child.indexOf("await loadRoundtableThread"));
    assert.match(child, /Roundtable/);
    const reply = readFileSync(path.join(root, "src/components/roundtable-reply.tsx"), "utf8");
    assert.equal(reply.includes("youtube"), false);
    assert.equal(reply.includes("audience"), false);
  });
});

describe("roundtable store", { concurrency: false }, () => {
  const previous = envSnapshot();
  let token = "";
  const file = readFileSync(path.join(root, "db/migrations/026_roundtable.sql"), "utf8");

  before(async () => {
    process.env.DATABASE_URL = "postgres://resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$dummy";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-roundtable-tests";
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    setSqlClientForTests(await postgres());
    await migrate();
    token = await createSession("roundtable-test");
  });

  after(() => {
    setSqlClientForTests(null);
    restore(previous);
  });

  beforeEach(async () => {
    await sqlQuery(`DELETE FROM roundtable_messages`);
    await sqlQuery(`DELETE FROM roundtable_threads`);
  });

  function agent(body: unknown, headers: Record<string, string> = {}) {
    return agentPost(
      new Request("https://resonance3.vercel.app/api/roundtable", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function reply(id: string, body: unknown, headers: Record<string, string> = {}) {
    return replyPost(
      new Request(`https://resonance3.vercel.app/api/roundtable/${id}/reply`, {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          origin: "https://resonance3.vercel.app",
          "sec-fetch-site": "same-origin",
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${token}`,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );
  }

  it("applies migration 026 once and inserts nothing", async () => {
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "026_roundtable");
    assert.equal(embedded?.sql, file);
    assert.equal(/INSERT\s+INTO\s+roundtable_/i.test(file), false);
    await sqlQuery(
      `INSERT INTO roundtable_threads (id, agent_id, title, audience) VALUES ('rt-keep', 'finance-desk', 'Kept', 'founder')`,
    );
    await sqlQuery(`DELETE FROM schema_migrations WHERE id = '026_roundtable'`);
    const again = await applyMigrations([{ id: "026_roundtable", sql: file }]);
    assert.deepEqual(again.applied, ["026_roundtable"]);
    const rows = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM roundtable_threads`);
    assert.equal(rows[0]?.n, "1");
    await assert.rejects(() =>
      sqlQuery(
        `INSERT INTO roundtable_threads (id, agent_id, title, audience) VALUES ('rt-bad', 'finance-desk', 'Nope', 'public')`,
      ),
    );
  });

  it("lets an agent post, keeps a retry, and leaves youtube off the founder read", async () => {
    const signedOut = await listGet(new Request("https://resonance3.vercel.app/api/roundtable"));
    assert.equal(signedOut.status, 401);

    const cookieWrite = await agentPost(
      new Request("https://resonance3.vercel.app/api/roundtable", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify({ agent: "finance-desk", title: "Thursday bills", body: "Electric is due." }),
      }),
    );
    assert.equal(cookieWrite.status, 401);

    const created = await agent({
      agent: "finance-desk",
      title: "Thursday bills",
      body: "Electric is due.",
      id: "rm-bills",
      threadId: "rt-bills",
    });
    assert.equal(created.status, 201);
    const createdBody = (await created.json()) as {
      thread: { id: string; audience: string; agent_name: string };
      message: { author_label: string; body: string };
    };
    assert.equal(createdBody.thread.audience, "founder");
    assert.equal(createdBody.thread.agent_name, "Finance Desk");
    assert.equal(createdBody.message.author_label, "Finance Desk");

    const retry = await agent({
      agent: "finance-desk",
      title: "Thursday bills",
      body: "Electric is due.",
      id: "rm-bills",
      threadId: "rt-bills",
    });
    assert.equal(retry.status, 200);
    const counts = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM roundtable_messages`);
    assert.equal(counts[0]?.n, "1");

    const follow = await agent({
      agent: "architect",
      threadId: "rt-bills",
      body: "I can show that on the floor.",
      id: "rm-arch",
    });
    assert.equal(follow.status, 201);

    const youtube = await agent({
      agent: "youtube-studio",
      title: "Episode cut",
      body: "YT_SENTINEL open on the run. $12",
      audience: "youtube",
      threadId: "rt-yt",
      id: "rm-yt",
    });
    assert.equal(youtube.status, 201);
    const youtubeBody = (await youtube.json()) as { thread: { audience: string } };
    assert.equal(youtubeBody.thread.audience, "youtube");

    const list = await listGet(
      new Request("https://resonance3.vercel.app/api/roundtable", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(list.status, 200);
    const listBody = (await list.json()) as { threads: { id: string; title: string }[] };
    assert.deepEqual(
      listBody.threads.map((thread) => thread.id),
      ["rt-bills"],
    );
    const packed = JSON.stringify(listBody);
    assert.equal(packed.includes("YT_SENTINEL"), false);
    assert.equal(packed.includes("Electric is due."), false);

    const detail = await threadGet(
      new Request("https://resonance3.vercel.app/api/roundtable/rt-bills", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
      { params: Promise.resolve({ id: "rt-bills" }) },
    );
    assert.equal(detail.status, 200);
    const detailBody = (await detail.json()) as { thread: { messages: { body: string; author_label: string }[] } };
    assert.deepEqual(
      detailBody.thread.messages.map((message) => message.body),
      ["Electric is due.", "I can show that on the floor."],
    );
    assert.equal(detailBody.thread.messages[1]?.author_label, "Architect");

    const hidden = await threadGet(
      new Request("https://resonance3.vercel.app/api/roundtable/rt-yt", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
      { params: Promise.resolve({ id: "rt-yt" }) },
    );
    assert.equal(hidden.status, 404);
    assert.equal(JSON.stringify(await hidden.json()).includes("YT_SENTINEL"), false);

    const founder = await reply("rt-bills", { body: "Got it. Pay it Thursday." });
    assert.equal(founder.status, 201);
    const founderBody = (await founder.json()) as { message: { author_kind: string; author_label: string; author_id: string } };
    assert.equal(founderBody.message.author_kind, "founder");
    assert.equal(founderBody.message.author_label, "Founder");
    assert.equal(founderBody.message.author_id, "andres");

    const bearerReply = await reply("rt-bills", { body: "No." }, { authorization: `Bearer ${SECRET}` });
    assert.equal(bearerReply.status, 401);

    const youtubeReply = await reply("rt-yt", { body: "Ship it." });
    assert.equal(youtubeReply.status, 404);
    assert.equal(JSON.stringify(await youtubeReply.json()).includes("YT_SENTINEL"), false);

    const threads = await readFounderThreads();
    assert.equal(threads.length, 1);
    assert.equal(threads[0]?.messageCount, 3);
    const home = roundtableHomeModel(threads, { publicMode: false });
    assert.equal(home?.lines[0], "Thursday bills");
  });

  it("hides the thread in public mode and does not write a reply", async () => {
    const created = await agent({
      agent: "finance-desk",
      title: "Wire $40",
      body: "Send $40 today.",
      threadId: "rt-wire",
      id: "rm-wire",
    });
    assert.equal(created.status, 201);

    const shared = await listGet(
      new Request("https://resonance3.vercel.app/api/roundtable", {
        headers: { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` },
      }),
    );
    assert.equal(shared.status, 404);
    const sharedText = JSON.stringify(await shared.json());
    assert.equal(sharedText.includes("$"), false);
    assert.equal(sharedText.includes("Send"), false);
    assert.equal(sharedText.includes("Wire"), false);

    const detail = await threadGet(
      new Request("https://resonance3.vercel.app/api/roundtable/rt-wire", {
        headers: { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` },
      }),
      { params: Promise.resolve({ id: "rt-wire" }) },
    );
    assert.equal(detail.status, 404);
    assert.equal(JSON.stringify(await detail.json()).includes("$40"), false);

    const blocked = await reply(
      "rt-wire",
      { body: "Noted." },
      { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` },
    );
    assert.equal(blocked.status, 404);
    const messages = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM roundtable_messages`);
    assert.equal(messages[0]?.n, "1");
  });

  it("sends a signed-out roundtable page to login", async () => {
    const page = await proxy(new NextRequest("https://resonance3.vercel.app/n/roundtable"));
    assert.equal(page.status, 307);
    assert.match(page.headers.get("location") ?? "", /\/login\?next=%2Fn%2Froundtable$/);
    const child = await proxy(new NextRequest("https://resonance3.vercel.app/n/roundtable/rt-bills"));
    assert.match(child.headers.get("location") ?? "", /\/login\?next=%2Fn%2Froundtable%2Frt-bills$/);
  });
});
