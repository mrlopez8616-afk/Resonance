import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { newDb } from "pg-mem";
import { GET, PATCH, POST } from "@/app/api/build/items/route";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import { setGithubPullLoaderForTests, githubRequestInit, type GithubPullLoad } from "@/lib/build-github";
import {
  applyPullToSteps,
  averageStepPercent,
  buildHomeCard,
  formatUpdatedCt,
  groupBuildItems,
  GITHUB_REVALIDATE_SECONDS,
  pullForItem,
  standardSteps,
  stepCounts,
  stepPercent,
  type BuildItem,
  type GithubPull,
} from "@/lib/build-tracker";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { migrate } from "@/lib/pg/migrate";

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

function pull(partial: Partial<GithubPull> & Pick<GithubPull, "state">): GithubPull {
  return {
    number: partial.number ?? 1,
    state: partial.state,
    mergedAt: partial.mergedAt ?? null,
    title: partial.title ?? "Example",
    body: partial.body ?? "",
    labels: partial.labels ?? [],
    headRef: partial.headRef ?? "cursor/example",
  };
}

function item(partial: Partial<BuildItem> & Pick<BuildItem, "id" | "node" | "status">): BuildItem {
  return {
    title: partial.title ?? partial.id,
    prNumber: partial.prNumber ?? null,
    steps: partial.steps ?? standardSteps(),
    nextStep: partial.nextStep ?? null,
    sortOrder: partial.sortOrder ?? 0,
    updatedAt: partial.updatedAt ?? "2026-10-09T17:00:00.000Z",
    ...partial,
  };
}

describe("build tracker percent", () => {
  it("gives every step an equal share and stays null without steps", () => {
    assert.deepEqual(stepCounts(standardSteps()), { done: 0, total: 5 });
    assert.equal(stepPercent(standardSteps()), 0);
    assert.equal(stepPercent(standardSteps({ spec: true })), 20);
    assert.equal(
      stepPercent(
        standardSteps({
          spec: true,
          "pr-open": true,
          "tests-build": true,
          merged: true,
          "verified-prod": true,
        }),
      ),
      100,
    );
    const withCustom = [
      ...standardSteps({
        spec: true,
        "pr-open": true,
        "tests-build": true,
        merged: true,
        "verified-prod": true,
      }),
      { id: "founder-shortcut", label: "founder Shortcut set up", done: false },
    ];
    assert.deepEqual(stepCounts(withCustom), { done: 5, total: 6 });
    assert.equal(stepPercent(withCustom), 83);
    assert.notEqual(stepPercent(withCustom), 100);
    assert.equal(stepPercent([]), null);
    assert.equal(averageStepPercent([{ steps: [] }, { steps: standardSteps({ spec: true }) }]), 20);
  });
});

describe("github pull mapping", () => {
  const ladder = standardSteps();

  it("maps an open pull to PR open and leaves merged undone", () => {
    const steps = applyPullToSteps(ladder, pull({ state: "open", number: 80 }));
    assert.equal(steps.find((step) => step.id === "pr-open")?.done, true);
    assert.equal(steps.find((step) => step.id === "merged")?.done, false);
    assert.equal(steps.find((step) => step.id === "tests-build")?.done, false);
    assert.equal(steps.find((step) => step.id === "verified-prod")?.done, false);
  });

  it("maps a merged pull from merged_at and a tests phrase in the body or a label", () => {
    const fromBody = applyPullToSteps(
      ladder,
      pull({
        state: "closed",
        number: 60,
        mergedAt: "2026-10-08T17:01:21Z",
        body: "Local tests and build passed before merge.",
      }),
    );
    assert.equal(fromBody.find((step) => step.id === "pr-open")?.done, true);
    assert.equal(fromBody.find((step) => step.id === "merged")?.done, true);
    assert.equal(fromBody.find((step) => step.id === "tests-build")?.done, true);
    assert.equal(fromBody.find((step) => step.id === "verified-prod")?.done, false);

    const fromLabel = applyPullToSteps(
      ladder,
      pull({
        state: "closed",
        mergedAt: "2026-10-08T17:01:21Z",
        labels: ["local tests and build passed"],
      }),
    );
    assert.equal(fromLabel.find((step) => step.id === "tests-build")?.done, true);
    assert.equal(fromLabel.find((step) => step.id === "verified-prod")?.done, false);
  });

  it("maps a closed unmerged pull as opened and not merged, and does not clear a stored pass", () => {
    const stored = standardSteps({ "tests-build": true, "verified-prod": true });
    const steps = applyPullToSteps(
      stored,
      pull({ state: "closed", mergedAt: null, body: "Closed without merging." }),
    );
    assert.equal(steps.find((step) => step.id === "pr-open")?.done, true);
    assert.equal(steps.find((step) => step.id === "merged")?.done, false);
    assert.equal(steps.find((step) => step.id === "tests-build")?.done, true);
    assert.equal(steps.find((step) => step.id === "verified-prod")?.done, true);
    assert.equal(applyPullToSteps(stored, null).find((step) => step.id === "merged")?.done, false);
  });

  it("matches in-flight items by title when the number is not stored yet", () => {
    const pulls = [
      pull({ number: 90, state: "open", title: "Fills dedupe + lots totals across sleeves", headRef: "cursor/fills-dedupe" }),
      pull({ number: 91, state: "closed", mergedAt: "2026-10-01T00:00:00Z", title: "Old fills dedupe note" }),
    ];
    const match = pullForItem({ id: "platform-fills-dedupe", prNumber: null }, pulls);
    assert.equal(match?.number, 90);
    assert.equal(pullForItem({ id: "platform-login", prNumber: 60 }, pulls), null);
  });

  it("caches GitHub pulls for about 10 minutes", () => {
    assert.equal(GITHUB_REVALIDATE_SECONDS, 600);
    const init = githubRequestInit(new Headers());
    assert.equal(init.next.revalidate, 600);
  });
});

describe("build grouping", () => {
  const now = new Date("2026-10-09T17:00:00.000Z");
  const recent = "2026-10-08T17:00:00.000Z";
  const old = "2026-09-01T17:00:00.000Z";

  it("averages a node, splits live items older than 7 days, and keeps queued order", () => {
    const rows = [
      item({
        id: "platform-old",
        node: "platform",
        status: "live",
        title: "Old",
        sortOrder: 1,
        updatedAt: old,
        steps: standardSteps({ spec: true, "pr-open": true, "tests-build": true, merged: true, "verified-prod": true }),
      }),
      item({
        id: "platform-new",
        node: "platform",
        status: "live",
        title: "New",
        sortOrder: 2,
        updatedAt: recent,
        steps: standardSteps({ spec: true }),
      }),
      item({
        id: "platform-system-map",
        node: "platform",
        status: "queued",
        title: "System Map",
        sortOrder: 70,
        steps: standardSteps(),
      }),
      item({
        id: "platform-public-mode",
        node: "platform",
        status: "queued",
        title: "Public mode",
        sortOrder: 75,
        steps: standardSteps(),
      }),
      item({
        id: "crypto-open",
        node: "crypto",
        status: "in_progress",
        title: "Still going",
        sortOrder: 1,
        updatedAt: old,
        steps: standardSteps({ spec: true, "pr-open": true }),
      }),
    ];
    const board = groupBuildItems(rows, now);
    const platform = board.groups.find((group) => group.node === "platform");
    assert.ok(platform);
    assert.deepEqual(platform.active.map((row) => row.id), [
      "platform-new",
      "platform-system-map",
      "platform-public-mode",
    ]);
    assert.deepEqual(platform.shipped.map((row) => row.id), ["platform-old"]);
    assert.equal(platform.percent, averageStepPercent(rows.filter((row) => row.node === "platform")));
    const queued = rows.filter((row) => row.status === "queued").sort((a, b) => a.sortOrder - b.sortOrder);
    assert.deepEqual(
      queued.map((row) => row.id),
      ["platform-system-map", "platform-public-mode"],
    );
    assert.equal(board.groups.find((group) => group.node === "crypto")?.active[0]?.id, "crypto-open");
    assert.equal(board.groups.some((group) => group.node === "youtube"), false);
    assert.equal(formatUpdatedCt("2026-10-08T17:00:00.000Z"), "Oct 8");
    assert.equal(formatUpdatedCt("2026-10-09T05:00:00.000Z"), "Oct 9");
  });
});

describe("build items api", { concurrency: false }, () => {
  const previous = envSnapshot();
  let token = "";

  after(() => {
    restore(previous);
    setSqlClientForTests(null);
    setGithubPullLoaderForTests(null);
  });

  beforeEach(async () => {
    process.env.DATABASE_URL = "postgres://resonance:resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "hash";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-tests";
    process.env.RESONANCE_SYNC_SECRET = "hub-secret";
    setGithubPullLoaderForTests(async (): Promise<GithubPullLoad> => ({ pulls: [], fresh: true }));
    setSqlClientForTests(memorySql());
    await migrate();
    token = await createSession("Mozilla/5.0 Chrome/120.0.0.0", t0);
  });

  it("seeds real percents, groups by node, and puts public mode after System Map", async () => {
    const response = await GET(
      new Request("https://resonance3.vercel.app/api/build/items", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    const platform = body.groups.find((group: { node: string }) => group.node === "platform");
    assert.ok(platform);
    const queued = platform.items.filter((row: { status: string }) => row.status === "queued");
    assert.equal(queued[0].id, "platform-system-map");
    assert.equal(queued[0].title, "System Map: nodes, money flow, data sources, agents, governance lens");
    assert.equal(queued[0].next_step, "Starts after Build Tracker merges");
    assert.equal(queued[1].id, "platform-public-mode");
    assert.equal(queued[1].title, "Public mode: a no-dollar screen-share toggle");
    assert.equal(queued[1].next_step, "Starts after System Map");
    assert.equal(queued[1].percent, 0);
    const runs = body.groups
      .flatMap((group: { items: { id: string; percent: number }[] }) => group.items)
      .find((row: { id: string }) => row.id === "fitness-runs");
    assert.equal(runs.percent, 83);
    const finance = body.groups
      .flatMap((group: { items: { id: string; percent: number; next_step: string }[] }) => group.items)
      .find((row: { id: string }) => row.id === "finance-private-node");
    assert.equal(finance.percent, 83);
    assert.equal(finance.next_step, "Finance Desk posts the first snapshot");
    const nodes = body.groups.map((group: { node: string }) => group.node);
    assert.deepEqual(nodes, [
      "platform",
      "crypto",
      "ai-stocks",
      "fitness",
      "finance",
      "fight-desk",
      "youtube",
    ]);
    const items = body.groups.flatMap((group: { items: BuildItem[] }) => group.items);
    const home = buildHomeCard(
      items.map((row: {
        id: string;
        title: string;
        node: BuildItem["node"];
        pr_number: number | null;
        status: BuildItem["status"];
        steps: BuildItem["steps"];
        next_step: string | null;
        sort_order: number;
        updated_at: string;
      }) => ({
        id: row.id,
        title: row.title,
        node: row.node,
        prNumber: row.pr_number,
        status: row.status,
        steps: row.steps,
        nextStep: row.next_step,
        sortOrder: row.sort_order,
        updatedAt: row.updated_at,
      })),
    );
    const pwa = body.groups
      .flatMap((group: { items: { id: string; status: string; pr_number: number | null; percent: number; steps: { id: string; done: boolean }[] }[] }) => group.items)
      .find((row: { id: string }) => row.id === "platform-pwa");
    assert.equal(pwa.status, "live");
    assert.equal(pwa.pr_number, 76);
    assert.equal(pwa.percent, 80);
    assert.equal(pwa.steps.find((step: { id: string }) => step.id === "merged").done, true);
    assert.equal(pwa.steps.find((step: { id: string }) => step.id === "verified-prod").done, false);
    assert.equal(home.lines[0], "2 in progress");
    assert.equal(home.lines[1], "Next: System Map: nodes, money flow, data sources, agents, governance lens");
    assert.equal(home.percentLabel, `${body.total_percent}%`);
    assert.equal(JSON.stringify(body).includes("GITHUB_TOKEN"), false);
  });

  it("rejects a session write and an anonymous call, and accepts the sync bearer", async () => {
    const url = "https://resonance3.vercel.app/api/build/items";
    const anonymous = await GET(new Request(url));
    assert.equal(anonymous.status, 401);
    const bearerRead = await GET(new Request(url, { headers: { authorization: "Bearer hub-secret" } }));
    assert.equal(bearerRead.status, 200);

    const sessionWrite = await POST(
      new Request(url, {
        method: "POST",
        headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ title: "Nope", node: "platform" }),
      }),
    );
    assert.equal(sessionWrite.status, 401);

    const missing = await POST(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Nope", node: "platform" }),
      }),
    );
    assert.equal(missing.status, 401);

    const sessionPatch = await PATCH(
      new Request(url, {
        method: "PATCH",
        headers: { cookie: `${SESSION_COOKIE}=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ id: "platform-system-map", next_step: "nope" }),
      }),
    );
    assert.equal(sessionPatch.status, 401);

    const created = await POST(
      new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify({
          id: "platform-example",
          title: "Example queued item",
          node: "platform",
          status: "queued",
          next_step: "Write the spec",
        }),
      }),
    );
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.item.percent, 0);
    assert.equal(createdBody.item.steps.length, 5);

    const patched = await PATCH(
      new Request(url, {
        method: "PATCH",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify({
          id: "platform-example",
          next_step: "Open the draft",
          steps: [{ id: "spec", done: true }],
        }),
      }),
    );
    assert.equal(patched.status, 200);
    const patchedBody = await patched.json();
    assert.equal(patchedBody.item.next_step, "Open the draft");
    assert.equal(patchedBody.item.percent, 20);
    assert.equal(patchedBody.item.steps.find((step: { id: string }) => step.id === "pr-open").done, false);

    const again = await POST(
      new Request(url, {
        method: "POST",
        headers: { authorization: "Bearer hub-secret", "content-type": "application/json" },
        body: JSON.stringify({ id: "platform-example", title: "Example queued item", node: "platform" }),
      }),
    );
    assert.equal(again.status, 409);
  });

  it("keeps the last stored steps when GitHub is rate-limited", async () => {
    setGithubPullLoaderForTests(async () => ({ pulls: [], fresh: false }));
    const response = await GET(
      new Request("https://resonance3.vercel.app/api/build/items", {
        headers: { authorization: "Bearer hub-secret" },
      }),
    );
    const body = await response.json();
    assert.equal(body.github, "stored");
    const tracker = body.groups
      .flatMap((group: { items: { id: string; percent: number }[] }) => group.items)
      .find((row: { id: string }) => row.id === "platform-build-tracker");
    assert.equal(tracker.percent, 20);
    const count = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM build_items`);
    assert.equal(Number(count[0]?.n), 26);
  });
});
