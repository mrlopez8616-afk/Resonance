import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { FINANCE_NODES } from "@/lib/finance/view";
import {
  bookHomeFace,
  buildHomeFace,
  fightHomeFace,
  financePublicHomeFace,
  type HomeFace,
} from "@/lib/home-faces";
import {
  HEALTH_TILES,
  healthPages,
  drillDownBroken,
  type HealthIssue,
  type PublicViewIssueId,
} from "@/lib/health-report";
import { financePageLocked, hasMoneyText, isHiddenInPublicMode, publicPayloadLeaks } from "@/lib/public-mode";
import { getSyncSecret, authorizeSyncAccess } from "@/lib/sync-auth-core";
import { proxy } from "@/proxy";

const ERROR_MARKERS = [
  "Application error",
  "Unhandled Runtime Error",
  "Internal Server Error",
  "ECONNREFUSED",
  "Cannot read properties",
  "is not defined",
];

const PRIVATE_KEY = /account|wallet|routing|address/i;
const WALLET = /\br[1-9A-HJ-NP-Za-km-z]{24,34}\b/;

type Handler = (request: Request) => Promise<Response>;

export type RouteAuditRow = {
  method: string;
  path: string;
  loggedOut: string;
  auth: string;
};

/**
 * Every API the floor ships. Logged-out expectations are what the probe checks.
 * Login and passkey verify are not called from the live probe: a failed attempt
 * records a lockout. The route-privacy test calls those two directly.
 */
export const ROUTE_AUDIT: readonly RouteAuditRow[] = [
  { method: "GET", path: "/api/approvals", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/approvals", loggedOut: "401", auth: "sync bearer" },
  { method: "POST", path: "/api/approvals/[id]/decision", loggedOut: "401", auth: "owner session" },
  { method: "POST", path: "/api/auth/login", loggedOut: "401", auth: "password and authenticator" },
  { method: "POST", path: "/api/auth/logout", loggedOut: "303", auth: "clears the presented cookie only" },
  { method: "POST", path: "/api/auth/logout-all", loggedOut: "401", auth: "owner session" },
  { method: "POST", path: "/api/auth/passkey/login/options", loggedOut: "401 or 503", auth: "passkey ceremony" },
  { method: "POST", path: "/api/auth/passkey/login/verify", loggedOut: "401", auth: "passkey ceremony" },
  { method: "POST", path: "/api/auth/passkey/register/options", loggedOut: "401", auth: "owner session" },
  { method: "POST", path: "/api/auth/passkey/register/verify", loggedOut: "401", auth: "owner session" },
  { method: "POST", path: "/api/auth/passkey/remove", loggedOut: "401", auth: "owner session" },
  { method: "GET", path: "/api/auth/renew", loggedOut: "303", auth: "session cookie" },
  { method: "GET", path: "/api/bets", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/bets", loggedOut: "401", auth: "sync bearer" },
  { method: "POST", path: "/api/bets/settle", loggedOut: "401", auth: "sync bearer" },
  { method: "POST", path: "/api/bets/stake", loggedOut: "401", auth: "sync bearer" },
  { method: "PATCH", path: "/api/bets/stake", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/build/items", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/build/items", loggedOut: "401", auth: "sync bearer" },
  { method: "PATCH", path: "/api/build/items", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/calendar", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/calendar", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/chain-security", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/chain-security", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/cron/backup", loggedOut: "401", auth: "CRON_SECRET or sync bearer" },
  { method: "POST", path: "/api/cron/backup", loggedOut: "401", auth: "CRON_SECRET or sync bearer" },
  { method: "POST", path: "/api/deposits/void", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/fights/bankroll", loggedOut: "401", auth: "sync bearer" },
  { method: "POST", path: "/api/fights/bankroll/deposit", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/fights/breakdown", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/fights/breakdown", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/fights/fighters/[slug]", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/fights/fighters", loggedOut: "401", auth: "sync bearer" },
  { method: "POST", path: "/api/fights/result", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/fills", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/fills", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/finance/snapshot", loggedOut: "401", auth: "owner session" },
  { method: "POST", path: "/api/finance/snapshot", loggedOut: "401 or 503", auth: "FINANCE_INGEST_TOKEN" },
  { method: "GET", path: "/api/fitness/manual", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/fitness/manual", loggedOut: "401", auth: "sync bearer" },
  { method: "POST", path: "/api/fitness/ingest", loggedOut: "401 or 503", auth: "fitness token" },
  { method: "POST", path: "/api/ingest/health-auto-export", loggedOut: "401 or 503", auth: "X-Resonance-Token" },
  { method: "POST", path: "/api/settings/health-auto-export-token", loggedOut: "401 or 403", auth: "owner session" },
  { method: "GET", path: "/api/fitness/runs", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/fitness/token", loggedOut: "401", auth: "owner session" },
  { method: "GET", path: "/api/health/full", loggedOut: "401", auth: "RESONANCE_HEALTH_TOKEN" },
  { method: "GET", path: "/api/ideas", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/ideas", loggedOut: "401", auth: "owner session" },
  { method: "PATCH", path: "/api/ideas", loggedOut: "401", auth: "owner session" },
  { method: "GET", path: "/api/lessons", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/lessons", loggedOut: "401", auth: "sync bearer" },
  { method: "PATCH", path: "/api/lessons", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/portfolio-mood", loggedOut: "401", auth: "session or sync bearer" },
  { method: "GET", path: "/api/roundtable", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/roundtable", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/roundtable/[id]", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/roundtable/[id]/reply", loggedOut: "401", auth: "owner session" },
  { method: "POST", path: "/api/settings/fitness-token", loggedOut: "401", auth: "owner session" },
  { method: "POST", path: "/api/settings/owner-pin", loggedOut: "401", auth: "owner session" },
  { method: "POST", path: "/api/settings/public-mode", loggedOut: "401", auth: "owner session" },
  { method: "GET", path: "/api/sleeves", loggedOut: "401", auth: "session or sync bearer" },
  { method: "GET", path: "/api/spot-price", loggedOut: "401", auth: "session or sync bearer" },
  { method: "POST", path: "/api/storage/import", loggedOut: "401", auth: "sync bearer" },
  { method: "POST", path: "/api/storage/migrate", loggedOut: "401", auth: "sync bearer" },
  { method: "GET", path: "/api/system/events", loggedOut: "401", auth: "owner session" },
  { method: "GET", path: "/api/xrp-price", loggedOut: "401", auth: "session or sync bearer" },
  { method: "GET", path: "/api/youtube/bricks", loggedOut: "401", auth: "owner session" },
  { method: "POST", path: "/api/youtube/bricks", loggedOut: "401", auth: "sync bearer" },
  { method: "PATCH", path: "/api/youtube/bricks", loggedOut: "401", auth: "sync bearer" },
];

function issue(id: PublicViewIssueId, name: string, path: string, status: "ok" | "error" = "error"): HealthIssue {
  return { id, name, status, path };
}

function settle(id: PublicViewIssueId, okName: string, failures: HealthIssue[]): HealthIssue[] {
  if (failures.length === 0) return [issue(id, okName, "", "ok")];
  return failures;
}

function privateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => privateKey(item));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => PRIVATE_KEY.test(key) || privateKey(child));
}

/** True when a logged-out body carries a dollar amount, a wallet, or a private field. */
export function payloadLeaksPrivate(text: string): boolean {
  if (hasMoneyText(text) || WALLET.test(text)) return true;
  try {
    const parsed = JSON.parse(text) as unknown;
    return publicPayloadLeaks(parsed).length > 0 || privateKey(parsed);
  } catch {
    return false;
  }
}

export function htmlHasErrorBoundary(text: string): boolean {
  return ERROR_MARKERS.some((marker) => text.includes(marker));
}

async function readResponse(run: () => Promise<Response>): Promise<{ status: number; text: string }> {
  try {
    const response = await run();
    return { status: response.status, text: await response.text() };
  } catch {
    return { status: 500, text: "" };
  }
}

function request(path: string, method = "GET"): Request {
  return new Request(`https://resonance3.vercel.app${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" || method === "HEAD" ? undefined : "{}",
  });
}

function financePages(): string[] {
  return ["/n/finance", ...FINANCE_NODES.map((node) => `/n/finance/${node.id}`)];
}

function tourPaths(): string[] {
  const paths = new Set<string>(["/", "/calendar", "/settings", "/tv", "/fights"]);
  for (const target of [...HEALTH_TILES, ...healthPages()]) {
    if (financePageLocked(target.path) || isHiddenInPublicMode(target.path)) continue;
    paths.add(target.path);
  }
  return [...paths];
}

function financeLockIssues(): HealthIssue[] {
  const face = financePublicHomeFace({ accountCount: 9, asOfLine: "as of Oct 8, 2026" });
  const tile: HealthIssue[] = [];
  const href: HealthIssue[] = [];
  if (face.id !== "finance" || face.name !== "Finance" || hasMoneyText(`${face.headline} ${face.status}`)) {
    tile.push(issue("finance-lock-tile", "Finance tile is missing from the public floor", "/"));
  }
  if (face.href || face.locked !== true) {
    href.push(issue("finance-lock-href", "Finance tile still has a link", face.href || "/n/finance"));
  }
  const faceSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../components/node-face.tsx"),
    "utf8",
  );
  if (!faceSource.includes("data-lock-badge") || !faceSource.includes("face.locked")) {
    tile.push(issue("finance-lock-tile", "Finance tile is missing its Private lock", "/"));
  }
  if (!faceSource.includes("!locked")) {
    href.push(issue("finance-lock-href", "Finance tile can still render a link", "/"));
  }
  const others = otherPublicLinks();
  const drills: HealthIssue[] = [];
  for (const link of others) {
    if (!link.href || drillDownBroken(link.href, "public")) {
      drills.push(issue("public-drill-down", `Public ${link.name} does not open`, link.href || "/"));
    }
  }
  return [
    ...settle("finance-lock-tile", "Finance tile stays on the public floor", tile),
    ...settle("finance-lock-href", "Finance tile has no link", href),
    ...drills,
  ];
}

function otherPublicLinks(): HomeFace[] {
  return [
    bookHomeFace({
      id: "crypto",
      name: "Crypto",
      href: "/n/crypto",
      publicMode: true,
      summary: null,
      connected: false,
      mover: null,
    }),
    bookHomeFace({
      id: "ai-stocks",
      name: "AI Stocks",
      href: "/n/ai-stocks",
      publicMode: true,
      summary: null,
      connected: false,
      mover: null,
    }),
    buildHomeFace({ unavailable: false, percentLabel: "40%", lines: ["platform"], publicMode: true }),
    fightHomeFace({ publicMode: true, headline: null, priceLine: null, record: "4-1" }) ??
      bookHomeFace({
        id: "crypto",
        name: "Fight Desk",
        href: "/n/fight-desk",
        publicMode: true,
        summary: null,
        connected: false,
        mover: null,
      }),
  ];
}

function drillIssues(): HealthIssue[] {
  const failures: HealthIssue[] = [];
  for (const target of [...HEALTH_TILES, ...healthPages()]) {
    if (financePageLocked(target.path)) {
      if (drillDownBroken(target.path, "public")) {
        failures.push(
          issue("public-drill-down", `Finance lock was reported as a broken drill-down`, target.path),
        );
      }
      continue;
    }
    if (drillDownBroken(target.path, "private") || drillDownBroken(target.path, "public")) {
      failures.push(issue("public-drill-down", `Drill-down does not resolve for ${target.path}`, target.path));
    }
  }
  return failures;
}

async function pageStatusIssues(): Promise<HealthIssue[]> {
  const status: HealthIssue[] = [];
  const errors: HealthIssue[] = [];
  for (const path of tourPaths()) {
    const response = await readResponse(() => proxy(new NextRequest(`https://resonance3.vercel.app${path}`)));
    const redirect = response.status === 302 || response.status === 303 || response.status === 307;
    if (htmlHasErrorBoundary(response.text) || (response.status === 200 && payloadLeaksPrivate(response.text))) {
      errors.push(issue("public-page-error", `Public page ${path} shows an error`, path));
    }
    if (response.status === 200 || redirect) continue;
    status.push(issue("public-page-status", `Public page ${path} returned ${response.status}`, path));
  }
  return [
    ...settle("public-page-status", "Public pages answer", status),
    ...settle("public-page-error", "Public pages show no error boundary", errors),
  ];
}

async function financeLoggedOutIssues(): Promise<HealthIssue[]> {
  const pages: HealthIssue[] = [];
  for (const path of financePages()) {
    const response = await readResponse(() => proxy(new NextRequest(`https://resonance3.vercel.app${path}`)));
    const location = response.status === 307 || response.status === 302 || response.status === 303;
    const closed = response.status === 401 || response.status === 403 || response.status === 404;
    if ((!location && !closed) || payloadLeaksPrivate(response.text)) {
      pages.push(issue("finance-logged-out-page", `Logged-out ${path} returned Finance data`, path));
    }
  }
  const finance = await import("@/app/api/finance/snapshot/route");
  const apis: HealthIssue[] = [];
  for (const [method, call] of [
    ["GET", finance.GET],
    ["POST", finance.POST],
  ] as const) {
    const response = await readResponse(() => call(request("/api/finance/snapshot", method)));
    const closed = response.status === 401 || response.status === 403 || response.status === 503;
    if (!closed || payloadLeaksPrivate(response.text) || response.text.includes("snapshot")) {
      apis.push(
        issue("finance-logged-out-api", `Logged-out ${method} /api/finance/snapshot returned Finance data`, "/api/finance/snapshot"),
      );
    }
  }
  return [
    ...settle("finance-logged-out-page", "Logged-out Finance pages return no data", pages),
    ...settle("finance-logged-out-api", "Logged-out Finance APIs return no data", apis),
  ];
}

const SYNC_WRITES = new Set([
  "POST /api/approvals",
  "POST /api/bets",
  "POST /api/bets/settle",
  "POST /api/bets/stake",
  "PATCH /api/bets/stake",
  "POST /api/build/items",
  "PATCH /api/build/items",
  "POST /api/calendar",
  "POST /api/chain-security",
  "POST /api/deposits/void",
  "POST /api/fights/bankroll/deposit",
  "POST /api/fights/breakdown",
  "POST /api/fights/fighters",
  "POST /api/fights/result",
  "POST /api/fills",
  "POST /api/fitness/manual",
  "POST /api/lessons",
  "PATCH /api/lessons",
  "POST /api/roundtable",
  "POST /api/storage/import",
  "POST /api/storage/migrate",
  "POST /api/youtube/bricks",
  "PATCH /api/youtube/bricks",
  "GET /api/cron/backup",
  "POST /api/cron/backup",
  "GET /api/fights/bankroll",
]);

function closedWrite(status: number, path: string): boolean {
  if (path === "/api/auth/passkey/login/options") {
    return status === 200 || status === 400 || status === 401 || status === 503;
  }
  return status === 401 || status === 403 || status === 503;
}

async function securityIssues(): Promise<HealthIssue[]> {
  const handlers = await loadHandlers();
  const dollars: HealthIssue[] = [];
  const writes: HealthIssue[] = [];
  const syncOpen = authorizeSyncAccess({ syncSecret: getSyncSecret(), bearer: null }).ok;

  for (const row of handlers.reads) {
    const response = await readResponse(() => row.call(request(row.path)));
    const closed =
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 302 ||
      response.status === 303 ||
      response.status === 307;
    if (payloadLeaksPrivate(response.text) || !closed) {
      dollars.push(
        issue(
          "logged-out-dollar-fields",
          payloadLeaksPrivate(response.text)
            ? `Logged-out GET ${row.path} exposes dollar fields`
            : `Logged-out GET ${row.path} returned ${response.status}`,
          row.path,
        ),
      );
    }
  }

  for (const row of handlers.writes) {
    const key = `${row.method} ${row.path}`;
    if (syncOpen && SYNC_WRITES.has(key)) {
      writes.push(issue("logged-out-write-open", `Logged-out ${row.method} ${row.path} is open`, row.path));
      continue;
    }
    const response = await readResponse(() => row.call(request(row.path, row.method)));
    if (payloadLeaksPrivate(response.text) || !closedWrite(response.status, row.path)) {
      writes.push(
        issue("logged-out-write-open", `Logged-out ${row.method} ${row.path} returned ${response.status}`, row.path),
      );
    }
  }

  return [
    ...settle("logged-out-dollar-fields", "Logged-out reads expose no dollar fields", dollars),
    ...settle("logged-out-write-open", "Logged-out writes are rejected", writes),
  ];
}

async function loadHandlers(): Promise<{
  reads: { path: string; call: Handler }[];
  writes: { method: string; path: string; call: Handler }[];
}> {
  const [
    approvals,
    decision,
    logoutAll,
    passkeyOptions,
    passkeyRegister,
    passkeyVerifyReg,
    passkeyRemove,
    renew,
    bets,
    settle,
    stake,
    build,
    calendar,
    chain,
    backup,
    deposits,
    bankroll,
    deposit,
    breakdown,
    fighter,
    fighters,
    result,
    fills,
    finance,
    manual,
    ingest,
    healthAuto,
    healthAutoToken,
    runs,
    fitnessToken,
    health,
    ideas,
    lessons,
    mood,
    roundtable,
    thread,
    reply,
    settingsToken,
    ownerPin,
    publicMode,
    sleeves,
    spot,
    storageImport,
    storageMigrate,
    events,
    xrp,
    bricks,
  ] = await Promise.all([
    import("@/app/api/approvals/route"),
    import("@/app/api/approvals/[id]/decision/route"),
    import("@/app/api/auth/logout-all/route"),
    import("@/app/api/auth/passkey/login/options/route"),
    import("@/app/api/auth/passkey/register/options/route"),
    import("@/app/api/auth/passkey/register/verify/route"),
    import("@/app/api/auth/passkey/remove/route"),
    import("@/app/api/auth/renew/route"),
    import("@/app/api/bets/route"),
    import("@/app/api/bets/settle/route"),
    import("@/app/api/bets/stake/route"),
    import("@/app/api/build/items/route"),
    import("@/app/api/calendar/route"),
    import("@/app/api/chain-security/route"),
    import("@/app/api/cron/backup/route"),
    import("@/app/api/deposits/void/route"),
    import("@/app/api/fights/bankroll/route"),
    import("@/app/api/fights/bankroll/deposit/route"),
    import("@/app/api/fights/breakdown/route"),
    import("@/app/api/fights/fighters/[slug]/route"),
    import("@/app/api/fights/fighters/route"),
    import("@/app/api/fights/result/route"),
    import("@/app/api/fills/route"),
    import("@/app/api/finance/snapshot/route"),
    import("@/app/api/fitness/manual/route"),
    import("@/app/api/fitness/ingest/route"),
    import("@/app/api/ingest/health-auto-export/route"),
    import("@/app/api/settings/health-auto-export-token/route"),
    import("@/app/api/fitness/runs/route"),
    import("@/app/api/fitness/token/route"),
    import("@/app/api/health/full/route"),
    import("@/app/api/ideas/route"),
    import("@/app/api/lessons/route"),
    import("@/app/api/portfolio-mood/route"),
    import("@/app/api/roundtable/route"),
    import("@/app/api/roundtable/[id]/route"),
    import("@/app/api/roundtable/[id]/reply/route"),
    import("@/app/api/settings/fitness-token/route"),
    import("@/app/api/settings/owner-pin/route"),
    import("@/app/api/settings/public-mode/route"),
    import("@/app/api/sleeves/route"),
    import("@/app/api/spot-price/route"),
    import("@/app/api/storage/import/route"),
    import("@/app/api/storage/migrate/route"),
    import("@/app/api/system/events/route"),
    import("@/app/api/xrp-price/route"),
    import("@/app/api/youtube/bricks/route"),
  ]);

  const threadGet: Handler = (incoming) => thread.GET(incoming, { params: Promise.resolve({ id: "rt-example" }) });
  const replyPost: Handler = (incoming) => reply.POST(incoming, { params: Promise.resolve({ id: "rt-example" }) });
  const decisionPost: Handler = (incoming) =>
    decision.POST(incoming, { params: Promise.resolve({ id: "appr_example" }) });
  const fighterGet: Handler = (incoming) =>
    fighter.GET(incoming, { params: Promise.resolve({ slug: "example-fighter" }) });

  return {
    reads: [
      { path: "/api/approvals", call: approvals.GET },
      { path: "/api/auth/renew", call: renew.GET },
      { path: "/api/bets", call: bets.GET },
      { path: "/api/build/items", call: build.GET },
      { path: "/api/calendar", call: calendar.GET },
      { path: "/api/chain-security", call: chain.GET },
      { path: "/api/fights/breakdown", call: breakdown.GET },
      { path: "/api/fights/fighters/example-fighter", call: fighterGet },
      { path: "/api/fills", call: fills.GET },
      { path: "/api/finance/snapshot", call: finance.GET },
      { path: "/api/fitness/manual", call: manual.GET },
      { path: "/api/fitness/runs", call: runs.GET },
      { path: "/api/health/full", call: health.GET },
      { path: "/api/ideas", call: ideas.GET },
      { path: "/api/lessons", call: lessons.GET },
      { path: "/api/portfolio-mood", call: mood.GET },
      { path: "/api/roundtable", call: roundtable.GET },
      { path: "/api/roundtable/rt-example", call: threadGet },
      { path: "/api/sleeves", call: sleeves.GET },
      { path: "/api/spot-price", call: spot.GET },
      { path: "/api/system/events", call: events.GET },
      { path: "/api/xrp-price", call: xrp.GET },
      { path: "/api/youtube/bricks", call: bricks.GET },
    ],
    writes: [
      { method: "POST", path: "/api/approvals", call: approvals.POST },
      { method: "POST", path: "/api/approvals/appr_example/decision", call: decisionPost },
      { method: "POST", path: "/api/auth/logout-all", call: logoutAll.POST },
      { method: "POST", path: "/api/auth/passkey/login/options", call: passkeyOptions.POST },
      { method: "POST", path: "/api/auth/passkey/register/options", call: passkeyRegister.POST },
      { method: "POST", path: "/api/auth/passkey/register/verify", call: passkeyVerifyReg.POST },
      { method: "POST", path: "/api/auth/passkey/remove", call: passkeyRemove.POST },
      { method: "POST", path: "/api/bets", call: bets.POST },
      { method: "POST", path: "/api/bets/settle", call: settle.POST },
      { method: "POST", path: "/api/bets/stake", call: stake.POST },
      { method: "PATCH", path: "/api/bets/stake", call: stake.PATCH },
      { method: "POST", path: "/api/build/items", call: build.POST },
      { method: "PATCH", path: "/api/build/items", call: build.PATCH },
      { method: "POST", path: "/api/calendar", call: calendar.POST },
      { method: "POST", path: "/api/chain-security", call: chain.POST },
      { method: "GET", path: "/api/cron/backup", call: backup.GET },
      { method: "POST", path: "/api/cron/backup", call: backup.POST },
      { method: "POST", path: "/api/deposits/void", call: deposits.POST },
      { method: "GET", path: "/api/fights/bankroll", call: bankroll.GET },
      { method: "POST", path: "/api/fights/bankroll/deposit", call: deposit.POST },
      { method: "POST", path: "/api/fights/breakdown", call: breakdown.POST },
      { method: "POST", path: "/api/fights/fighters", call: fighters.POST },
      { method: "POST", path: "/api/fights/result", call: result.POST },
      { method: "POST", path: "/api/fills", call: fills.POST },
      { method: "POST", path: "/api/finance/snapshot", call: finance.POST },
      { method: "POST", path: "/api/fitness/manual", call: manual.POST },
      { method: "POST", path: "/api/fitness/ingest", call: ingest.POST },
      { method: "POST", path: "/api/ingest/health-auto-export", call: healthAuto.POST },
      { method: "POST", path: "/api/settings/health-auto-export-token", call: healthAutoToken.POST },
      { method: "POST", path: "/api/fitness/token", call: fitnessToken.POST },
      { method: "POST", path: "/api/ideas", call: ideas.POST },
      { method: "PATCH", path: "/api/ideas", call: ideas.PATCH },
      { method: "POST", path: "/api/lessons", call: lessons.POST },
      { method: "PATCH", path: "/api/lessons", call: lessons.PATCH },
      { method: "POST", path: "/api/roundtable", call: roundtable.POST },
      { method: "POST", path: "/api/roundtable/rt-example/reply", call: replyPost },
      { method: "POST", path: "/api/settings/fitness-token", call: settingsToken.POST },
      { method: "POST", path: "/api/settings/owner-pin", call: ownerPin.POST },
      { method: "POST", path: "/api/settings/public-mode", call: publicMode.POST },
      { method: "POST", path: "/api/storage/import", call: storageImport.POST },
      { method: "POST", path: "/api/storage/migrate", call: storageMigrate.POST },
      { method: "POST", path: "/api/youtube/bricks", call: bricks.POST },
      { method: "PATCH", path: "/api/youtube/bricks", call: bricks.PATCH },
    ],
  };
}

/** Public-view checks for /api/health/full. Failures are named issues. */
export async function runPublicViewProbe(): Promise<HealthIssue[]> {
  const [security, pages, finance, http] = await Promise.all([
    securityIssues(),
    pageStatusIssues(),
    financeLoggedOutIssues(),
    Promise.resolve(drillIssues()),
  ]);
  const drills = [...financeLockIssues(), ...http];
  const drillFailures = drills.filter((row) => row.id === "public-drill-down" && row.status === "error");
  const drillOk = drills.filter((row) => row.id !== "public-drill-down");
  return [
    ...security,
    ...pages,
    ...finance,
    ...drillOk,
    ...settle("public-drill-down", "Public drill-down links resolve", drillFailures),
  ];
}
