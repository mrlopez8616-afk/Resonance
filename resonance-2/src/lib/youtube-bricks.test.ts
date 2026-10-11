import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { GET, PATCH, POST } from "@/app/api/youtube/bricks/route";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import type { Lesson } from "@/lib/lessons";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations, migrate } from "@/lib/pg/migrate";
import { PUBLIC_MODE_COOKIE } from "@/lib/public-mode";
import { proxy } from "@/proxy";
import {
  NO_LESSON,
  brickParentCard,
  linkedLesson,
  parseBrickPatch,
  parseBrickPost,
  presentBricks,
  type BrickItem,
  type BrickOverlay,
} from "@/lib/youtube-bricks";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "brick-sync-secret";
const VIDEO = "https://www.youtube.com/watch?v=abcdefghijk";

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

function lesson(partial: Partial<Lesson> & Pick<Lesson, "id" | "lesson" | "publicSafe">): Lesson {
  return {
    date: "2026-10-01",
    title: "Same words as a build item",
    category: "build",
    whatChanged: "Changed the floor.",
    why: "Founder's call.",
    sources: ["SOURCE_SENTINEL_sk_live_abc123456789"],
    buildItemId: null,
    prNumber: 76,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

function item(partial: Partial<BrickItem> & Pick<BrickItem, "id" | "title">): BrickItem {
  return { node: "platform", prNumber: 76, sortOrder: 1, ...partial };
}

const items: BrickItem[] = [
  item({ id: "platform-pwa", title: "Installable iPhone app (PWA)" }),
  item({ id: "fitness-runs", title: "Runs tracking (Nike Run Club)", node: "fitness", prNumber: 69, sortOrder: 2 }),
];

describe("brick tracker rules", () => {
  it("links only by build_item_id and keeps the public summary free of private text and dollars", () => {
    const lessons = [
      lesson({
        id: "LL-901",
        lesson: "SAME_TITLE_NOT_A_LINK",
        title: "Installable iPhone app (PWA)",
        publicSafe: false,
      }),
      lesson({
        id: "LL-902",
        date: "2026-10-02",
        lesson: "PRIVATE LESSON BODY",
        publicSafe: false,
        buildItemId: "platform-pwa",
      }),
      lesson({
        id: "LL-903",
        date: "2026-09-01",
        lesson: "Older public takeaway.",
        publicSafe: true,
        buildItemId: "platform-pwa",
        prNumber: null,
      }),
      lesson({
        id: "LL-904",
        lesson: "Moved by $40.",
        publicSafe: true,
        buildItemId: "fitness-runs",
      }),
    ];
    assert.equal(linkedLesson("platform-pwa", lessons, false)?.id, "LL-902");
    assert.equal(linkedLesson("platform-pwa", lessons, true)?.id, "LL-903");
    assert.equal(linkedLesson("missing", lessons, false), null);
    assert.equal(
      linkedLesson("fitness-runs", [lessons[0]!], false),
      null,
      "same title and pull request do not link",
    );

    const overlays: BrickOverlay[] = [
      { brickId: "platform-pwa", status: "scripted", videoUrl: VIDEO, note: "Budget $12 for props" },
    ];
    const owner = presentBricks({ items, lessons, overlays }, false);
    const shared = presentBricks({ items, lessons, overlays }, true);
    const ownerPwa = owner.find((row) => row.id === "platform-pwa");
    const sharedPwa = shared.find((row) => row.id === "platform-pwa");
    assert.equal(ownerPwa?.summary, "PRIVATE LESSON BODY");
    assert.equal(ownerPwa?.lessonId, "LL-902");
    assert.equal(ownerPwa?.note, "Budget $12 for props");
    assert.equal(ownerPwa?.prNumber, 76);
    assert.equal(sharedPwa?.summary, "Older public takeaway.");
    assert.equal(sharedPwa?.lessonId, "LL-903");
    assert.equal(sharedPwa?.note, "Budget for props");
    assert.equal(sharedPwa?.prHref, null);
    assert.equal(sharedPwa?.prNumber, null);
    const sharedRuns = shared.find((row) => row.id === "fitness-runs");
    assert.equal(sharedRuns?.summary, "Runs tracking (Nike Run Club)");
    assert.equal(sharedRuns?.lessonLabel, NO_LESSON);
    assert.equal(sharedRuns?.status, "idea");
    const packed = JSON.stringify(shared);
    assert.equal(packed.includes("PRIVATE LESSON BODY"), false);
    assert.equal(packed.includes("LL-902"), false);
    assert.equal(packed.includes("$40"), false);
    assert.equal(packed.includes("$12"), false);
    assert.equal(packed.includes("SOURCE_SENTINEL"), false);
    assert.equal(packed.includes("SAME_TITLE_NOT_A_LINK"), false);
    assert.equal(ownerPwa?.title, "Installable iPhone app (PWA)");
    assert.equal(JSON.stringify(overlays).includes("Installable"), false);

    assert.equal(brickParentCard({ total: 0, idea: 0, scripted: 0, filmed: 0, posted: 0 }).figure, "No bricks");
    assert.deepEqual(
      brickParentCard({ total: 4, idea: 1, scripted: 1, filmed: 1, posted: 1 }).lines,
      ["1 posted", "1 filmed", "1 scripted"],
    );
    const secret = parseBrickPost({ brick_id: "platform-pwa", status: "idea", note: "password: hunter2" });
    assert.equal(secret.ok, false);
    const titled = parseBrickPost({ brick_id: "platform-pwa", status: "idea", title: "Copied title" });
    assert.equal(titled.ok, false);
    const http = parseBrickPatch({ brick_id: "platform-pwa", video_url: "http://example.com/a" });
    assert.equal(http.ok, false);
    const page = readFileSync(path.join(root, "src/app/n/youtube/bricks/page.tsx"), "utf8");
    const detail = readFileSync(path.join(root, "src/app/n/youtube/bricks/[id]/page.tsx"), "utf8");
    assert.ok(page.indexOf('await requireRole("owner")') < page.indexOf("await loadBrickRows"));
    assert.ok(detail.indexOf('await requireRole("owner")') < detail.indexOf("await loadBrick"));
  });
});

describe("brick tracker store", { concurrency: false }, () => {
  const previous = envSnapshot();
  let token = "";

  before(async () => {
    process.env.DATABASE_URL = "postgres://resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$dummy";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-brick-tests";
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    setSqlClientForTests(await postgres());
    await migrate();
    token = await createSession("brick-test");
  });

  after(() => {
    setSqlClientForTests(null);
    restore(previous);
  });

  beforeEach(async () => {
    await sqlQuery(`DELETE FROM youtube_brick_episodes`);
    await sqlQuery(`DELETE FROM lessons`);
  });

  function write(method: "POST" | "PATCH", body: unknown, headers: Record<string, string> = {}) {
    const handler = method === "POST" ? POST : PATCH;
    return handler(
      new Request("https://resonance3.vercel.app/api/youtube/bricks", {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${SECRET}`,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  }

  function read(headers: Record<string, string> = {}) {
    return GET(
      new Request("https://resonance3.vercel.app/api/youtube/bricks", {
        headers: { cookie: `${SESSION_COOKIE}=${token}`, ...headers },
      }),
    );
  }

  async function seedLesson(row: {
    id: string;
    date: string;
    title: string;
    lesson: string;
    publicSafe: boolean;
    buildItemId: string | null;
    prNumber: number | null;
    sources?: string[];
  }) {
    await sqlQuery(
      `INSERT INTO lessons (
         id, date, title, category, what_changed, why, lesson, public_safe, sources, build_item_id, pr_number
       ) VALUES ($1, $2, $3, 'build', 'Changed the floor.', 'Founder''s call.', $4, $5, $6::jsonb, $7, $8)`,
      [
        row.id,
        row.date,
        row.title,
        row.lesson,
        row.publicSafe,
        JSON.stringify(row.sources ?? ["SOURCE_SENTINEL_sk_live_abc123456789"]),
        row.buildItemId,
        row.prNumber,
      ],
    );
  }

  it("applies migration 024 once and does not copy titles", async () => {
    const file = readFileSync(path.join(root, "db/migrations/024_youtube_bricks.sql"), "utf8");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "024_youtube_bricks");
    assert.equal(embedded?.sql, file);
    assert.equal(/^\s*INSERT\b/m.test(file), false);
    assert.match(file, /CREATE TABLE IF NOT EXISTS/);
    const columns = await sqlQuery<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'youtube_brick_episodes' ORDER BY ordinal_position`,
    );
    assert.deepEqual(
      columns.map((column) => column.column_name),
      ["brick_id", "status", "video_url", "note", "updated_at"],
    );
    const skipped = await migrate();
    assert.equal(skipped.applied.includes("024_youtube_bricks"), false);
    assert.equal(skipped.skipped.includes("024_youtube_bricks"), true);

    await sqlQuery(
      `INSERT INTO youtube_brick_episodes (brick_id, status, note) VALUES ('platform-pwa', 'posted', 'keep me')`,
    );
    const beforeItems = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM build_items`);
    await sqlQuery(`DELETE FROM schema_migrations WHERE id = '024_youtube_bricks'`);
    const rerun = await applyMigrations([{ id: "024_youtube_bricks", sql: file }]);
    assert.deepEqual(rerun.applied, ["024_youtube_bricks"]);
    const kept = await sqlQuery<{ status: string; note: string }>(
      `SELECT status, note FROM youtube_brick_episodes`,
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.status, "posted");
    assert.equal(kept[0]?.note, "keep me");
    const afterItems = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM build_items`);
    assert.equal(afterItems[0]?.n, beforeItems[0]?.n);
    await assert.rejects(() =>
      sqlQuery(`INSERT INTO youtube_brick_episodes (brick_id, status) VALUES ('platform-pwa', 'draft')`),
    );
  });

  it("requires a bearer to write and an owner session to read", async () => {
    const noBearer = await POST(
      new Request("https://resonance3.vercel.app/api/youtube/bricks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brick_id: "platform-pwa", status: "idea" }),
      }),
    );
    assert.equal(noBearer.status, 401);
    const sessionWrite = await write("POST", { brick_id: "platform-pwa", status: "scripted" }, {
      authorization: "",
      cookie: `${SESSION_COOKIE}=${token}`,
    });
    assert.equal(sessionWrite.status, 401);
    const bearerRead = await GET(
      new Request("https://resonance3.vercel.app/api/youtube/bricks", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    assert.equal(bearerRead.status, 401);
    const closed = await GET(new Request("https://resonance3.vercel.app/api/youtube/bricks"));
    assert.equal(closed.status, 401);
    const rows = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM youtube_brick_episodes`);
    assert.equal(rows[0]?.n, "0");

    const list = await proxy(new NextRequest("https://resonance3.vercel.app/n/youtube/bricks"));
    assert.equal(list.status, 307);
    assert.match(list.headers.get("location") ?? "", /\/login\?next=%2Fn%2Fyoutube%2Fbricks$/);
    const detail = await proxy(new NextRequest("https://resonance3.vercel.app/n/youtube/bricks/platform-pwa"));
    assert.equal(detail.status, 307);
    assert.match(detail.headers.get("location") ?? "", /\/login\?next=%2Fn%2Fyoutube%2Fbricks%2Fplatform-pwa$/);
    const api = await proxy(new NextRequest("https://resonance3.vercel.app/api/youtube/bricks"));
    assert.equal(api.status, 401);
  });

  it("upserts status without copying the build title or a fuzzy lesson", async () => {
    await seedLesson({
      id: "LL-901",
      date: "2026-10-01",
      title: "Installable iPhone app (PWA)",
      lesson: "SAME_TITLE_NOT_A_LINK",
      publicSafe: false,
      buildItemId: null,
      prNumber: 76,
    });
    await seedLesson({
      id: "LL-902",
      date: "2026-10-02",
      title: "Private note",
      lesson: "PRIVATE LESSON BODY",
      publicSafe: false,
      buildItemId: "platform-pwa",
      prNumber: null,
    });
    await seedLesson({
      id: "LL-903",
      date: "2026-09-01",
      title: "Public note",
      lesson: "Older public takeaway.",
      publicSafe: true,
      buildItemId: "platform-pwa",
      prNumber: null,
      sources: [],
    });
    await seedLesson({
      id: "LL-904",
      date: "2026-10-03",
      title: "Dollar note",
      lesson: "Moved by $40.",
      publicSafe: true,
      buildItemId: "fitness-runs",
      prNumber: null,
    });

    const missing = await write("POST", { brick_id: "not-a-build-item", status: "idea" });
    assert.equal(missing.status, 404);
    const bad = await write("POST", { brick_id: "platform-pwa", status: "draft" });
    assert.equal(bad.status, 400);

    const created = await write("POST", {
      brick_id: "platform-pwa",
      status: "scripted",
      video_url: VIDEO,
      note: "Budget $12 for props",
    });
    assert.equal(created.status, 200);
    const createdBody = await created.json();
    assert.equal(createdBody.episode.status, "scripted");
    assert.equal(createdBody.episode.video_url, VIDEO);
    assert.equal(Object.hasOwn(createdBody.episode, "title"), false);
    assert.equal(JSON.stringify(createdBody).includes("Installable"), false);

    const again = await write("POST", { brick_id: "platform-pwa", status: "filmed" });
    assert.equal(again.status, 200);
    const againBody = await again.json();
    assert.equal(againBody.episode.status, "filmed");
    assert.equal(againBody.episode.video_url, VIDEO);
    assert.equal(againBody.episode.note, "Budget $12 for props");
    const count = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM youtube_brick_episodes`);
    assert.equal(count[0]?.n, "1");

    const patched = await write("PATCH", { brick_id: "fitness-runs", note: "Shot list only." });
    assert.equal(patched.status, 200);
    const patchedBody = await patched.json();
    assert.equal(patchedBody.episode.status, "idea");
    assert.equal(patchedBody.episode.note, "Shot list only.");

    const cleared = await write("PATCH", { brick_id: "platform-pwa", video_url: null });
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).episode.video_url, null);

    await sqlQuery(`UPDATE build_items SET title = 'Renamed from build_items' WHERE id = 'platform-pwa'`);
    try {
      const owner = await read();
      assert.equal(owner.status, 200);
      const ownerBody = await owner.json();
      const pwa = ownerBody.bricks.find((row: { id: string }) => row.id === "platform-pwa");
      assert.equal(pwa.title, "Renamed from build_items");
      assert.equal(pwa.summary, "PRIVATE LESSON BODY");
      assert.equal(pwa.lesson_id, "LL-902");
      assert.equal(pwa.status, "filmed");
      assert.equal(pwa.note, "Budget $12 for props");
      assert.equal(JSON.stringify(ownerBody).includes("SAME_TITLE_NOT_A_LINK"), false);
      assert.equal(JSON.stringify(ownerBody).includes("SOURCE_SENTINEL"), false);

      const shared = await read({
        cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1`,
      });
      assert.equal(shared.status, 200);
      const sharedBody = await shared.json();
      assert.equal(sharedBody.public, true);
      const sharedPwa = sharedBody.bricks.find((row: { id: string }) => row.id === "platform-pwa");
      const sharedRuns = sharedBody.bricks.find((row: { id: string }) => row.id === "fitness-runs");
      assert.equal(sharedPwa.title, "Renamed from build_items");
      assert.equal(sharedPwa.summary, "Older public takeaway.");
      assert.equal(sharedPwa.lesson_id, "LL-903");
      assert.equal(sharedPwa.lesson_label, "LL-903");
      assert.equal(sharedPwa.note, "Budget for props");
      assert.equal(sharedPwa.pr_number, null);
      assert.equal(sharedRuns.summary, "Runs tracking (Nike Run Club)");
      assert.equal(sharedRuns.lesson_label, NO_LESSON);
      const packed = JSON.stringify(sharedBody);
      assert.equal(packed.includes("PRIVATE LESSON BODY"), false);
      assert.equal(packed.includes("LL-902"), false);
      assert.equal(packed.includes("$40"), false);
      assert.equal(packed.includes("$12"), false);
      assert.equal(packed.includes("SOURCE_SENTINEL"), false);
      assert.equal(packed.includes("$"), false);
    } finally {
      await sqlQuery(
        `UPDATE build_items SET title = 'Installable iPhone app (PWA)' WHERE id = 'platform-pwa'`,
      );
    }
  });
});
