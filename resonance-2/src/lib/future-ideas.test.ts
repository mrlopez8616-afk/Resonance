import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { GET, PATCH, POST } from "@/app/api/ideas/route";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import {
  FUTURE_IDEA_SEED,
  ideaSlug,
  parseIdeaPatch,
  parseIdeaWrite,
  presentIdeas,
  publicIdeaText,
  seedIdeas,
} from "@/lib/future-ideas";
import { readIdeas } from "@/lib/future-ideas-store";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations, migrate } from "@/lib/pg/migrate";
import { PUBLIC_MODE_COOKIE } from "@/lib/public-mode";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "ideas-sync-secret";

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

describe("future ideas copy", () => {
  it("seeds the founder's list and keeps the world off the queue", () => {
    const ids = FUTURE_IDEA_SEED.map((seed) => seed.id);
    assert.deepEqual(ids, [
      "driving-tracker",
      "resonance-shell",
      "per-node-dca",
      "resonance-world",
      "chart-time-range",
      "health-of-the-machine",
    ]);
    const world = FUTURE_IDEA_SEED.find((seed) => seed.id === "resonance-world");
    assert.equal(world?.status, "idea");
    assert.match(world?.note ?? "", /not queued to build/);
    assert.equal(FUTURE_IDEA_SEED.find((seed) => seed.id === "per-node-dca")?.status, "someday");
    assert.equal(FUTURE_IDEA_SEED.find((seed) => seed.id === "chart-time-range")?.status, "done");
    assert.equal(FUTURE_IDEA_SEED.find((seed) => seed.id === "health-of-the-machine")?.status, "done");
    assert.match(FUTURE_IDEA_SEED.find((seed) => seed.id === "chart-time-range")?.note ?? "", /#99/);
    assert.match(FUTURE_IDEA_SEED.find((seed) => seed.id === "health-of-the-machine")?.note ?? "", /#98/);
    assert.match(FUTURE_IDEA_SEED.find((seed) => seed.id === "resonance-shell")?.note ?? "", /Jake Claver/);
    assert.match(FUTURE_IDEA_SEED.find((seed) => seed.id === "resonance-shell")?.note ?? "", /Not financial advice/);

    const owner = presentIdeas(seedIdeas(), { publicMode: false });
    assert.equal(owner.find((card) => card.id === "per-node-dca")?.title.includes("$1/day"), true);
    const shared = presentIdeas(seedIdeas(), { publicMode: true });
    const packed = JSON.stringify(shared);
    assert.equal(packed.includes("$"), false);
    assert.equal(
      shared.find((card) => card.id === "per-node-dca")?.title,
      "one dollar a day per-node DCA once cash is steady",
    );
    assert.equal(shared.find((card) => card.id === "driving-tracker")?.addedLabel, "Oct 11, 2026");
    assert.equal(publicIdeaText("$40"), "");
    assert.equal(ideaSlug("$1/day per-node DCA"), "1-day-per-node-dca");
    assert.match(readFileSync(path.join(root, "src/components/build-floor.tsx"), "utf8"), /href="\/n\/ideas"/);
    assert.match(readFileSync(path.join(root, "src/app/n/ideas/page.tsx"), "utf8"), /href="\/n\/build"/);
  });

  it("rejects a secret, an empty title, and a status outside the board", () => {
    const secret = parseIdeaWrite({ title: "Later", note: "password: hunter2" }, "2026-10-12");
    assert.equal(secret.ok, false);
    const empty = parseIdeaWrite({ title: "  " }, "2026-10-12");
    assert.equal(empty.ok, false);
    const status = parseIdeaPatch({ id: "driving-tracker", status: "scripted" });
    assert.equal(status.ok, false);
    const archived = parseIdeaPatch({ id: "driving-tracker", archived: true });
    assert.equal(archived.ok, true);
    const named = parseIdeaWrite({ title: "Night drive", tags: "Node, night" }, "2026-10-12");
    assert.equal(named.ok, true);
    if (named.ok) assert.deepEqual(named.value.tags, ["node", "night"]);
  });
});

describe("future ideas store", { concurrency: false }, () => {
  const previous = envSnapshot();
  let token = "";
  const file = readFileSync(path.join(root, "db/migrations/025_future_ideas.sql"), "utf8");

  before(async () => {
    process.env.DATABASE_URL = "postgres://resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$dummy";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-ideas-tests";
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    setSqlClientForTests(await postgres());
    await migrate();
    token = await createSession("ideas-test");
  });

  after(() => {
    setSqlClientForTests(null);
    restore(previous);
  });

  beforeEach(async () => {
    await sqlQuery(`DELETE FROM future_ideas`);
    await sqlQuery(`DELETE FROM schema_migrations WHERE id = '025_future_ideas'`);
    const seeded = await applyMigrations([{ id: "025_future_ideas", sql: file }]);
    assert.deepEqual(seeded.applied, ["025_future_ideas"]);
  });

  function write(method: "POST" | "PATCH", body: unknown, headers: Record<string, string> = {}) {
    const handler = method === "POST" ? POST : PATCH;
    return handler(
      new Request("https://resonance3.vercel.app/api/ideas", {
        method,
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
    );
  }

  it("applies migration 025 once and leaves an edited row alone", async () => {
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "025_future_ideas");
    assert.equal(embedded?.sql, file);
    const ideas = await readIdeas();
    assert.equal(ideas.length, FUTURE_IDEA_SEED.length);
    for (const seed of FUTURE_IDEA_SEED) {
      const row = ideas.find((idea) => idea.id === seed.id);
      assert.equal(row?.title, seed.title);
      assert.equal(row?.note, seed.note);
      assert.equal(row?.status, seed.status);
      assert.deepEqual(row?.tags, [...seed.tags]);
      assert.equal(row?.addedOn, seed.addedOn);
      assert.equal(row?.archivedAt, null);
    }
    await sqlQuery(`UPDATE future_ideas SET title = 'Driving tracker, renamed' WHERE id = 'driving-tracker'`);
    await sqlQuery(`DELETE FROM schema_migrations WHERE id = '025_future_ideas'`);
    const again = await applyMigrations([{ id: "025_future_ideas", sql: file }]);
    assert.deepEqual(again.applied, ["025_future_ideas"]);
    const kept = await sqlQuery<{ title: string; n: string }>(
      `SELECT title, (SELECT count(*)::text FROM future_ideas) AS n FROM future_ideas WHERE id = 'driving-tracker'`,
    );
    assert.equal(kept[0]?.title, "Driving tracker, renamed");
    assert.equal(kept[0]?.n, "6");
    await assert.rejects(() =>
      sqlQuery(
        `INSERT INTO future_ideas (id, title, status, added_on) VALUES ('extra', 'Extra', 'draft', '2026-10-11')`,
      ),
    );
  });

  it("inserts four ideas when the title is absent and leaves a stored title alone", async () => {
    const seedsFile = readFileSync(path.join(root, "db/migrations/027_future_ideas_seeds.sql"), "utf8");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "027_future_ideas_seeds");
    assert.equal(embedded?.sql, seedsFile);
    assert.equal(/\d{4}-\d{2}-\d{2}/.test(seedsFile), false);

    await sqlQuery(
      `INSERT INTO future_ideas (id, title, note, status, tags, added_on)
       VALUES ('already-own-apps', 'Own apps', 'Kept note.', 'someday', '["kept"]'::jsonb, CURRENT_DATE)`,
    );
    await sqlQuery(`DELETE FROM schema_migrations WHERE id = '027_future_ideas_seeds'`);
    const seeded = await applyMigrations([{ id: "027_future_ideas_seeds", sql: seedsFile }]);
    assert.deepEqual(seeded.applied, ["027_future_ideas_seeds"]);

    const today = await sqlQuery<{ today: string }>(`SELECT CURRENT_DATE::text AS today`);
    const ideas = await readIdeas();
    const own = ideas.filter((idea) => idea.title === "Own apps");
    assert.equal(own.length, 1);
    assert.equal(own[0]?.id, "already-own-apps");
    assert.equal(own[0]?.note, "Kept note.");
    assert.equal(own[0]?.status, "someday");
    assert.equal(ideas.some((idea) => idea.id === "own-apps"), false);

    const added = [
      {
        id: "roundtable",
        title: "Roundtable",
        note: "Agents talk to the Founder, later to the YouTube channel.",
      },
      {
        id: "mastermind",
        title: "Mastermind",
        note: "A subscription makes buyers Resonance members in a mastermind with the Founder (meetings, events), framed as a mirror to follow, not financial advice.",
      },
      {
        id: "factory-floor-redesign",
        title: "Factory Floor redesign",
        note: "",
      },
    ];
    for (const seed of added) {
      const row = ideas.find((idea) => idea.id === seed.id);
      assert.equal(row?.title, seed.title);
      assert.equal(row?.note, seed.note);
      assert.equal(row?.status, "idea");
      assert.deepEqual(row?.tags, []);
      assert.equal(row?.archivedAt, null);
      assert.equal(row?.addedOn, today[0]?.today.slice(0, 10));
    }
    assert.equal(ideas.length, FUTURE_IDEA_SEED.length + added.length + 1);

    await sqlQuery(
      `UPDATE future_ideas SET title = 'Roundtable, renamed', note = 'Edited.' WHERE id = 'roundtable'`,
    );
    await sqlQuery(`DELETE FROM schema_migrations WHERE id = '027_future_ideas_seeds'`);
    const again = await applyMigrations([{ id: "027_future_ideas_seeds", sql: seedsFile }]);
    assert.deepEqual(again.applied, ["027_future_ideas_seeds"]);
    const after = await readIdeas();
    const renamed = after.filter((idea) => idea.id === "roundtable");
    assert.equal(renamed.length, 1);
    assert.equal(renamed[0]?.title, "Roundtable, renamed");
    assert.equal(renamed[0]?.note, "Edited.");
    assert.equal(after.some((idea) => idea.title === "Roundtable"), false);
    assert.equal(after.length, ideas.length);

    const third = await applyMigrations([{ id: "027_future_ideas_seeds", sql: seedsFile }]);
    assert.deepEqual(third.applied, []);
    assert.equal(third.skipped.includes("027_future_ideas_seeds"), true);
  });

  it("lets the owner add, edit, and archive, and keeps dollars off the public list", async () => {
    const signedOut = await POST(
      new Request("https://resonance3.vercel.app/api/ideas", {
        method: "POST",
        headers: { "content-type": "application/json", host: "resonance3.vercel.app" },
        body: JSON.stringify({ title: "Night drive" }),
      }),
    );
    assert.equal(signedOut.status, 401);

    const bearer = await write("POST", { title: "Night drive" }, { authorization: `Bearer ${SECRET}` });
    assert.equal(bearer.status, 401);

    const crossSite = await POST(
      new Request("https://resonance3.vercel.app/api/ideas", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          origin: "https://evil.example",
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify({ title: "Night drive" }),
      }),
    );
    assert.equal(crossSite.status, 403);

    const sharedWrite = await write(
      "POST",
      { title: "Night drive" },
      { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` },
    );
    assert.equal(sharedWrite.status, 404);

    const created = await write("POST", {
      title: "Night drive",
      note: "Miles and stops.",
      status: "queued",
      tags: ["node"],
      added_on: "2026-10-12",
    });
    assert.equal(created.status, 200);
    const createdBody = (await created.json()) as { idea: { id: string; status: string } };
    assert.equal(createdBody.idea.id, "night-drive");
    assert.equal(createdBody.idea.status, "queued");

    const edited = await write("PATCH", { id: "night-drive", title: "Night drive log", status: "someday" });
    assert.equal(edited.status, 200);
    const editedBody = (await edited.json()) as { idea: { title: string; status: string } };
    assert.equal(editedBody.idea.title, "Night drive log");
    assert.equal(editedBody.idea.status, "someday");

    const archived = await write("PATCH", { id: "night-drive", archived: true });
    assert.equal(archived.status, 200);
    const archivedBody = (await archived.json()) as { idea: { archived: boolean } };
    assert.equal(archivedBody.idea.archived, true);

    const ownerList = await GET(
      new Request("https://resonance3.vercel.app/api/ideas", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(ownerList.status, 200);
    const ownerJson = (await ownerList.json()) as { ideas: { id: string; title: string; archived: boolean }[] };
    assert.equal(ownerJson.ideas.some((idea) => idea.id === "per-node-dca" && idea.title.includes("$1/day")), true);
    assert.equal(ownerJson.ideas.some((idea) => idea.id === "night-drive" && idea.archived), true);

    const publicList = await GET(
      new Request("https://resonance3.vercel.app/api/ideas", {
        headers: { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` },
      }),
    );
    assert.equal(publicList.status, 200);
    const publicJson = (await publicList.json()) as { public: boolean; ideas: { id: string; title: string }[] };
    assert.equal(publicJson.public, true);
    const packed = JSON.stringify(publicJson);
    assert.equal(packed.includes("$"), false);
    assert.equal(publicJson.ideas.some((idea) => idea.id === "night-drive"), false);
    assert.equal(
      publicJson.ideas.find((idea) => idea.id === "per-node-dca")?.title,
      "one dollar a day per-node DCA once cash is steady",
    );

    const route = readFileSync(path.join(root, "src/app/api/ideas/route.ts"), "utf8");
    assert.doesNotMatch(route, /coinbase|robinhood|placeOrder|stripe/i);
  });
});
