import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/cron/backup/route";
import {
  BACKUP_CRON_SCHEDULE,
  backupDetailLines,
  backupFace,
  backupGithubTarget,
  backupPathsToPrune,
  exportTables,
  isSecretKey,
  readLiveBlobs,
  redactValue,
  runBackup,
  siteConfigSnapshot,
  type BackupSql,
} from "@/lib/backup";
import { createGithubBackupStore } from "@/lib/backup-github";
import { setBackupRunnerForTests } from "@/lib/backup-run";
import { BACKUP_RUNS_SQL, EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { proxy } from "@/proxy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOKEN = "super-secret-backup-token";
const CRON = "cron-secret-value";
const SYNC = "hub-secret";

function day(n: number): string {
  return new Date(Date.UTC(2026, 0, n)).toISOString().slice(0, 10);
}

function memorySql(tables: { name: string; rows: Record<string, unknown>[] }[]) {
  const queries: string[] = [];
  const inserts: unknown[][] = [];
  const client: BackupSql = {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      queries.push(text);
      if (text.includes("information_schema.tables")) {
        return tables.map((table) => ({ table_name: table.name })) as unknown as T[];
      }
      const select = /SELECT \* FROM "([a-z_][a-z0-9_]*)"/.exec(text);
      if (select) {
        return (tables.find((table) => table.name === select[1])?.rows ?? []) as unknown as T[];
      }
      if (text.startsWith("INSERT INTO backup_runs")) {
        inserts.push([...params]);
        return [] as unknown as T[];
      }
      throw new Error(`unexpected sql: ${text}`);
    },
  };
  return { client, queries, inserts };
}

describe("backup snapshots", () => {
  it("redacts secret-looking keys and values and keeps finance ciphertext", () => {
    assert.equal(isSecretKey("password_hash"), true);
    assert.equal(isSecretKey("totp_secret"), true);
    assert.equal(isSecretKey("pin_hash"), true);
    assert.equal(isSecretKey("id_hash"), true);
    assert.equal(isSecretKey("stake"), false);
    assert.equal(isSecretKey("payload_enc"), false);
    assert.equal(isSecretKey("tag"), false);
    assert.equal(isSecretKey("status"), false);
    const row = redactValue({
      username: "andres",
      password_hash: "$argon2id$v=19$m=1",
      totp_secret: "JBSWY3DPEHPK3PXP",
      stake: "12.00",
      payload_enc: "ciphertext",
      iv: "aabb",
      tag: "ccdd",
      note: "ghp_supersecretvalue123",
      nested: { api_token: "abcd", label: "desk" },
    }) as Record<string, unknown>;
    assert.equal(row.password_hash, "[redacted]");
    assert.equal(row.totp_secret, "[redacted]");
    assert.equal(row.stake, "12.00");
    assert.equal(row.payload_enc, "ciphertext");
    assert.equal(row.iv, "aabb");
    assert.equal(row.tag, "ccdd");
    assert.equal(row.note, "[redacted]");
    assert.equal((row.nested as { api_token: string }).api_token, "[redacted]");
    assert.equal((row.nested as { label: string }).label, "desk");
  });

  it("prunes only dated snapshot files and keeps the newest 30", () => {
    const old = Array.from({ length: 31 }, (_, index) => `snapshots/${day(index + 1)}.json`);
    const paths = ["README.md", "resonance-2/bets.json", "backups/2026-01-01/bets.json", ...old, "snapshots/2026-10-28.json"];
    const pruned = backupPathsToPrune(paths, 30);
    assert.deepEqual(pruned, [`snapshots/${day(1)}.json`, `snapshots/${day(2)}.json`]);
    assert.equal(pruned.some((path) => path.includes("resonance-2")), false);
    assert.equal(pruned.some((path) => path.startsWith("backups/")), false);
    assert.equal(pruned.includes("README.md"), false);
    assert.equal(pruned.includes("snapshots/2026-10-28.json"), false);
  });

  it("records blob unavailability, commits one private snapshot, and does not touch live paths", async () => {
    const files = new Map<string, string>([
      ["README.md", "keep"],
      ["resonance-2/bets.json", "live"],
      ...Array.from({ length: 31 }, (_, index) => [`snapshots/${day(index + 1)}.json`, "{}"] as const),
    ]);
    let ref: string | null = "old-commit";
    let snapshot = "";
    let deleted: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      assert.equal(url.startsWith("https://api.github.com/"), true);
      assert.equal(url.includes(TOKEN), false);
      assert.equal(auth, `Bearer ${TOKEN}`);
      const apiPath = url.slice("https://api.github.com".length);
      if (method === "GET" && apiPath.endsWith("/git/ref/heads/backups")) {
        return ref ? Response.json({ object: { sha: ref } }) : new Response("missing", { status: 404 });
      }
      if (method === "GET" && apiPath.includes("/git/commits/")) {
        return Response.json({ tree: { sha: "tree-sha" } });
      }
      if (method === "GET" && apiPath.includes("/git/trees/")) {
        return Response.json({
          truncated: false,
          tree: [...files.keys()].map((file) => ({ path: file, type: "blob", sha: "old" })),
        });
      }
      if (method === "POST" && apiPath.endsWith("/git/blobs")) {
        snapshot = Buffer.from(String(body?.content), "base64").toString("utf8");
        return Response.json({ sha: "blob-sha" });
      }
      if (method === "POST" && apiPath.endsWith("/git/trees")) {
        const tree = body?.tree as { path: string; sha: string | null }[];
        deleted = tree.filter((entry) => entry.sha === null).map((entry) => entry.path);
        for (const entry of tree) {
          if (entry.sha === null) files.delete(entry.path);
          else files.set(entry.path, snapshot);
        }
        return Response.json({ sha: "new-tree" });
      }
      if (method === "POST" && apiPath.endsWith("/git/commits")) {
        assert.deepEqual(body?.parents, ["old-commit"]);
        return Response.json({ sha: "commit-sha" });
      }
      if (method === "PATCH" && apiPath.endsWith("/git/refs/heads/backups")) {
        ref = String(body?.sha);
        return Response.json({ ref: "refs/heads/backups" });
      }
      return new Response(`unexpected ${method} ${apiPath}`, { status: 500 });
    };

    const sql = memorySql([
      {
        name: "bets",
        rows: [{ id: "a", stake: "12.00", note: TOKEN }],
      },
      {
        name: "users",
        rows: [{ username: "andres", password_hash: "$argon2id$v=19$m=1", totp_secret: "JBSWY3DPEHPK3PXP" }],
      },
      {
        name: "finance_snapshots",
        rows: [{ as_of: "2026-10-28", payload_enc: "ciphertext", iv: "aabb", tag: "ccdd" }],
      },
      { name: "users;drop", rows: [{ id: "nope" }] },
    ]);
    const result = await runBackup({
      now: new Date("2026-10-28T08:00:00.000Z"),
      sql: sql.client,
      blobs: async () => ({ status: "unavailable", files: [], note: "Blob store is unavailable." }),
      github: createGithubBackupStore({
        token: TOKEN,
        owner: "andres",
        name: "private-backups",
        branch: "backups",
        fetchImpl,
      }),
      target: { repo: "andres/private-backups", branch: "backups" },
      secrets: [TOKEN],
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "ok");
    assert.equal(result.blobStatus, "unavailable");
    assert.equal(result.prefix, "snapshots/2026-10-28.json");
    assert.equal(result.pruned, 2);
    assert.deepEqual(deleted, [`snapshots/${day(1)}.json`, `snapshots/${day(2)}.json`]);
    assert.equal(files.has("README.md"), true);
    assert.equal(files.get("resonance-2/bets.json"), "live");
    assert.equal(files.has("snapshots/2026-10-28.json"), true);
    assert.equal(snapshot.includes(TOKEN), false);
    assert.equal(snapshot.includes("$argon2"), false);
    assert.equal(snapshot.includes("JBSWY3DPEHPK3PXP"), false);
    assert.match(snapshot, /"stake":"12.00"/);
    assert.match(snapshot, /"payload_enc":"ciphertext"/);
    assert.equal(snapshot.includes("users;drop"), false);
    assert.equal(sql.queries.some((query) => query.includes("users;drop")), false);
    assert.equal(sql.queries.some((query) => /\b(delete|update)\b/i.test(query)), false);
    const insert = sql.inserts[0] ?? [];
    assert.equal(insert[2], "ok");
    assert.equal(insert[7], "unavailable");
    const stored = JSON.parse(snapshot) as { config: { repo: string; branch: string }; blobs: object };
    assert.equal(stored.config.repo, "andres/private-backups");
    assert.equal(stored.config.branch, "backups");
    assert.deepEqual(stored.blobs, {});
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  });

  it("keeps a failed GitHub commit from deleting live data and records the error", async () => {
    const seen: string[][] = [];
    const sql = memorySql([{ name: "bets", rows: [{ id: "a", stake: "1.00" }] }]);
    const result = await runBackup({
      now: new Date("2026-10-28T08:00:00.000Z"),
      sql: sql.client,
      blobs: () => readLiveBlobs({
        list: async () => {
          throw new Error(`suspended store, token ${TOKEN}`);
        },
        read: async () => ({ status: "missing" }),
      }),
      github: {
        async listSnapshotPaths() {
          return ["resonance-2/bets.json", "snapshots/2026-01-01.json"];
        },
        async commit(input) {
          seen.push([...input.deletes]);
          throw new Error("GitHub returned 401. Bearer ghp_secretvalue");
        },
      },
      target: { repo: "andres/private-backups", branch: "backups" },
      secrets: [TOKEN, "ghp_secretvalue"],
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "error");
    assert.equal(result.blobStatus, "unavailable");
    assert.equal(result.blobNote, "Blob store is unavailable.");
    assert.deepEqual(seen, [[]]);
    assert.equal(result.error?.includes(TOKEN), false);
    assert.equal(result.error?.includes("ghp_secretvalue"), false);
    assert.equal(sql.inserts[0]?.[2], "error");
  });

  it("refuses a delete outside the snapshot folder before calling GitHub", async () => {
    let calls = 0;
    const store = createGithubBackupStore({
      token: TOKEN,
      owner: "andres",
      name: "private-backups",
      branch: "backups",
      fetchImpl: async () => {
        calls += 1;
        return new Response("no", { status: 500 });
      },
    });
    await assert.rejects(
      () => store.commit({ message: "no", writes: [], deletes: ["resonance-2/bets.json"] }),
      /refusing to delete/,
    );
    await assert.rejects(
      () => store.commit({ message: "no", writes: [{ path: "backups/2026-10-28/bets.json", content: "{}" }], deletes: [] }),
      /refusing to write/,
    );
    assert.equal(calls, 0);
  });

  it("skips unsafe table names while exporting the real ones", async () => {
    const sql = memorySql([
      { name: "bets", rows: [{ id: "a" }] },
      { name: "bad name", rows: [{ id: "x" }] },
    ]);
    const exported = await exportTables(sql.client);
    assert.deepEqual(exported.counts, { bets: 1 });
    assert.equal(exported.skipped, 1);
    assert.equal(sql.queries.some((query) => query.includes("bad name")), false);
  });

  it("hides dollar amounts on the public backup face", () => {
    const lines = backupDetailLines(
      {
        startedAt: "2026-10-28T08:00:00.000Z",
        status: "ok",
        blobStatus: "unavailable",
        tableCount: 4,
        byteSize: 2048,
        error: "lost $40",
      },
      true,
    );
    const text = lines.map((line) => line.value).join(" ");
    assert.match(text, /blob unavailable/);
    assert.equal(text.includes("$"), false);
    const face = backupFace(
      {
        startedAt: "2026-10-28T08:00:00.000Z",
        status: "ok",
        blobStatus: "unavailable",
        tableCount: 4,
        byteSize: 2048,
        error: null,
      },
      true,
    );
    assert.equal(face.href, "/n/backup");
    assert.equal(face.headline, "2026-10-28 08:00 UTC");
    assert.equal(face.status, "ok · blob unavailable");
    assert.equal(`${face.headline} ${face.status}`.includes("$"), false);
    const config = JSON.stringify(siteConfigSnapshot(new Date("2026-10-28T08:00:00.000Z"), {
      repo: "andres/private-backups",
      branch: "backups",
    }));
    assert.equal(config.includes(TOKEN), false);
    assert.equal(backupGithubTarget({}), null);
    assert.equal(
      backupGithubTarget({
        RESONANCE_BACKUP_GITHUB_TOKEN: TOKEN,
        RESONANCE_BACKUP_GITHUB_REPO: "andres/private-backups",
      })?.branch,
      "backups",
    );
    assert.equal(
      backupGithubTarget({
        RESONANCE_BACKUP_GITHUB_TOKEN: TOKEN,
        RESONANCE_BACKUP_GITHUB_REPO: "andres/private-backups",
        RESONANCE_BACKUP_GITHUB_BRANCH: "../main",
      }),
      null,
    );
  });

  it("embeds migration 038 and schedules one daily cron", () => {
    const file = readFileSync(path.join(root, "db/migrations/038_backup_runs.sql"), "utf8");
    assert.equal(BACKUP_RUNS_SQL, file);
    assert.equal(file.includes("INSERT"), false);
    assert.equal(/^\s*delete\b/im.test(file), false);
    assert.equal(EMBEDDED_MIGRATIONS.at(-3)?.id, "038_backup_runs");
    assert.equal(EMBEDDED_MIGRATIONS.at(-2)?.id, "039_health_route_lesson");
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "040_market_quotes");
    const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    assert.deepEqual(vercel.crons, [{ path: "/api/cron/backup", schedule: BACKUP_CRON_SCHEDULE }]);
    const sources = [
      "src/lib/backup.ts",
      "src/lib/backup-github.ts",
      "src/lib/backup-run.ts",
      "src/app/api/cron/backup/route.ts",
    ];
    for (const fileName of sources) {
      const source = readFileSync(path.join(root, fileName), "utf8");
      assert.equal(source.includes("@vercel/blob"), false, fileName);
      assert.equal(source.includes("putPrivateBlob"), false, fileName);
    }
    const reader = readFileSync(path.join(root, "src/lib/backup-blobs.ts"), "utf8");
    assert.equal(reader.includes("put("), false);
    assert.equal(reader.includes("del("), false);
    assert.equal(/\bcopy\(/.test(reader), false);
    assert.match(reader, /readPrivateBlob/);
  });
});

describe("backup route", { concurrency: false }, () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    CRON_SECRET: process.env.CRON_SECRET,
    RESONANCE_SYNC_SECRET: process.env.RESONANCE_SYNC_SECRET,
  };

  after(() => {
    setBackupRunnerForTests(null);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("accepts the cron secret or the sync secret and stays closed otherwise", async () => {
    process.env.DATABASE_URL = "postgres://resonance@127.0.0.1:5432/resonance";
    process.env.CRON_SECRET = CRON;
    process.env.RESONANCE_SYNC_SECRET = SYNC;
    setBackupRunnerForTests(async () => ({
      ok: true,
      status: "ok",
      startedAt: "2026-10-28T08:00:00.000Z",
      prefix: "snapshots/2026-10-28.json",
      tableCounts: { bets: 1 },
      byteSize: 20,
      objectCount: 1,
      blobStatus: "unavailable",
      blobNote: "Blob store is unavailable.",
      error: null,
      pruned: 0,
    }));
    const url = "https://resonance3.vercel.app/api/cron/backup";
    const cron = await GET(new Request(url, { headers: { authorization: `Bearer ${CRON}` } }));
    assert.equal(cron.status, 200);
    const body = await cron.json();
    assert.equal(body.ok, true);
    assert.equal(body.blobStatus, "unavailable");
    assert.equal(JSON.stringify(body).includes(CRON), false);
    assert.equal(JSON.stringify(body).includes("http"), false);
    const sync = await POST(new Request(url, { headers: { authorization: `Bearer ${SYNC}` } }));
    assert.equal(sync.status, 200);
    const anon = await POST(new Request(url));
    assert.equal(anon.status, 401);
    const wrong = await GET(new Request(url, { headers: { authorization: "Bearer nope" } }));
    assert.equal(wrong.status, 401);

    const allowed = await proxy(new NextRequest(url, { headers: { authorization: `Bearer ${CRON}` } }));
    assert.equal(allowed.headers.get("x-middleware-next"), "1");
    const bets = await proxy(
      new NextRequest("https://resonance3.vercel.app/api/bets", {
        headers: { authorization: `Bearer ${CRON}` },
      }),
    );
    assert.equal(bets.status, 401);

    delete process.env.CRON_SECRET;
    delete process.env.RESONANCE_SYNC_SECRET;
    const closed = await GET(new Request(url, { headers: { authorization: `Bearer ${CRON}` } }));
    assert.equal(closed.status, 401);
  });
});
