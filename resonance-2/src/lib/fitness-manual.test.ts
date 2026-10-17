import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, isValidElement, type ReactNode } from "react";
import { newDb } from "pg-mem";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/fitness/manual/route";
import { FitnessDetail } from "@/components/fitness-detail";
import { SESSION_COOKIE } from "@/lib/auth-core";
import { createSession } from "@/lib/auth-store";
import { fitnessCards, fitnessNode, metricSamples, workoutSamples } from "@/lib/fitness-board";
import {
  canonicalManualValue,
  latestManualPeriod,
  manualImportCard,
  manualImportDetail,
  parseManualImport,
  withManualImportCard,
  type ManualSummary,
} from "@/lib/fitness-manual";
import { loadFitnessManual } from "@/lib/fitness-manual-store";
import { loadFitnessCards, loadFitnessHome, resetFitnessStoreForTests } from "@/lib/fitness-store";
import { manualFitnessSeed } from "@/lib/fitness-seed";
import { setSqlClientForTests, sqlQuery, type SqlClient } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { migrate } from "@/lib/pg/migrate";
import { proxy } from "@/proxy";
import { PUBLIC_MODE_COOKIE } from "@/lib/public-mode";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SECRET = "fitness-manual-sync-secret";
const PHONE = "phone-token";

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
  return originalLoad(request, parent, isMain);
};

function render(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => render(child)).join("");
  if (!isValidElement(node)) return "";
  const type = node.type;
  if (typeof type === "function") return render((type as (props: unknown) => ReactNode)(node.props));
  const props = node.props as { children?: ReactNode; href?: string };
  const href = typeof props.href === "string" ? props.href : "";
  return `${href}${render(props.children)}`;
}

function summary(partial: Partial<ManualSummary> & Pick<ManualSummary, "id" | "app" | "metric">): ManualSummary {
  return {
    entryDate: "2026-10-12",
    periodStart: "2026-10-06",
    periodEnd: "2026-10-12",
    value: "4",
    unit: "count",
    approx: false,
    note: null,
    source: "manual-import",
    createdAt: "2026-10-12T15:00:00.000Z",
    ...partial,
  };
}

const week = {
  entry_date: "2026-10-12",
  period_start: "2026-10-06",
  period_end: "2026-10-12",
  app: "Strong",
  metric: "sessions",
  value: 4,
  unit: "count",
};

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
    FITNESS_INGEST_TOKEN: process.env.FITNESS_INGEST_TOKEN,
  };
}

function restore(previous: ReturnType<typeof envSnapshot>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("fitness manual copy", () => {
  it("shows the latest period, labels it manual, and hides dollars in public mode", async () => {
    const { FitnessGrid } = await import("@/components/fitness-grid");
    const entries = [
      summary({ id: "old", app: "Strong", metric: "sessions", periodStart: "2026-09-01", periodEnd: "2026-09-07", value: "9" }),
      summary({ id: "sessions", app: "Strong", metric: "sessions", value: "4", unit: "count" }),
      summary({
        id: "distance",
        app: "Nike Run Club",
        metric: "distance",
        value: "12.40",
        unit: "mi",
        approx: true,
        note: "dues $20",
      }),
    ];
    assert.equal(canonicalManualValue("12.40"), "12.4");
    assert.deepEqual(
      latestManualPeriod(entries).map((entry) => entry.id),
      ["distance", "sessions"],
    );
    const card = manualImportCard(entries, { publicMode: false });
    assert.equal(card.title, "Manual import");
    assert.equal(card.href, "/n/fitness/manual");
    assert.equal(card.headline, "6 Oct–12 Oct");
    assert.match(card.detail ?? "", /4 count/);
    assert.match(card.detail ?? "", /Strong/);
    assert.match(card.detail ?? "", /12\.4 mi/);
    assert.match(card.detail ?? "", /manual/);
    assert.match(card.detail ?? "", /approx/);
    assert.equal((card.detail ?? "").includes("9 count"), false);
    const privateDetail = manualImportDetail(entries, { publicMode: false });
    const distance = privateDetail.rows.find((row) => row.id === "distance");
    assert.match(distance?.secondary ?? "", /manual/);
    assert.match(distance?.secondary ?? "", /approx/);
    assert.match(distance?.secondary ?? "", /\$20/);
    assert.equal(privateDetail.rows.some((row) => row.primary.includes("9")), false);

    const hidden = manualImportCard(entries, { publicMode: true });
    const hiddenDetail = manualImportDetail(entries, { publicMode: true });
    const html = render(
      createElement(
        "div",
        null,
        createElement(FitnessGrid, { cards: [hidden] }),
        createElement(FitnessDetail, { detail: hiddenDetail }),
      ),
    );
    assert.match(html, /Manual import/);
    assert.match(html, /\/n\/fitness\/manual/);
    assert.match(html, /manual/);
    assert.match(html, /approx/);
    assert.match(html, /12\.4 mi/);
    assert.equal(html.includes("$"), false);
    assert.equal(html.includes("dues"), true);
    assert.equal(html.includes("not recorded"), false);

    const empty = manualImportDetail([], { publicMode: false });
    const emptyHtml = render(createElement(FitnessDetail, { detail: empty }));
    assert.match(emptyHtml, /not recorded/);
    assert.equal(empty.rows.length, 0);
    assert.equal(empty.headline, null);

    const seed = manualFitnessSeed();
    const metrics = metricSamples(seed.metrics);
    const workouts = workoutSamples(seed.workouts);
    const board = fitnessCards(metrics, workouts, "2026-10-07");
    assert.equal(board.find((item) => item.id === "manual")?.headline, null);
    assert.equal(board.find((item) => item.id === "manual")?.detail, "not recorded");
    assert.equal(board.find((item) => item.id === "steps")?.headline, "21,608");
    assert.equal(fitnessNode("manual", metrics, workouts, "2026-10-07"), null);
    const merged = withManualImportCard(board, entries, { publicMode: true });
    assert.equal(merged.find((item) => item.id === "steps")?.headline, "21,608");
    assert.equal(merged.find((item) => item.id === "manual")?.headline, "6 Oct–12 Oct");
    assert.equal((merged.find((item) => item.id === "manual")?.detail ?? "").includes("$"), false);
  });

  it("accepts one entry or an array and rejects a bad period", () => {
    const one = parseManualImport(week);
    assert.equal(one.ok, true);
    if (!one.ok) return;
    assert.equal(one.entries[0]?.source, "manual-import");
    assert.equal(one.entries[0]?.approx, false);
    assert.equal(one.entries[0]?.value, "4");

    const many = parseManualImport([
      week,
      { ...week, app: "Nike Run Club", metric: "distance", value: "12.4", unit: "mi", approx: true },
    ]);
    assert.equal(many.ok, true);
    if (!many.ok) return;
    assert.equal(many.entries.length, 2);
    assert.equal(many.entries[1]?.approx, true);

    assert.equal(parseManualImport([]).ok, false);
    assert.equal(parseManualImport({ ...week, period_end: "2026-10-01" }).ok, false);
    assert.equal(parseManualImport({ ...week, value: "none" }).ok, false);
    assert.equal(parseManualImport({ ...week, approx: "yes" }).ok, false);
    assert.equal(parseManualImport({ ...week, entry_date: "10/12/2026" }).ok, false);
  });

  it("keeps the manual table out of the daily and run readers", () => {
    const store = readFileSync(path.join(root, "src/lib/fitness-store.ts"), "utf8");
    const board = readFileSync(path.join(root, "src/lib/fitness-board.ts"), "utf8");
    assert.equal(store.includes("fitness_manual_summaries"), false);
    assert.equal(board.includes("fitness_manual_summaries"), false);
    const file = readFileSync(path.join(root, "db/migrations/031_fitness_manual_summaries.sql"), "utf8");
    const embedded = EMBEDDED_MIGRATIONS.find((entry) => entry.id === "031_fitness_manual_summaries");
    assert.equal(embedded?.sql, file);
    assert.match(file, /UNIQUE \(period_start, period_end, app, metric\)/);
    assert.equal(file.includes("INSERT INTO fitness_metrics"), false);
    assert.equal(file.includes("INSERT INTO fitness_nrc_runs"), false);
    const parent = readFileSync(path.join(root, "src/app/n/[parent]/page.tsx"), "utf8");
    const fitness = parent.slice(parent.indexOf('parent.id === "fitness"'));
    assert.match(fitness, /withManualImportCard/);
    assert.match(fitness, /publicMode/);
    assert.ok(fitness.indexOf('await requireRole("owner")') < fitness.indexOf("loadFitnessCards"));
    const node = readFileSync(path.join(root, "src/app/n/[parent]/[node]/page.tsx"), "utf8");
    assert.match(node, /nodeId === "manual"/);
    assert.match(node, /manualImportDetail/);
    const cabinet = readFileSync(path.join(root, "cabinet/fitness-manual.md"), "utf8");
    assert.match(cabinet, /POST \/api\/fitness\/manual/);
    assert.match(cabinet, /GET \/api\/fitness\/manual/);
    assert.match(cabinet, /RESONANCE_SYNC_SECRET/);
    assert.match(cabinet, /not recorded/);
    assert.match(cabinet, /never feed/);
  });
});

describe("fitness manual route", { concurrency: false }, () => {
  const previous = envSnapshot();
  let token = "";

  before(async () => {
    process.env.DATABASE_URL = "postgres://resonance@127.0.0.1:5432/resonance";
    process.env.AUTH_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$dummy";
    process.env.AUTH_TOTP_SECRET = "JBSWY3DPEHPK3PXP";
    process.env.AUTH_SESSION_SECRET = "session-secret-for-fitness-manual-tests";
    process.env.RESONANCE_SYNC_SECRET = SECRET;
    process.env.FITNESS_INGEST_TOKEN = PHONE;
    setSqlClientForTests(memorySql());
    resetFitnessStoreForTests();
    await migrate();
    token = await createSession("fitness-manual-test");
  });

  beforeEach(async () => {
    await sqlQuery(`DELETE FROM fitness_manual_summaries`);
  });

  after(() => {
    setSqlClientForTests(null);
    resetFitnessStoreForTests();
    restore(previous);
  });

  function post(body: unknown, headers: Record<string, string> = {}) {
    return POST(
      new Request("https://resonance3.vercel.app/api/fitness/manual", {
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

  it("upserts one entry or an array and leaves daily and run totals alone", async () => {
    const closed = await POST(
      new Request("https://resonance3.vercel.app/api/fitness/manual", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${PHONE}` },
        body: JSON.stringify(week),
      }),
    );
    assert.equal(closed.status, 401);

    const cookieWrite = await POST(
      new Request("https://resonance3.vercel.app/api/fitness/manual", {
        method: "POST",
        headers: {
          host: "resonance3.vercel.app",
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=${token}`,
        },
        body: JSON.stringify(week),
      }),
    );
    assert.equal(cookieWrite.status, 401);

    const home = await loadFitnessHome("2026-10-07");
    assert.deepEqual(home.line, { value: "3.9", unit: "mi this week" });
    const stepsBefore = await sqlQuery<{ n: string; qty: string }>(
      `SELECT count(*)::text AS n, coalesce(max(qty)::text, '0') AS qty FROM fitness_metrics`,
    );
    const runsBefore = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fitness_workouts`);
    const nrcBefore = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fitness_nrc_runs`);

    const created = await post(week);
    assert.equal(created.status, 200);
    const createdBody = (await created.json()) as {
      upserted: number;
      entries: { id: string; value: string; source: string; approx: boolean }[];
    };
    assert.equal(createdBody.upserted, 1);
    assert.equal(createdBody.entries[0]?.value, "4");
    assert.equal(createdBody.entries[0]?.source, "manual-import");
    assert.equal(createdBody.entries[0]?.approx, false);
    const createdId = createdBody.entries[0]?.id;

    const again = await post({ ...week, value: "5", note: "corrected", entry_date: "2026-10-13" });
    assert.equal(again.status, 200);
    const againBody = (await again.json()) as { entries: { id: string; value: string; note: string }[] };
    assert.equal(againBody.entries[0]?.id, createdId);
    assert.equal(againBody.entries[0]?.value, "5");
    assert.equal(againBody.entries[0]?.note, "corrected");
    const count = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fitness_manual_summaries`);
    assert.equal(count[0]?.n, "1");

    const batch = await post([
      { ...week, value: 4 },
      {
        entry_date: "2026-10-12",
        period_start: "2026-10-06",
        period_end: "2026-10-12",
        app: "Nike Run Club",
        metric: "distance",
        value: "100.0",
        unit: "mi",
        approx: true,
        note: "dues $20",
      },
    ]);
    assert.equal(batch.status, 200);
    assert.equal(((await batch.json()) as { upserted: number }).upserted, 2);
    const stored = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fitness_manual_summaries`);
    assert.equal(stored[0]?.n, "2");

    const stepsAfter = await sqlQuery<{ n: string; qty: string }>(
      `SELECT count(*)::text AS n, coalesce(max(qty)::text, '0') AS qty FROM fitness_metrics`,
    );
    const runsAfter = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fitness_workouts`);
    const nrcAfter = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fitness_nrc_runs`);
    assert.deepEqual(stepsAfter, stepsBefore);
    assert.deepEqual(runsAfter, runsBefore);
    assert.deepEqual(nrcAfter, nrcBefore);
    const homeAfter = await loadFitnessHome("2026-10-07");
    assert.deepEqual(homeAfter.line, { value: "3.9", unit: "mi this week" });
    const cards = await loadFitnessCards("2026-10-07");
    assert.equal(cards.cards.find((card) => card.id === "runs")?.headline, "3.9 mi");
    assert.equal(cards.cards.find((card) => card.id === "steps")?.headline, "21,608");
    assert.equal(cards.cards.find((card) => card.id === "manual")?.headline, null);

    const loaded = await loadFitnessManual();
    const face = manualImportCard(loaded.entries, { publicMode: false });
    assert.match(face.detail ?? "", /100 mi/);
    assert.match(face.detail ?? "", /approx/);
    assert.match(face.detail ?? "", /manual/);
    assert.equal(face.headline, "6 Oct–12 Oct");
    const detail = manualImportDetail(loaded.entries, { publicMode: true });
    const html = render(createElement(FitnessDetail, { detail }));
    assert.match(html, /manual/);
    assert.match(html, /approx/);
    assert.equal(html.includes("$"), false);

    const rejected = await post({ ...week, period_end: "2026-10-05" });
    assert.equal(rejected.status, 400);
    const still = await sqlQuery<{ n: string }>(`SELECT count(*)::text AS n FROM fitness_manual_summaries`);
    assert.equal(still[0]?.n, "2");
  });

  it("reads with the sync bearer or the owner session and strips dollars in public mode", async () => {
    await post({ ...week, app: "Notes", metric: "dues", value: 20, unit: "$", note: "paid $20" });
    const signedOut = await GET(new Request("https://resonance3.vercel.app/api/fitness/manual"));
    assert.equal(signedOut.status, 401);

    const bearer = await GET(
      new Request("https://resonance3.vercel.app/api/fitness/manual", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    assert.equal(bearer.status, 200);
    const bearerText = JSON.stringify(await bearer.json());
    assert.match(bearerText, /\$20/);

    const owner = await GET(
      new Request("https://resonance3.vercel.app/api/fitness/manual", {
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
    );
    assert.equal(owner.status, 200);
    const ownerBody = (await owner.json()) as { count: number };
    assert.equal(ownerBody.count, 1);

    const hidden = await GET(
      new Request("https://resonance3.vercel.app/api/fitness/manual", {
        headers: { cookie: `${SESSION_COOKIE}=${token}; ${PUBLIC_MODE_COOKIE}=1` },
      }),
    );
    assert.equal(hidden.status, 200);
    const hiddenText = JSON.stringify(await hidden.json());
    assert.equal(hiddenText.includes("$"), false);
    assert.match(hiddenText, /"value":"20"/);

    const page = await proxy(new NextRequest("https://resonance3.vercel.app/n/fitness/manual"));
    assert.match(page.headers.get("location") ?? "", /\/login\?next=%2Fn%2Ffitness%2Fmanual$/);
    const again = await migrate();
    assert.equal(again.applied.includes("031_fitness_manual_summaries"), false);
    assert.equal(again.skipped.includes("031_fitness_manual_summaries"), true);
  });
});
