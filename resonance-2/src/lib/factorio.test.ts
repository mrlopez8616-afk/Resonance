import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newDb } from "pg-mem";
import { POST as ingest } from "@/app/api/ingest/factorio/route";
import {
  FACTORIO_HEADER,
  FACTORIO_HEADER_NAME,
  FACTORIO_STALE_MS,
  FACTORIO_URL,
  factorioChartGeometry,
  factorioFeedStale,
  formatPlayHours,
  hashFactorioToken,
  parseFactorioSnapshot,
} from "@/lib/factorio";
import { readFactorioPage, saveFactorioTokenHash } from "@/lib/factorio-store";
import { factorioHomeFace } from "@/lib/home-faces";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS, FACTORIO_SQL } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENDPOINT = FACTORIO_URL;

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

const sample = {
  source: "resonance-bridge",
  version: "0.1.0",
  reason: "interval",
  tick: 51210000,
  play_hours: 237.08,
  timestamp: "T+9d21:05:00 (game time)",
  surfaces: ["nauvis"],
  players: [{ name: "Andres", connected: true, online_hours: 237.08, afk_minutes: 0.4 }],
  force: {
    rockets_launched: 91,
    technologies_researched: 187,
    current_research: "worker-robots-speed-6",
    research_progress: 0.7017,
  },
  production: [
    { name: "copper-cable", per_min: 3866.1 },
    { name: "iron-plate", per_min: 2019.4 },
  ],
  consumption: [{ name: "copper-cable", per_min: 3876.5 }],
  science_produced: {
    "space-science-pack": 91000,
    "automation-science-pack": 153342,
  },
  machines: { lab: 77, "assembling-machine": 632, furnace: 793, "mining-drill": 1330 },
};

function post(body: unknown, token: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers[FACTORIO_HEADER] = token;
  return ingest(
    new Request(ENDPOINT, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("factorio snapshots", () => {
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
    const file = readFileSync(path.join(root, "db/migrations/046_factorio.sql"), "utf8");
    assert.equal(FACTORIO_SQL, file);
    assert.equal(EMBEDDED_MIGRATIONS.at(-2)?.id, "046_factorio");
    assert.equal(EMBEDDED_MIGRATIONS.at(-1)?.id, "047_broker_sync");
    assert.equal(file.includes("INSERT"), false);
  });

  it("parses the bridge snapshot and refuses a body without a tick", () => {
    const parsed = parseFactorioSnapshot(sample);
    assert.equal(parsed?.tick, 51210000);
    assert.equal(parsed?.rockets, 91);
    assert.equal(parsed?.players[0]?.connected, true);
    assert.equal(parsed?.science[0]?.name, "automation-science-pack");
    assert.equal(parsed?.machines[0]?.name, "assembling-machine");
    assert.equal(formatPlayHours(parsed?.playHours ?? 0), "237.1h");
    assert.equal(parseFactorioSnapshot({ play_hours: 1 }), null);
    assert.equal(factorioChartGeometry([{ tick: 1, playHours: 1, rockets: 0 }]), null);
    assert.ok(factorioChartGeometry([
      { tick: 1, playHours: 1, rockets: 0 },
      { tick: 2, playHours: 2, rockets: 1 },
    ])?.rockets.startsWith("M"));
  });

  it("warns only when a connected player has gone quiet for 30 minutes", () => {
    const now = Date.parse("2026-11-04T12:00:00.000Z");
    const fresh = new Date(now - 5 * 60 * 1000).toISOString();
    const old = new Date(now - FACTORIO_STALE_MS - 1000).toISOString();
    assert.equal(factorioFeedStale({ receivedAt: fresh, playing: true, now }), false);
    assert.equal(factorioFeedStale({ receivedAt: old, playing: true, now }), true);
    assert.equal(factorioFeedStale({ receivedAt: old, playing: false, now }), false);
    assert.equal(factorioHomeFace({ unavailable: false, playHours: null, rockets: null, stale: false }).headline, "not connected");
    assert.equal(factorioHomeFace({ unavailable: false, playHours: 237.08, rockets: 91, stale: false }).status, "91 rockets");
    assert.equal(factorioHomeFace({ unavailable: false, playHours: 237.08, rockets: 91, stale: true }).status, "feed stale");
    assert.equal(factorioHomeFace({ unavailable: true, playHours: 10, rockets: 1, stale: false }).headline, "unavailable");
  });

  it("rejects a bad token and dedupes a repeated tick", async () => {
    const missing = await post(sample, "not-the-token");
    assert.equal(missing.status, 401);
    const bare = await post(sample, null);
    assert.equal(bare.status, 401);

    const token = "bridge-token";
    await saveFactorioTokenHash(hashFactorioToken(token));
    const wrong = await post(sample, "other-token");
    assert.equal(wrong.status, 401);
    const badJson = await post("{", token);
    assert.equal(badJson.status, 400);

    const first = await post(sample, token);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true, tick: 51210000 });
    const again = await post({ ...sample, force: { ...sample.force, rockets_launched: 92 } }, token);
    assert.equal(again.status, 200);
    const next = await post({ ...sample, tick: 51220000, play_hours: 237.2, players: [{ name: "Andres", connected: false }] }, token);
    assert.equal(next.status, 200);

    const count = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM factorio_snapshots`);
    assert.equal(count[0]?.n, "2");
    const rockets = await sqlQuery<{ rockets: string }>(
      `SELECT rockets_launched::text AS rockets FROM factorio_snapshots WHERE tick = 51210000`,
    );
    assert.equal(rockets[0]?.rockets, "92");
    const hash = await sqlQuery<{ token_hash: string }>(`SELECT token_hash FROM factorio_tokens WHERE id = 1`);
    assert.equal(hash[0]?.token_hash, hashFactorioToken(token));
    assert.equal(JSON.stringify(hash).includes(token), false);

    const page = await readFactorioPage(Date.parse("2026-11-04T12:00:00.000Z"));
    assert.equal(page.history.length, 2);
    assert.equal(page.latest?.rockets, 91);
    assert.equal(page.latest?.tick, 51220000);
    assert.equal(page.stale, false);

    await sqlQuery(
      `UPDATE factorio_snapshots
       SET received_at = '2020-01-01T00:00:00Z',
           players = '[{"name":"Andres","connected":true}]'::jsonb`,
    );
    const stale = await readFactorioPage(Date.parse("2020-01-01T00:40:00.000Z"));
    assert.equal(stale.stale, true);
    assert.equal(stale.latest?.production[0]?.name, "copper-cable");
    assert.equal(stale.latest?.science[0]?.name, "automation-science-pack");
  });

  it("paints the latest snapshot, the progress bar, and a chart only after a second point", async () => {
    const { FactorioFloor } = await import("@/components/factorio-floor");
    const { FactorioGuide } = await import("@/components/factorio-guide");
    const guide = render(createElement(FactorioGuide));
    assert.match(guide, new RegExp(FACTORIO_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(guide, new RegExp(FACTORIO_HEADER_NAME));
    const latest = {
      tick: 10,
      playHours: 237.08,
      rockets: 91,
      technologies: 187,
      currentResearch: "worker-robots-speed-6",
      researchProgress: 0.7017,
      players: [{ name: "Andres", connected: true, onlineHours: 237, afkMinutes: 0.4 }],
      production: [{ name: "copper-cable", perMin: 3866.1 }],
      science: [{ name: "automation-science-pack", total: 153342 }],
      machines: [{ name: "assembling-machine", total: 632 }],
      receivedAt: "2026-11-04T12:00:00.000Z",
    };
    const one = render(
      createElement(FactorioFloor, { latest, history: [{ tick: 10, playHours: 237.08, rockets: 91 }], stale: false, unavailable: false }),
    );
    assert.match(one, /237\.1h/);
    assert.match(one, /Worker Robots Speed 6/);
    assert.match(one, /aria-valuenow="70"/);
    assert.match(one, /Copper Cable/);
    assert.match(one, /3,866\/min/);
    assert.equal(one.includes("<svg"), false);
    assert.equal(one.includes("Feed is stale"), false);
    const two = render(
      createElement(FactorioFloor, {
        latest,
        history: [
          { tick: 9, playHours: 200, rockets: 80 },
          { tick: 10, playHours: 237.08, rockets: 91 },
        ],
        stale: true,
        unavailable: false,
      }),
    );
    assert.match(two, /Feed is stale/);
    assert.match(two, /Rockets and hours played/);
    const empty = render(createElement(FactorioFloor, { latest: null, history: [], stale: false, unavailable: false }));
    assert.equal(empty.includes("91"), false);
    assert.match(empty, /Connect to see data/);
  });
});
