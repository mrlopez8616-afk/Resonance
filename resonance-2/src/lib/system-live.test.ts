import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { GET, setSystemEventsSessionForTests } from "@/app/api/system/events/route";
import { setSqlClientForTests, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { applyMigrations } from "@/lib/pg/migrate";
import { proxy } from "@/proxy";
import {
  SYSTEM_EVENT_KEYS,
  SYSTEM_EVENT_POLL_MS,
  buildLiveGraph,
  liveEdgeId,
  liveEdgeSet,
  livePointId,
  mapBuildPulse,
  mapCalendarPulse,
  mapFillPulse,
  mapFinancePulse,
  preferStaticLiveView,
  presentLiveGraph,
  resolveLivePublicMode,
  selectLiveEvents,
  type LiveCapability,
  type SystemPulse,
} from "@/lib/system-live";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const graph = buildLiveGraph();
const edges = liveEdgeSet(graph);

const capable: LiveCapability = {
  webgl: true,
  reducedMotion: false,
  deviceMemory: 8,
  hardwareConcurrency: 6,
  saveData: false,
};

function keysOf(value: unknown, into = new Set<string>()): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysOf(item, into);
    return [...into];
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      keysOf(child, into);
    }
  }
  return [...into];
}

describe("system live graph", () => {
  it("puts Sophia at the center and separates every point", () => {
    const hub = graph.points.find((point) => point.id === "hub:sophia");
    assert.equal(hub?.label, "Sophia Luna");
    assert.deepEqual([hub?.x, hub?.y, hub?.z], [0, 0, 0]);
    assert.equal(graph.points.filter((point) => point.kind === "node").length, 7);
    assert.equal(graph.points.some((point) => point.id === "node:youtube" && point.href === null), true);
    assert.equal(graph.points.find((point) => point.id === "node:crypto")?.href, "/n/crypto");
    for (const edge of graph.edges) {
      assert.equal(graph.points.some((point) => point.id === edge.from), true, edge.id);
      assert.equal(graph.points.some((point) => point.id === edge.to), true, edge.id);
    }
    for (let i = 0; i < graph.points.length; i += 1) {
      for (let j = i + 1; j < graph.points.length; j += 1) {
        const a = graph.points[i];
        const b = graph.points[j];
        if (!a || !b) continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        assert.equal(dist > 0.25, true, `${a.id} ${b.id} ${dist}`);
      }
    }
  });

  it("hides Finance label detail in public mode and keeps the point", () => {
    const shown = presentLiveGraph(graph, true);
    const finance = shown.points.find((point) => point.id === "node:finance");
    const desk = shown.points.find((point) => point.id === "agent:finance-desk");
    const plaid = shown.points.find((point) => point.id === "source:plaid");
    assert.equal(finance?.label, "Finance");
    assert.equal(finance?.href, null);
    assert.equal(finance?.detail, null);
    assert.equal(desk?.detail, null);
    assert.equal(plaid?.detail, null);
    assert.equal(shown.points.find((point) => point.id === "node:crypto")?.href, "/n/crypto");
  });
});

describe("system live event mapping", () => {
  it("maps each event type onto its edge path and stays quiet otherwise", () => {
    const at = "2026-10-09T21:00:00.000Z";
    const nvda = mapFillPulse(
      { source: "robinhood", sleeve: "rh-agentic", symbol: "NVDA", at, externalId: "nvda-1" },
      edges,
    );
    assert.deepEqual(nvda && { type: nvda.type, nodeIds: nvda.nodeIds, edgeIds: nvda.edgeIds }, {
      type: "fill",
      nodeIds: [livePointId("node", "ai-stocks")],
      edgeIds: [
        liveEdgeId(livePointId("source", "robinhood"), livePointId("sleeve", "rh-agentic")),
        liveEdgeId(livePointId("sleeve", "rh-agentic"), livePointId("node", "ai-stocks")),
      ],
    });

    const sui = mapFillPulse(
      { source: "coinbase", sleeve: "cb-agentic", symbol: "sui", at, externalId: "sui-1" },
      edges,
    );
    assert.deepEqual(sui?.edgeIds, [
      "source:coinbase--sleeve:cb-agentic",
      "sleeve:cb-agentic--node:crypto",
    ]);
    assert.deepEqual(sui?.nodeIds, ["node:crypto"]);

    const xrp = mapFillPulse(
      { source: "seed", venue: "coinbase", sleeve: "coinbase", symbol: "XRP", at, externalId: "xrp-1" },
      edges,
    );
    assert.deepEqual(xrp?.edgeIds, [
      "source:coinbase--sleeve:coinbase",
      "sleeve:coinbase--node:crypto",
    ]);

    assert.equal(
      mapFillPulse({ source: "robinhood", sleeve: "rh-agentic", symbol: "HBAR", at, externalId: "nope" }, edges),
      null,
    );
    assert.equal(
      mapFillPulse(
        { source: "robinhood", sleeve: "cb-agentic", symbol: "NVDA", at, externalId: "cross" },
        edges,
      ),
      null,
    );

    const merged = mapBuildPulse({ id: "platform-system-map", status: "live", prNumber: 79, at }, edges);
    assert.deepEqual(merged?.edgeIds, ["source:github-actions--node:build"]);
    assert.deepEqual(merged?.nodeIds, ["node:build"]);
    assert.equal(merged?.type, "build");

    const changed = mapBuildPulse({ id: "platform-system-map", status: "in_progress", prNumber: null, at }, edges);
    assert.deepEqual(changed?.edgeIds, ["source:build-api--node:build"]);

    const brief = mapCalendarPulse(
      {
        id: "cadence-daily-brief-2026-10-09",
        kind: null,
        lane: "cadence",
        title: "Daily Brief",
        status: "sent",
        at,
      },
      edges,
    );
    assert.deepEqual(brief && { type: brief.type, nodeIds: brief.nodeIds, edgeIds: brief.edgeIds }, {
      type: "brief",
      nodeIds: ["hub:sophia"],
      edgeIds: ["source:calendar--hub:sophia"],
    });
    assert.equal(
      mapCalendarPulse(
        { id: "cadence-daily-brief", kind: null, lane: "cadence", title: "Daily Brief", status: "scheduled", at },
        edges,
      ),
      null,
    );

    const fight = mapCalendarPulse(
      { id: "fights-card", kind: "fight", lane: "fights", title: "UFC card", status: "history", at },
      edges,
    );
    assert.deepEqual(fight && { type: fight.type, nodeIds: fight.nodeIds, edgeIds: fight.edgeIds }, {
      type: "fight",
      nodeIds: ["node:fight-desk"],
      edgeIds: ["source:calendar--node:fight-desk"],
    });
    assert.equal(
      mapCalendarPulse(
        { id: "fights-open", kind: "fight", lane: "fights", title: "UFC card", status: "scheduled", at },
        edges,
      ),
      null,
    );

    const finance = mapFinancePulse({ asOf: "2026-10-09", at }, edges);
    assert.deepEqual(finance && { type: finance.type, nodeIds: finance.nodeIds, edgeIds: finance.edgeIds }, {
      type: "finance",
      nodeIds: ["node:finance"],
      edgeIds: ["source:plaid--node:finance"],
    });

    for (const pulse of [nvda, sui, xrp, merged, changed, brief, fight, finance]) {
      assert.ok(pulse);
      assert.deepEqual(Object.keys(pulse), [...SYSTEM_EVENT_KEYS]);
      for (const edgeId of pulse.edgeIds) assert.equal(edges.has(edgeId), true, edgeId);
    }
  });

  it("keeps the poll inside the live window and prefers an isPublicMode helper", async () => {
    assert.equal(SYSTEM_EVENT_POLL_MS >= 20_000 && SYSTEM_EVENT_POLL_MS <= 30_000, true);
    const older: SystemPulse = {
      id: "fill:old",
      type: "fill",
      nodeIds: ["node:crypto"],
      edgeIds: ["source:coinbase--sleeve:cb-agentic"],
      at: "2026-10-09T20:00:00.000Z",
    };
    const newer: SystemPulse = { ...older, id: "fill:new", at: "2026-10-09T21:00:00.000Z" };
    assert.deepEqual(
      selectLiveEvents([older, newer], "2026-10-09T20:30:00.000Z").map((event) => event.id),
      ["fill:new"],
    );
    assert.equal(await resolveLivePublicMode(async () => false, "1"), false);
    assert.equal(await resolveLivePublicMode(null, "1"), true);
    assert.equal(await resolveLivePublicMode(null, null), false);
  });
});

describe("system live fallback", () => {
  it("chooses the static view from WebGL, motion, memory, CPU, save-data, and the toggle", () => {
    assert.equal(preferStaticLiveView({ ...capable, choice: "auto" }), false);
    assert.equal(preferStaticLiveView({ ...capable, webgl: false, choice: "auto" }), true);
    assert.equal(preferStaticLiveView({ ...capable, reducedMotion: true, choice: "auto" }), true);
    assert.equal(preferStaticLiveView({ ...capable, saveData: true, choice: "auto" }), true);
    assert.equal(preferStaticLiveView({ ...capable, deviceMemory: 2, choice: "auto" }), true);
    assert.equal(preferStaticLiveView({ ...capable, deviceMemory: 4, choice: "auto" }), false);
    assert.equal(preferStaticLiveView({ ...capable, hardwareConcurrency: 2, choice: "auto" }), true);
    assert.equal(preferStaticLiveView({ ...capable, hardwareConcurrency: 4, choice: "auto" }), false);
    assert.equal(preferStaticLiveView({ ...capable, deviceMemory: null, hardwareConcurrency: null, choice: "auto" }), false);
    assert.equal(preferStaticLiveView({ ...capable, choice: "static" }), true);
    assert.equal(preferStaticLiveView({ ...capable, reducedMotion: true, choice: "3d" }), false);
    assert.equal(preferStaticLiveView({ ...capable, webgl: false, choice: "3d" }), true);
  });
});

describe("system live route auth", { concurrency: false }, () => {
  it("sends a signed-out live page to login and refuses the events read", async () => {
    const previous = {
      AUTH_PASSWORD_HASH: process.env.AUTH_PASSWORD_HASH,
      AUTH_TOTP_SECRET: process.env.AUTH_TOTP_SECRET,
      AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    };
    process.env.AUTH_PASSWORD_HASH = "hash-sentinel-value-not-real";
    process.env.AUTH_TOTP_SECRET = "totp-sentinel-value-not-real";
    process.env.AUTH_SESSION_SECRET = "session-sentinel-value-not-real";
    try {
      const page = await proxy(new NextRequest("https://resonance.test/n/system/live"));
      assert.equal(page.status, 307);
      assert.match(page.headers.get("location") ?? "", /\/login\?next=%2Fn%2Fsystem%2Flive$/);
      const api = await proxy(new NextRequest("https://resonance.test/api/system/events"));
      assert.equal(api.status, 401);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("system events endpoint", { concurrency: false }, () => {
  after(() => {
    setSqlClientForTests(null);
    setSystemEventsSessionForTests(undefined);
  });

  it("returns no amount or quantity fields", async () => {
    const db = new PGlite();
    const client: SqlClient = {
      async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
        const result = await db.query<T>(text, [...params]);
        return result.rows ?? [];
      },
    };
    setSqlClientForTests(client);
    await applyMigrations(EMBEDDED_MIGRATIONS);
    await client.query(`UPDATE fills SET created_at = '2020-01-01T00:00:00Z'`);
    await client.query(`UPDATE build_items SET updated_at = '2020-01-01T00:00:00Z'`);

    await client.query(
      `INSERT INTO fills (
         source, external_id, filled_at, symbol, side, quantity, price, venue, sleeve, result, note, payload, created_at
       ) VALUES (
         'robinhood', 'throwaway-nvda', '2026-10-09T21:00:00Z', 'NVDA', 'buy',
         4821.25, 7733.5, 'robinhood', 'rh-agentic', 'filled',
         'SENTINEL_NOTE_555', '{"usd":"SENTINEL_PAYLOAD_888"}'::jsonb, '2026-10-09T21:00:00Z'
       )`,
    );
    await client.query(
      `UPDATE build_items
       SET status = 'live', pr_number = 79, updated_at = '2026-10-09T21:01:00Z'
       WHERE id = 'platform-system-map'`,
    );
    await client.query(
      `INSERT INTO calendar_entries (id, kind, lane, node, start_at, title, status, writer, payload, updated_at)
       VALUES
         ('cadence-daily-brief-2026-10-09', NULL, 'cadence', NULL, '2026-10-09T12:02:00Z', 'Daily Brief', 'sent', 'agent', '{"amount":"SENTINEL_BRIEF_222"}'::jsonb, '2026-10-09T21:02:00Z'),
         ('fights-settled-demo', 'fight', 'fights', NULL, '2026-10-09T18:00:00Z', 'UFC card', 'history', 'agent', '{}'::jsonb, '2026-10-09T21:02:30Z'),
         ('fights-open-demo', 'fight', 'fights', NULL, '2026-10-10T18:00:00Z', 'UFC card', 'scheduled', 'agent', '{}'::jsonb, '2026-10-09T21:02:40Z'),
         ('cadence-daily-brief-later', NULL, 'cadence', NULL, '2026-10-10T12:02:00Z', 'Daily Brief', 'scheduled', 'agent', '{}'::jsonb, '2026-10-09T21:02:50Z')`,
    );
    await client.query(
      `INSERT INTO finance_snapshots (as_of, schema_version, sha256, payload_enc, iv, tag, stored_at)
       VALUES ('2026-10-09', 1, 'hash', 'SENTINEL_ENC_1190', 'iv-secret', 'tag-secret', '2026-10-09T21:03:00Z')`,
    );

    setSystemEventsSessionForTests(null);
    const denied = await GET(new Request("https://resonance.test/api/system/events"));
    assert.equal(denied.status, 401);

    setSystemEventsSessionForTests({ role: "operator" });
    const forbidden = await GET(new Request("https://resonance.test/api/system/events"));
    assert.equal(forbidden.status, 401);

    setSystemEventsSessionForTests({ role: "owner" });
    const bearer = await GET(
      new Request("https://resonance.test/api/system/events", { headers: { authorization: "Bearer secret" } }),
    );
    assert.equal(bearer.status, 401);

    const response = await GET(
      new Request("https://resonance.test/api/system/events?since=2026-10-09T20:00:00.000Z"),
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean; events: SystemPulse[] };
    const allowed = new Set(["ok", "events", ...SYSTEM_EVENT_KEYS]);
    for (const key of keysOf(body)) assert.equal(allowed.has(key), true, key);
    const serialized = JSON.stringify(body);
    for (const sentinel of [
      "4821.25",
      "7733.5",
      "SENTINEL_NOTE_555",
      "SENTINEL_PAYLOAD_888",
      "SENTINEL_BRIEF_222",
      "SENTINEL_ENC_1190",
      "iv-secret",
      "tag-secret",
      "NVDA",
      "quantity",
      "price",
    ]) {
      assert.equal(serialized.includes(sentinel), false, sentinel);
    }

    const byType = Object.fromEntries(body.events.map((event) => [event.type, event]));
    assert.deepEqual(byType.fill?.edgeIds, [
      "source:robinhood--sleeve:rh-agentic",
      "sleeve:rh-agentic--node:ai-stocks",
    ]);
    assert.deepEqual(byType.build?.edgeIds, ["source:github-actions--node:build"]);
    assert.deepEqual(byType.brief?.edgeIds, ["source:calendar--hub:sophia"]);
    assert.deepEqual(byType.fight?.edgeIds, ["source:calendar--node:fight-desk"]);
    assert.deepEqual(byType.finance?.edgeIds, ["source:plaid--node:finance"]);
    assert.equal(body.events.some((event) => event.id.includes("fights-open")), false);
    assert.equal(body.events.some((event) => event.id.includes("later")), false);

    const query = readFileSync(path.join(root, "src/lib/system-events.ts"), "utf8");
    assert.equal(/\bquantity\b/i.test(query), false);
    assert.equal(/\bprice\b/i.test(query), false);
    assert.equal(/payload/i.test(query), false);
    const scene = readFileSync(path.join(root, "src/components/system-live.tsx"), "utf8");
    const gate = readFileSync(path.join(root, "src/components/system-live-gate.tsx"), "utf8");
    assert.match(scene, /next\/dynamic/);
    assert.match(scene, /ssr:\s*false/);
    assert.match(gate, /ssr:\s*false/);
  });
});
