import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { POST as ingest } from "@/app/api/ingest/obs/route";
import {
  OBS_HEADER,
  OBS_HEADER_NAME,
  OBS_URL,
  formatBytes,
  formatDuration,
  formatObsTime,
  hashObsToken,
  parseObsRecording,
} from "@/lib/obs";
import { readObsPage, saveObsTokenHash } from "@/lib/obs-store";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS, OBS_SQL } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";
import { DATA_SOURCES } from "@/data/system-map";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const cssRequire = createRequire(import.meta.url);
const nodeModule = cssRequire("module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown;
};
function LinkStandIn(props: { href?: string; children?: ReactNode; className?: string }) {
  return createElement("a", { href: props.href ?? "", className: props.className }, props.children);
}
const originalLoad = nodeModule._load;
nodeModule._load = function load(request: string, parent: unknown, isMain: boolean) {
  const normalized = request.replace(/\\/g, "/");
  if (normalized.endsWith(".css") || normalized.includes(".module.css")) {
    return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
  }
  if (normalized === "next/link" || normalized.includes("next/dist/client/app-dir/link")) {
    return { __esModule: true, default: LinkStandIn };
  }
  return originalLoad(request, parent, isMain);
};

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return escapeText(String(node));
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  if (typeof type !== "string") return render((node.props as { children?: ReactNode }).children);
  const props = node.props as Record<string, unknown>;
  const attrs: string[] = [];
  for (const key of Object.keys(props).sort()) {
    if (key === "children") continue;
    const value = props[key];
    if (value == null || value === false || typeof value === "function") continue;
    if (typeof value === "object") continue;
    const name = key === "className" ? "class" : key;
    attrs.push(` ${name}="${escapeText(String(value)).replace(/"/g, "&quot;")}"`);
  }
  return `<${type}${attrs.join("")}>${render(props.children as ReactNode)}</${type}>`;
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

const first = {
  fileName: "2026-11-04 15-02-11.mkv",
  sizeBytes: 1_610_612_736,
  durationSec: 754,
  createdAt: "2026-11-04T21:02:11.000Z",
  folder: "D:/OBS/Recordings",
};

const second = {
  fileName: "desk-broll.mp4",
  sizeBytes: 84_000_000,
  createdAt: "2026-11-03T18:00:00.000Z",
  folder: "D:/OBS/Recordings",
};

function post(body: unknown, token: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[OBS_HEADER] = token;
  return ingest(
    new Request(OBS_URL, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("obs recordings", () => {
  const previous = process.env.DATABASE_URL;

  after(() => {
    setSqlClientForTests(null);
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    setSqlClientForTests(memorySql());
    await migrate();
  });

  it("keeps the migration file and the embedded copy identical", () => {
    const file = readFileSync(path.join(root, "db/migrations/048_obs.sql"), "utf8");
    assert.equal(OBS_SQL, file);
    assert.equal(EMBEDDED_MIGRATIONS.at(-2)?.id, "048_obs");
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "049_broker_sync");
    assert.equal(file.includes("INSERT"), false);
    const bridge = DATA_SOURCES.find((source) => source.id === "obs");
    assert.equal(bridge?.name, "OBS/PC");
    assert.match(bridge?.feeds ?? "", /automatic bridge/);
  });

  it("parses a recording and refuses a body without a file name", () => {
    const parsed = parseObsRecording(first);
    assert.equal(parsed?.fileName, first.fileName);
    assert.equal(parsed?.durationSec, 754);
    assert.equal(parseObsRecording({ ...first, durationSec: undefined })?.durationSec, null);
    assert.equal(parseObsRecording({ ...second })?.durationSec, null);
    assert.equal(parseObsRecording({ ...first, fileName: "" }), null);
    assert.equal(parseObsRecording({ ...first, sizeBytes: -1 }), null);
    assert.equal(parseObsRecording({ ...first, durationSec: -3 }), null);
    assert.equal(formatDuration(754), "12:34");
    assert.equal(formatDuration(null), "—");
    assert.equal(formatBytes(1_610_612_736), "1.5 GB");
    assert.match(formatObsTime(first.createdAt), /CT$/);
  });

  it("rejects a bad token, updates a repeated file, and keeps a second recording", async () => {
    assert.equal((await post(first, null)).status, 401);
    assert.equal((await post(first, "not-the-token")).status, 401);
    const token = "obs-bridge-token";
    await saveObsTokenHash(hashObsToken(token));
    assert.equal((await post(first, "other-token")).status, 401);
    assert.equal((await post("{", token)).status, 400);

    const created = await post({ ...first, token: "should-not-stick" }, token);
    assert.equal(created.status, 200);
    assert.deepEqual(await created.json(), { ok: true });
    const again = await post({ ...first, sizeBytes: 1_700_000_000, durationSec: 800 }, token);
    assert.equal(again.status, 200);
    const other = await post(second, token);
    assert.equal(other.status, 200);

    const count = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM obs_recordings`);
    assert.equal(count[0]?.n, "2");
    const size = await sqlQuery<{ size: string }>(
      `SELECT size_bytes::text AS size FROM obs_recordings WHERE file_name = $1`,
      [first.fileName],
    );
    assert.equal(size[0]?.size, "1700000000");
    const stored = await sqlQuery<{ payload: string }>(`SELECT payload::text AS payload FROM obs_recordings`);
    assert.equal(JSON.stringify(stored).includes(token), false);
    assert.equal(JSON.stringify(stored).includes("should-not-stick"), false);
    const hash = await sqlQuery<{ token_hash: string }>(`SELECT token_hash FROM obs_tokens WHERE id = 1`);
    assert.equal(hash[0]?.token_hash, hashObsToken(token));
    assert.equal(JSON.stringify(hash).includes(token), false);

    const page = await readObsPage();
    assert.equal(page.recordings.length, 2);
    assert.equal(page.recordings[0]?.fileName, first.fileName);
    assert.equal(page.recordings[1]?.fileName, second.fileName);
    assert.equal(page.recordings[1]?.durationSec, null);
    assert.ok(page.lastSeen);
  });

  it("paints name, length, size, time, and last seen on Gear", async () => {
    const { YouTubeGearList } = await import("@/components/youtube-node");
    const { ObsGuide } = await import("@/components/obs-guide");
    const guide = render(createElement(ObsGuide));
    assert.match(guide, new RegExp(OBS_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(guide, new RegExp(OBS_HEADER_NAME));
    assert.equal(guide.includes("obs-bridge-token"), false);
    const seen = formatObsTime("2026-11-04T21:10:00.000Z");
    const html = render(
      createElement(YouTubeGearList, {
        recordings: [
          {
            key: "a",
            fileName: first.fileName,
            length: formatDuration(754),
            size: formatBytes(first.sizeBytes),
            time: formatObsTime(first.createdAt),
          },
          {
            key: "b",
            fileName: second.fileName,
            length: formatDuration(null),
            size: formatBytes(second.sizeBytes),
            time: formatObsTime(second.createdAt),
          },
        ],
        updatedAt: "2026-11-04T21:10:00.000Z",
        lastSeenLabel: seen,
      }),
    );
    assert.match(html, /Latest recordings/);
    assert.match(html, new RegExp(`Last seen ${seen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(html, /2026-11-04 15-02-11\.mkv/);
    assert.match(html, /12:34/);
    assert.match(html, /1\.5 GB/);
    assert.match(html, /desk-broll\.mp4/);
    assert.match(html, /80 MB/);
    assert.equal(html.includes("$"), false);
    const empty = render(createElement(YouTubeGearList, {}));
    assert.match(empty, /Recordings/);
    assert.equal(empty.includes("Latest recordings"), false);
    assert.equal(empty.includes("desk-broll"), false);
  });
});
