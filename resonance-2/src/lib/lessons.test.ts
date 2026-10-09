import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { GET, PATCH, POST } from "@/app/api/lessons/route";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import {
  FOUNDERS_CALL,
  LESSON_CAPS,
  containsDollarAmount,
  isPublicLesson,
  lessonBuildHref,
  lessonLinksByBuildItem,
  lessonsHomeCard,
  lessonsPayload,
  visibleLessons,
  type Lesson,
} from "@/lib/lessons";
import { isPublicMode } from "@/lib/public-mode";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const t0 = Date.UTC(2026, 9, 9, 17, 0, 0);

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

function lessonBody(partial: Record<string, unknown> = {}) {
  return {
    id: "LL-001",
    date: "2026-10-09",
    title: "Drill down one level",
    category: "floor",
    what_changed: "Home shows parent cards.",
    why: FOUNDERS_CALL,
    lesson: "Keep the floor clean.",
    public_safe: true,
    sources: ["cabinet/operator-log.md"],
    build_item_id: "platform-build-tracker",
    pr_number: 77,
    ...partial,
  };
}

function fromJson(row: {
  id: string;
  date: string;
  title: string;
  category: string;
  what_changed: string;
  why: string;
  lesson: string;
  public_safe: boolean;
  sources?: string[];
  build_item_id: string | null;
  pr_number: number | null;
  created_at: string;
  updated_at: string;
}): Lesson {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    category: row.category,
    whatChanged: row.what_changed,
    why: row.why,
    lesson: row.lesson,
    publicSafe: row.public_safe,
    sources: row.sources ?? [],
    buildItemId: row.build_item_id,
    prNumber: row.pr_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

describe("lessons public filter", () => {
  const privateNote = fromJson({
    ...lessonBody({
      id: "LL-021",
      date: "2026-09-02",
      title: "A private working note",
      category: "working",
      what_changed: "Kept off the shared screen.",
      why: FOUNDERS_CALL,
      lesson: "Not every note is for the room.",
      public_safe: false,
      sources: ["owner notebook"],
      build_item_id: null,
      pr_number: null,
    }),
    created_at: "2026-09-02T17:00:00.000Z",
    updated_at: "2026-09-02T17:00:00.000Z",
  });
  const priced = fromJson({
    ...lessonBody({
      id: "LL-022",
      date: "2026-10-08",
      title: "A priced change",
      what_changed: "The sleeve moved by $1,240.",
      lesson: "Dollar amounts stay off the public floor.",
      public_safe: true,
      sources: ["fills"],
    }),
    created_at: "2026-10-08T17:00:00.000Z",
    updated_at: "2026-10-08T17:00:00.000Z",
  });
  const safe = fromJson({
    ...lessonBody({
      id: "LL-023",
      date: "2026-10-09",
      title: "Newest public lesson",
      lesson: "Show the lesson first.",
      public_safe: true,
      sources: ["spec"],
      build_item_id: "platform-build-tracker",
    }),
    created_at: "2026-10-09T17:00:00.000Z",
    updated_at: "2026-10-09T17:00:00.000Z",
  });
  const older = fromJson({
    ...lessonBody({
      id: "LL-020",
      date: "2026-09-18",
      title: "Older public lesson",
      category: "build",
      lesson: "Group by month.",
      public_safe: true,
      sources: [],
      build_item_id: "platform-pwa",
      pr_number: 76,
    }),
    created_at: "2026-09-18T17:00:00.000Z",
    updated_at: "2026-09-18T17:00:00.000Z",
  });

  it("hides private rows, dollar amounts, and sources when public mode is on", () => {
    assert.equal(isPublicMode(), false);
    assert.equal(containsDollarAmount("Founder's call."), false);
    assert.equal(containsDollarAmount("$argon2id$v=19"), false);
    assert.equal(containsDollarAmount("moved by $1,240"), true);
    assert.equal(isPublicLesson(privateNote), false);
    assert.equal(isPublicLesson(priced), false);
    assert.equal(isPublicLesson(safe), true);

    const rows = [older, privateNote, priced, safe];
    const payload = lessonsPayload(rows, true);
    assert.equal(payload.public, true);
    assert.deepEqual(
      payload.lessons.map((lesson) => lesson.id),
      ["LL-023", "LL-020"],
    );
    assert.equal(payload.lessons.some((lesson) => lesson.id === "LL-021"), false);
    const encoded = JSON.stringify(payload);
    assert.equal(encoded.includes("sources"), false);
    assert.equal(encoded.includes("owner notebook"), false);
    assert.equal(encoded.includes("$"), false);
    assert.equal(payload.lessons[0]?.why, FOUNDERS_CALL);

    const home = lessonsHomeCard(visibleLessons(rows, true));
    assert.equal(home.count, 2);
    assert.equal(home.latestTitle, "Newest public lesson");

    const links = lessonLinksByBuildItem(visibleLessons(rows, true));
    assert.equal(links["platform-build-tracker"], "/n/lessons#LL-023");
    assert.equal(links["platform-pwa"], "/n/lessons#LL-020");
    assert.equal(links["platform-build-tracker"]?.includes("LL-021"), false);

    const owner = lessonsPayload(rows, false);
    assert.equal(owner.public, false);
    assert.equal(owner.count, 4);
    const hidden = owner.lessons.find((lesson) => lesson.id === "LL-021");
    assert.ok(hidden);
    assert.deepEqual(hidden.sources, ["owner notebook"]);
    assert.equal(hidden.why, FOUNDERS_CALL);
  });

  it("wires the home card and the build-item lesson link", () => {
    const home = readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
    assert.match(home, /LessonsHomeCard/);
    assert.match(home, /loadLessonsHome/);
    const floor = readFileSync(path.join(root, "src/components/build-floor.tsx"), "utf8");
    assert.match(floor, /lessonHrefs\[item\.id\]/);
    assert.match(floor, />Lesson</);
    const sectionPage = readFileSync(path.join(root, "src/app/n/build/[section]/page.tsx"), "utf8");
    assert.match(sectionPage, /loadLessonLinks/);
    assert.match(sectionPage, /\/n\/build/);
    assert.equal(lessonBuildHref(null, "platform"), null);
    assert.equal(lessonBuildHref("platform-pwa", null), "/n/build");
    assert.equal(lessonBuildHref("platform-pwa", "platform"), "/n/build/platform#platform-pwa");
    const lessonsPage = readFileSync(path.join(root, "src/app/n/lessons/page.tsx"), "utf8");
    assert.match(lessonsPage, /OperatorShell/);
    assert.match(lessonsPage, /className="calendar-back"/);
    const migration = readFileSync(path.join(root, "db/migrations/018_lessons.sql"), "utf8");
    assert.equal(/INSERT\s+INTO\s+lessons/i.test(migration), false);
    assert.match(migration, /018/);
    assert.doesNotMatch(migration, /017_/);
    assert.doesNotMatch(migration, /019_/);
  });
});

describe("lessons api", { concurrency: false }, () => {
  const previous = envSnapshot();
  let token = "";
  const url = "https://resonance3.vercel.app/api/lessons";

  after(() => {
    restore(previous);
    setSqlClientForTests(null);
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "hash";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    setSqlClientForTests(memorySql());
    await migrate();
    token = await createSession("Mozilla/5.0 Chrome/120.0.0.0", t0);
  });

  async function countLessons(): Promise<number> {
    const rows = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM lessons`);
    return Number(rows[0]?.n);
  }

  it("starts empty and rejects a session write and an anonymous call", async () => {
    assert.equal(await countLessons(), 0);
    const anonymous = await GET(new Request(url));
    assert.equal(anonymous.status, 401);

    const sessionRead = await GET(new Request(url, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }));
    assert.equal(sessionRead.status, 200);
    const sessionBody = await sessionRead.json();
    assert.equal(sessionBody.ok, true);
    assert.equal(sessionBody.public, false);
    assert.equal(sessionBody.count, 0);

    const bearerRead = await GET(new Request(url, { headers: { authorization: "Bearer hub-secret" } }));
    assert.equal(bearerRead.status, 200);

    const sessionWrite = await POST(
      new Request(url, {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" },
        body: JSON.stringify(lessonBody()),
      }),
    );
    assert.equal(sessionWrite.status, 401);

    const missing = await POST(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lessonBody()),
      }),
    );
    assert.equal(missing.status, 401);

    const sessionPatch = await PATCH(
      new Request(url, {
        method: "PATCH",
        headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ id: "LL-001", lesson: "nope" }),
      }),
    );
    assert.equal(sessionPatch.status, 401);
    assert.equal(await countLessons(), 0);
  });

  it("upserts one row, stores an unknown category, and keeps Founder's call", async () => {
    const longCategory = "desk-habit-not-on-a-list";
    assert.ok(longCategory.length < LESSON_CAPS.category);
    const created = await POST(
      new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify(
          lessonBody({
            category: `${longCategory}${"x".repeat(80)}`,
            why: "   ",
            sources: ["  cabinet/operator-log.md  ", ""],
          }),
        ),
      }),
    );
    assert.equal(created.status, 200);
    const createdBody = await created.json();
    assert.equal(createdBody.lesson.why, FOUNDERS_CALL);
    assert.equal(createdBody.lesson.category, longCategory + "x".repeat(LESSON_CAPS.category - longCategory.length));
    assert.equal(createdBody.lesson.category.length, LESSON_CAPS.category);
    assert.deepEqual(createdBody.lesson.sources, ["cabinet/operator-log.md"]);
    assert.equal(createdBody.lesson.build_item_id, "platform-build-tracker");

    const unknownItem = await POST(
      new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify(lessonBody({ id: "LL-009", build_item_id: "missing-item" })),
      }),
    );
    assert.equal(unknownItem.status, 400);
    assert.equal(await countLessons(), 1);
  });

  it("bulk upserts in place and links a build item", async () => {
    const first = [
      lessonBody({
        id: "LL-021",
        date: "2026-09-02",
        title: "A private working note",
        public_safe: false,
        sources: ["owner notebook"],
        build_item_id: null,
        pr_number: null,
        lesson: "Not every note is for the room.",
      }),
      lessonBody({
        id: "LL-030",
        date: "2026-10-01",
        title: "First title",
        category: "build",
        public_safe: true,
        sources: ["seed"],
        build_item_id: "platform-pwa",
        pr_number: 76,
      }),
    ];
    const posted = await POST(
      new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify(first),
      }),
    );
    assert.equal(posted.status, 200);
    const postedBody = await posted.json();
    assert.equal(postedBody.upserted, 2);
    const createdAt = postedBody.lessons.find((row: { id: string }) => row.id === "LL-030").created_at;

    const again = await POST(
      new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify({
          lessons: [
            first[0],
            lessonBody({
              id: "LL-030",
              date: "2026-10-01",
              title: "Updated title",
              category: "build",
              public_safe: true,
              sources: ["seed"],
              build_item_id: "platform-pwa",
              pr_number: 76,
            }),
          ],
        }),
      }),
    );
    assert.equal(again.status, 200);
    assert.equal(await countLessons(), 2);
    const againBody = await again.json();
    const updated = againBody.lessons.find((row: { id: string }) => row.id === "LL-030");
    assert.equal(updated.title, "Updated title");
    assert.equal(updated.created_at, createdAt);

    const patched = await PATCH(
      new Request(url, {
        method: "PATCH",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify({ id: "LL-030", lesson: "Link the build item." }),
      }),
    );
    assert.equal(patched.status, 200);
    const patchedBody = await patched.json();
    assert.equal(patchedBody.lesson.lesson, "Link the build item.");
    assert.equal(patchedBody.lesson.title, "Updated title");
    assert.equal(patchedBody.lesson.why, FOUNDERS_CALL);

    const read = await GET(new Request(url, { headers: { authorization: "Bearer hub-secret" } }));
    const readBody = await read.json();
    assert.deepEqual(
      readBody.lessons.map((row: { id: string }) => row.id),
      ["LL-030", "LL-021"],
    );
    const hidden = readBody.lessons.find((row: { id: string }) => row.id === "LL-021");
    assert.equal(hidden.public_safe, false);
    assert.deepEqual(hidden.sources, ["owner notebook"]);
    const lessons = readBody.lessons.map(fromJson);
    const home = lessonsHomeCard(lessons);
    assert.equal(home.count, 2);
    assert.equal(home.latestTitle, "Updated title");
    assert.equal(lessonLinksByBuildItem(lessons)["platform-pwa"], "/n/lessons#LL-030");
    assert.equal(Object.hasOwn(lessonLinksByBuildItem(visibleLessons(lessons, true)), "platform-pwa"), true);
    assert.equal(visibleLessons(lessons, true).some((lesson) => lesson.id === "LL-021"), false);

    const missing = await PATCH(
      new Request(url, {
        method: "PATCH",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify({ id: "LL-099", title: "Nope" }),
      }),
    );
    assert.equal(missing.status, 404);
  });

  it("upserts the cabinet seed, including the past-tense dedupe lesson", async () => {
    const seed = JSON.parse(readFileSync(path.join(root, "cabinet/lessons-seed.json"), "utf8")) as Array<{
      id: string;
      what_changed: string;
      why: string;
      lesson: string;
      title: string;
      public_safe: boolean;
      sources: string[];
    }>;
    assert.equal(seed.length, 47);
    assert.deepEqual(
      seed.map((row) => row.id),
      Array.from({ length: 47 }, (_, index) => `LL-${String(index + 1).padStart(3, "0")}`),
    );
    const dedupe = seed.find((row) => row.id === "LL-042");
    assert.ok(dedupe);
    assert.equal(
      dedupe.what_changed,
      "The fills save routine now matches fills by order id across every key format, so it can't insert a second row for an existing order (#78). The first cleanup (015) missed the duplicates because they were stored under a different key format. A guarded follow-up (019, #80) backed up and removed the two stale copies, verified on prod (53 rows).",
    );
    assert.equal(
      dedupe.why,
      "The re-tag migrations changed the venue on two legacy rows but left their stored source as 'seed'. The save routine keyed on source plus order id, so the next full save inserted duplicates. The totals stayed right, but the lots tables read off. Sleeve totals were never affected.",
    );
    assert.equal(dedupe.public_safe, true);
    assert.equal(seed.filter((row) => row.public_safe === false).map((row) => row.id).join(","), "LL-021");
    for (const row of seed) {
      const blob = [row.title, row.what_changed, row.why, row.lesson, ...row.sources].join("\n");
      assert.equal(containsDollarAmount(blob), false, row.id);
    }

    const posted = await POST(
      new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify(seed),
      }),
    );
    assert.equal(posted.status, 200);
    const postedBody = await posted.json();
    assert.equal(postedBody.upserted, 47);
    assert.equal(await countLessons(), 47);
    const stored = postedBody.lessons.find((row: { id: string }) => row.id === "LL-042");
    assert.equal(stored.what_changed, dedupe.what_changed);
    assert.equal(stored.why, dedupe.why);
    assert.deepEqual(stored.sources, ["hub chat with Andres, Oct 9"]);
    const createdAt = stored.created_at;

    const again = await POST(
      new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify({ lessons: seed }),
      }),
    );
    assert.equal(again.status, 200);
    assert.equal(await countLessons(), 47);
    const againBody = await again.json();
    assert.equal(againBody.lessons.find((row: { id: string }) => row.id === "LL-042").created_at, createdAt);

    const read = await GET(new Request(url, { headers: { authorization: "Bearer hub-secret" } }));
    const readBody = await read.json();
    assert.equal(readBody.public, false);
    assert.equal(readBody.count, 47);
    assert.equal(readBody.lessons[0].id, "LL-047");
    const privateRow = readBody.lessons.find((row: { id: string }) => row.id === "LL-021");
    assert.equal(privateRow.public_safe, false);
    assert.ok(privateRow.sources.length > 0);
    assert.equal(privateRow.why, FOUNDERS_CALL);

    const lessons = readBody.lessons.map(fromJson);
    const publicView = lessonsPayload(lessons, true);
    assert.equal(publicView.public, true);
    assert.equal(publicView.count, 46);
    assert.equal(publicView.lessons.some((row) => row.id === "LL-021"), false);
    assert.equal(publicView.lessons.some((row) => "sources" in row), false);
    const publicDedupe = publicView.lessons.find((row) => row.id === "LL-042");
    assert.ok(publicDedupe);
    assert.equal(publicDedupe.what_changed, dedupe.what_changed);
    assert.equal(publicDedupe.why, dedupe.why);
  });
});
