import { AI_STOCK_TICKERS } from "@/lib/ai-stocks";
import { BUILD_NODE_LABELS, BUILD_NODES } from "@/lib/build-tracker";
import { CONTROL_VIEWS, DAILY_FRESHNESS, HISTORY_FRESHNESS } from "@/lib/control-room";
import { CRAWL_WALK_RUN } from "@/lib/crawl-walk-run";
import { FINANCE_NODES } from "@/lib/finance/view";
import { FITNESS_NODES } from "@/lib/fitness-board";
import { CRYPTO_HOME_TICKERS, HOME_QUOTE_MAX_AGE_MS } from "@/lib/home-lines";
import { financePageLocked, isHiddenInPublicMode } from "@/lib/public-mode";

export const HEALTH_STATUSES = ["ok", "unavailable", "error"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const HEALTH_REASONS = [
  "loaded",
  "quote fresh",
  "quote stale",
  "quote missing",
  "partial quotes",
  "storage unavailable",
  "read failed",
  "no snapshot yet",
  "snapshot fresh",
  "snapshot stale",
  "data stale",
  "deposits unavailable",
  "bet book unavailable",
  "seed only",
  "not connected",
  "static",
  "github stale",
  "feed stale",
  "feeds fresh",
  "no bot signal",
  "bot signal stale",
  "no rows",
  "not recorded",
  "scored",
  "not scored",
  "no messages yet",
  "drill-down broken",
] as const;

export type HealthReason = (typeof HEALTH_REASONS)[number];

const REASON_SET = new Set<string>(HEALTH_REASONS);

export type HealthSurface = {
  id: string;
  name: string;
  path: string;
  status: HealthStatus;
  stale: boolean;
  ageSeconds: number | null;
  reason: HealthReason;
};

export type HealthSummary = {
  status: HealthStatus;
  surfaces: number;
  ok: number;
  unavailable: number;
  error: number;
  stale: number;
};

export const PUBLIC_VIEW_ISSUE_IDS = [
  "logged-out-dollar-fields",
  "logged-out-write-open",
  "public-page-status",
  "public-page-error",
  "public-drill-down",
  "finance-lock-tile",
  "finance-lock-href",
  "finance-logged-out-page",
  "finance-logged-out-api",
] as const;

export type PublicViewIssueId = (typeof PUBLIC_VIEW_ISSUE_IDS)[number];

/** One named Public-view check. A failure is its own row, with the route on `path`. */
export type HealthIssue = {
  id: PublicViewIssueId;
  name: string;
  status: "ok" | "error";
  path: string;
};

/** Today's anonymous counter. No address, agent, or hash. */
export type VisitorTodayCounts = {
  day: string;
  pageViews: number;
  uniqueVisitors: number;
};

/** Health Auto Export presence. Counts and a date, not step totals or distances. */
export type HealthAutoExportCounts = {
  stepDays: number;
  workouts: number;
  latestDate: string | null;
};

export type IngestCounts = {
  visitorsToday: VisitorTodayCounts;
  healthAutoExport: HealthAutoExportCounts;
};

export type HealthFullReport = {
  ok: boolean;
  checkedAt: string;
  summary: HealthSummary;
  tiles: HealthSurface[];
  pages: HealthSurface[];
  issues: HealthIssue[];
  counts: IngestCounts;
};

export type HealthTarget = {
  id: string;
  name: string;
  path: string;
};

/** Owner home floor with fitness shelved. Twelve squares. */
export const HEALTH_TILES: readonly HealthTarget[] = [
  { id: "crypto", name: "Crypto", path: "/n/crypto" },
  { id: "ai-stocks", name: "AI Stocks", path: "/n/ai-stocks" },
  { id: "finance", name: "Finance", path: "/n/finance" },
  { id: "fight-desk", name: "Fight Desk", path: "/n/fight-desk" },
  { id: "build", name: "Build", path: "/n/build" },
  { id: "control", name: "Control Room", path: "/n/control" },
  { id: "health", name: "Health", path: "/n/health" },
  { id: "youtube", name: "YouTube", path: "/n/youtube" },
  { id: "system", name: "System", path: "/n/system" },
  { id: "lessons", name: "Lessons", path: "/n/lessons" },
  { id: "roundtable", name: "Roundtable", path: "/n/roundtable" },
  { id: "chain-security", name: "Chain Security", path: "/n/chain-security" },
  { id: "visitors", name: "Visitors", path: "/n/visitors" },
];

const CONTROL_VIEW_NAMES: Record<(typeof CONTROL_VIEWS)[number], string> = {
  approvals: "Approvals",
  bots: "Bots",
  feeds: "Feeds",
};

/** Stable node routes. Dynamic records (one fight, one thread) stay on their parent loader. */
export function healthPages(): HealthTarget[] {
  const pages: HealthTarget[] = [
    { id: "crypto", name: "Crypto", path: "/n/crypto" },
  ];
  for (const ticker of CRYPTO_HOME_TICKERS) {
    const id = ticker.toLowerCase();
    pages.push({ id: `crypto-${id}`, name: ticker, path: `/n/crypto/${id}` });
  }
  pages.push({ id: "crypto-xrp-trigger", name: "XRP Trigger", path: "/n/crypto/xrp-trigger" });
  pages.push({ id: "ai-stocks", name: "AI Stocks", path: "/n/ai-stocks" });
  for (const ticker of AI_STOCK_TICKERS) {
    const id = ticker.toLowerCase();
    pages.push({ id: `ai-${id}`, name: ticker, path: `/n/ai-stocks/${id}` });
  }
  pages.push({ id: "ai-catalysts", name: "Catalysts", path: "/n/ai-stocks/catalysts" });
  pages.push({ id: "finance", name: "Finance", path: "/n/finance" });
  for (const node of FINANCE_NODES) {
    pages.push({ id: `finance-${node.id}`, name: node.title, path: `/n/finance/${node.id}` });
  }
  pages.push(
    { id: "fight-desk", name: "Fight Desk", path: "/n/fight-desk" },
    { id: "fight-bankroll", name: "Bankroll", path: "/n/fight-desk/bankroll" },
    { id: "fights", name: "Fights", path: "/fights" },
    { id: "fitness", name: "Fitness", path: "/n/fitness" },
  );
  for (const node of FITNESS_NODES) {
    pages.push({ id: `fitness-${node.id}`, name: node.title, path: `/n/fitness/${node.id}` });
  }
  pages.push({ id: "build", name: "Build", path: "/n/build" });
  for (const node of BUILD_NODES) {
    pages.push({ id: `build-${node}`, name: BUILD_NODE_LABELS[node], path: `/n/build/${node}` });
  }
  pages.push(
    { id: "ideas", name: "Future Ideas", path: "/n/ideas" },
    { id: "crawl-walk-run", name: "Crawl Walk Run", path: "/n/crawl-walk-run" },
  );
  for (const group of CRAWL_WALK_RUN.groups) {
    pages.push({
      id: `cwr-${group.id}`,
      name: group.label,
      path: `/n/crawl-walk-run/${group.id}`,
    });
  }
  pages.push(
    { id: "youtube", name: "YouTube", path: "/n/youtube" },
    { id: "youtube-channel", name: "Channel", path: "/n/youtube/channel" },
    { id: "youtube-gear", name: "Gear", path: "/n/youtube/gear" },
    { id: "youtube-bricks", name: "Brick Tracker", path: "/n/youtube/bricks" },
    { id: "system", name: "System", path: "/n/system" },
    { id: "system-live", name: "Live", path: "/n/system/live" },
    { id: "lessons", name: "Lessons", path: "/n/lessons" },
    { id: "health", name: "Health", path: "/n/health" },
    { id: "roundtable", name: "Roundtable", path: "/n/roundtable" },
    { id: "chain-security", name: "Chain Security", path: "/n/chain-security" },
    { id: "visitors", name: "Visitors", path: "/n/visitors" },
    { id: "control", name: "Control Room", path: "/n/control" },
  );
  for (const view of CONTROL_VIEWS) {
    pages.push({ id: `control-${view}`, name: CONTROL_VIEW_NAMES[view], path: `/n/control/${view}` });
  }
  pages.push(
    { id: "approvals", name: "Approvals", path: "/n/approvals" },
    { id: "approvals-pending", name: "Pending", path: "/n/approvals/pending" },
    { id: "approvals-done", name: "Done", path: "/n/approvals/done" },
  );
  return pages;
}

const SLUG = "[a-z0-9][a-z0-9-]*";

function drillRedirect(path: string): string | null {
  if (path === "/n/predictions" || path === "/n/fights") return "/n/fight-desk";
  const predictionChild = new RegExp(`^/n/predictions/(${SLUG})$`).exec(path);
  if (predictionChild?.[1]) return `/n/fight-desk/${predictionChild[1]}`;
  if (path === "/n/money") return "/n/finance";
  const moneyChild = new RegExp(`^/n/money/(${SLUG})$`).exec(path);
  if (moneyChild?.[1]) return `/n/finance/${moneyChild[1]}`;
  if (path === "/n/ai" || path === "/n/stocks") return "/n/ai-stocks";
  if (path === "/n/fitness/activity") return "/n/fitness/steps";
  if (path === "/fights/main-card" || path === "/fights/prelims") return "/fights";
  return null;
}

function knownFloorRoute(path: string): boolean {
  if (path === "/" || path === "/calendar" || path === "/settings" || path === "/tv" || path === "/login") return true;
  if (path === "/log" || path === "/settings/security") return true;
  if (path === "/film" || path.startsWith("/film/")) return true;
  const listed = new Set([...HEALTH_TILES, ...healthPages()].map((target) => target.path));
  if (listed.has(path)) return true;
  if (new RegExp(`^/calendar/\\d{4}-\\d{2}-\\d{2}$`).test(path)) return true;
  if (new RegExp(`^/fights/(?:upcoming|past)/${SLUG}$`).test(path)) return true;
  if (path === "/fights/tiers" || path.startsWith("/fights/tiers/")) return true;
  if (new RegExp(`^/fights/fighters/${SLUG}$`).test(path)) return true;
  if (new RegExp(`^/fights/${SLUG}$`).test(path)) return true;
  if (new RegExp(`^/fights/${SLUG}/${SLUG}$`).test(path)) return true;
  if (new RegExp(`^/n/chain-security/${SLUG}$`).test(path)) return true;
  if (new RegExp(`^/n/roundtable/${SLUG}$`).test(path)) return true;
  if (new RegExp(`^/n/youtube/(?:gear|bricks)/${SLUG}$`).test(path)) return true;
  if (new RegExp(`^/n/crawl-walk-run/${SLUG}(?:/${SLUG})?$`).test(path)) return true;
  if (path === "/n/ai-stocks/catalysts" || path.startsWith("/n/ai-stocks/catalysts/")) return true;
  if (new RegExp(`^/n/build/${SLUG}$`).test(path)) {
    return BUILD_NODES.some((node) => path === `/n/build/${node}`);
  }
  if (new RegExp(`^/n/finance/${SLUG}$`).test(path)) {
    return FINANCE_NODES.some((node) => path === `/n/finance/${node.id}`);
  }
  if (new RegExp(`^/n/fitness/${SLUG}$`).test(path)) {
    return FITNESS_NODES.some((node) => path === `/n/fitness/${node.id}`);
  }
  if (new RegExp(`^/n/control/${SLUG}$`).test(path)) {
    return CONTROL_VIEWS.some((view) => path === `/n/control/${view}`);
  }
  if (path === "/n/approvals/pending" || path === "/n/approvals/done") return true;
  if (new RegExp(`^/n/crypto/${SLUG}$`).test(path)) {
    if (path === "/n/crypto/xrp-trigger") return true;
    return CRYPTO_HOME_TICKERS.some((ticker) => path === `/n/crypto/${ticker.toLowerCase()}`);
  }
  if (new RegExp(`^/n/ai-stocks/${SLUG}$`).test(path)) {
    return AI_STOCK_TICKERS.some((ticker) => path === `/n/ai-stocks/${ticker.toLowerCase()}`);
  }
  return false;
}

/** Follow permanent redirects. A loop or an unknown path does not render. */
export function resolveDrillDown(href: string): { ok: true; path: string } | { ok: false } {
  let path = (href.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  const seen = new Set<string>();
  for (let hop = 0; hop < 6; hop += 1) {
    if (seen.has(path)) return { ok: false };
    seen.add(path);
    const next = drillRedirect(path);
    if (!next) return knownFloorRoute(path) ? { ok: true, path } : { ok: false };
    path = next;
  }
  return { ok: false };
}

/**
 * A home tile or node card is broken when its href 404s, loops, or
 * public mode would still answer with the private gate.
 * Finance is locked on purpose in public mode. That missing link is expected.
 */
export function drillDownBroken(href: string, mode: "private" | "public"): boolean {
  const resolved = resolveDrillDown(href);
  if (!resolved.ok) return true;
  if (mode === "public" && financePageLocked(resolved.path)) return false;
  if (mode === "public" && isHiddenInPublicMode(resolved.path)) return true;
  return false;
}

function applyDrillDown(surface: HealthSurface, href: string): HealthSurface {
  const path = surface.path || href;
  if (!drillDownBroken(path, "private") && !drillDownBroken(path, "public")) return surface;
  return { ...surface, path: href, status: "error", stale: false, reason: "drill-down broken" };
}

export function ageSeconds(at: string | null | undefined, now: Date): number | null {
  if (!at) return null;
  const stamp = at.length === 10 ? `${at}T00:00:00.000Z` : at;
  const ms = Date.parse(stamp);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((now.getTime() - ms) / 1000));
}

export function youngestAge(stamps: readonly (string | null | undefined)[], now: Date): number | null {
  let best: number | null = null;
  for (const stamp of stamps) {
    const age = ageSeconds(stamp, now);
    if (age === null) continue;
    if (best === null || age < best) best = age;
  }
  return best;
}

export function oldestAge(stamps: readonly (string | null | undefined)[], now: Date): number | null {
  let worst: number | null = null;
  for (const stamp of stamps) {
    const age = ageSeconds(stamp, now);
    if (age === null) continue;
    if (worst === null || age > worst) worst = age;
  }
  return worst;
}

export type HealthBits = {
  status: HealthStatus;
  stale: boolean;
  ageSeconds: number | null;
  reason: HealthReason;
};

export function bits(
  status: HealthStatus,
  reason: HealthReason,
  options: { stale?: boolean; ageSeconds?: number | null } = {},
): HealthBits {
  return {
    status,
    reason,
    stale: status === "ok" && options.stale === true,
    ageSeconds: options.ageSeconds ?? null,
  };
}

export function failedBits(kind: "unavailable" | "error"): HealthBits {
  return bits(kind, kind === "unavailable" ? "storage unavailable" : "read failed");
}

export function healthSummary(tiles: readonly HealthSurface[], pages: readonly HealthSurface[]): HealthSummary {
  const all = [...tiles, ...pages];
  const count = (status: HealthStatus) => all.filter((row) => row.status === status).length;
  const error = count("error");
  const unavailable = count("unavailable");
  const ok = count("ok");
  const status: HealthStatus = error > 0 ? "error" : unavailable > 0 ? "unavailable" : "ok";
  return {
    status,
    surfaces: all.length,
    ok,
    unavailable,
    error,
    stale: all.filter((row) => row.stale).length,
  };
}

function cleanString(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value || value.includes("$")) return fallback;
  return value;
}

function asRow(value: unknown): Partial<HealthSurface> {
  return value && typeof value === "object" ? (value as Partial<HealthSurface>) : {};
}

function cleanSurface(value: unknown, fallback: HealthTarget): HealthSurface {
  const row = asRow(value);
  const status: HealthStatus =
    row.status === "ok" || row.status === "unavailable" || row.status === "error" ? row.status : "error";
  const reason = typeof row.reason === "string" && REASON_SET.has(row.reason) ? (row.reason as HealthReason) : "read failed";
  const age = row.ageSeconds;
  const ageSeconds =
    typeof age === "number" && Number.isFinite(age) ? Math.max(0, Math.round(age)) : null;
  return {
    id: cleanString(row.id, fallback.id),
    name: cleanString(row.name, fallback.name),
    path: cleanString(row.path, fallback.path),
    status,
    stale: status === "ok" && row.stale === true,
    ageSeconds,
    reason,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function whole(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Math.round(number), 1_000_000_000);
}

function dayOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !DAY.test(value) || value.includes("$")) return null;
  return value;
}

export function emptyIngestCounts(day = "1970-01-01"): IngestCounts {
  return {
    visitorsToday: { day: dayOrNull(day) ?? "1970-01-01", pageViews: 0, uniqueVisitors: 0 },
    healthAutoExport: { stepDays: 0, workouts: 0, latestDate: null },
  };
}

function cleanCounts(value: unknown, day: string): IngestCounts {
  const fallback = emptyIngestCounts(day);
  if (!value || typeof value !== "object") return fallback;
  const row = value as Partial<IngestCounts>;
  const visitors = row.visitorsToday;
  const health = row.healthAutoExport;
  const visitorRow = visitors && typeof visitors === "object" ? visitors : null;
  const healthRow = health && typeof health === "object" ? health : null;
  return {
    visitorsToday: {
      day: dayOrNull(visitorRow?.day) ?? fallback.visitorsToday.day,
      pageViews: whole(visitorRow?.pageViews),
      uniqueVisitors: whole(visitorRow?.uniqueVisitors),
    },
    healthAutoExport: {
      stepDays: whole(healthRow?.stepDays),
      workouts: whole(healthRow?.workouts),
      latestDate: dayOrNull(healthRow?.latestDate),
    },
  };
}

function rowFor(raw: readonly unknown[], target: HealthTarget, index: number): unknown {
  const match = raw.find((row) => asRow(row).id === target.id);
  return match ?? raw[index];
}

const ISSUE_IDS = new Set<string>(PUBLIC_VIEW_ISSUE_IDS);

function cleanIssues(value: unknown): HealthIssue[] {
  if (!Array.isArray(value)) return [];
  const issues: HealthIssue[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<HealthIssue>;
    if (typeof row.id !== "string" || !ISSUE_IDS.has(row.id)) continue;
    if (row.status !== "ok" && row.status !== "error") continue;
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const path = typeof row.path === "string" ? row.path.trim() : "";
    if (!name || name.includes("$") || path.includes("$")) continue;
    if (name.length > 180 || path.length > 160) continue;
    if (path && !path.startsWith("/")) continue;
    issues.push({ id: row.id as PublicViewIssueId, name, status: row.status, path });
  }
  return issues;
}

/** Rebuild the public shape. Extra fields and dollar text do not survive. */
export function publicHealthReport(input: {
  checkedAt?: unknown;
  tiles?: unknown;
  pages?: unknown;
  issues?: unknown;
  counts?: unknown;
}): HealthFullReport {
  const tileTargets = HEALTH_TILES;
  const pageTargets = healthPages();
  const rawTiles = Array.isArray(input.tiles) ? input.tiles : [];
  const rawPages = Array.isArray(input.pages) ? input.pages : [];
  const tiles = tileTargets.map((target, index) =>
    applyDrillDown(cleanSurface(rowFor(rawTiles, target, index), target), target.path),
  );
  const pages = pageTargets.map((target, index) =>
    applyDrillDown(cleanSurface(rowFor(rawPages, target, index), target), target.path),
  );
  const issues = cleanIssues(input.issues);
  const issueErrors = issues.filter((issue) => issue.status === "error").length;
  const summary = healthSummary(tiles, pages);
  const status: HealthStatus = issueErrors > 0 ? "error" : summary.status;
  const checkedAt = cleanString(input.checkedAt, "");
  const checked = Number.isFinite(Date.parse(checkedAt)) ? checkedAt : new Date(0).toISOString();
  return {
    ok: status === "ok",
    checkedAt: checked,
    summary: {
      ...summary,
      status,
      error: summary.error + issueErrors,
    },
    tiles,
    pages,
    issues,
    counts: cleanCounts(input.counts, checked.slice(0, 10)),
  };
}

export function surface(target: HealthTarget, fact: HealthBits): HealthSurface {
  return {
    id: target.id,
    name: target.name,
    path: target.path,
    status: fact.status,
    stale: fact.status === "ok" && fact.stale === true,
    ageSeconds: fact.ageSeconds,
    reason: fact.reason,
  };
}

export function quoteBits(
  quote: { fetchedAt?: string | null } | null | undefined,
  now: Date,
): HealthBits {
  const age = ageSeconds(quote?.fetchedAt ?? null, now);
  if (age === null) return bits("unavailable", "quote missing");
  const stale = age * 1000 > HOME_QUOTE_MAX_AGE_MS;
  return bits("ok", stale ? "quote stale" : "quote fresh", { stale, ageSeconds: age });
}

export function groupQuoteBits(parts: readonly HealthBits[]): HealthBits {
  if (parts.length === 0) return bits("unavailable", "quote missing");
  if (parts.some((part) => part.status === "error")) return failedBits("error");
  const present = parts.filter((part) => part.status === "ok");
  if (present.length === 0) return bits("unavailable", "quote missing");
  const missing = present.length !== parts.length;
  const stale = present.some((part) => part.stale);
  const ages = present.flatMap((part) => (part.ageSeconds === null ? [] : [part.ageSeconds]));
  return bits("ok", missing ? "partial quotes" : stale ? "quote stale" : "quote fresh", {
    stale,
    ageSeconds: ages.length ? Math.max(...ages) : null,
  });
}

export function financeBits(
  page:
    | { status: "waiting" }
    | { status: "unavailable" }
    | { status: "live"; stale: boolean; storedAt?: string | null; asOf?: string | null },
  now: Date,
): HealthBits {
  if (page.status === "unavailable") return bits("unavailable", "storage unavailable");
  if (page.status === "waiting") return bits("ok", "no snapshot yet");
  const age = ageSeconds(page.storedAt || page.asOf, now);
  return bits("ok", page.stale ? "snapshot stale" : "snapshot fresh", {
    stale: page.stale,
    ageSeconds: age,
  });
}

export function fightDeskBits(
  page: { bookReady: boolean; ledgerReady: boolean; seedOnly: boolean; stale: boolean },
  surface: "tile" | "bankroll",
): HealthBits {
  if (!page.bookReady) return bits("unavailable", "bet book unavailable");
  if (!page.ledgerReady) {
    return surface === "bankroll"
      ? bits("unavailable", "deposits unavailable")
      : bits("ok", "deposits unavailable", { stale: page.stale });
  }
  if (page.seedOnly) return bits("ok", "seed only");
  return bits("ok", page.stale ? "data stale" : "loaded", { stale: page.stale });
}

export function betsBits(page: { status: string; stale?: boolean }): HealthBits {
  if (page.status === "unavailable") return bits("unavailable", "bet book unavailable");
  if (page.status === "unconfigured" || page.status === "seed-only") return bits("ok", "seed only");
  return bits("ok", page.stale ? "data stale" : "loaded", { stale: page.stale === true });
}

export function calendarBits(page: { status: string; stale?: boolean }): HealthBits {
  if (page.status === "unavailable") return bits("unavailable", "storage unavailable");
  if (page.status === "unconfigured" || page.status === "seed-only") return bits("ok", "seed only");
  return bits("ok", page.stale ? "data stale" : "loaded", { stale: page.stale === true });
}

export function feedBits(
  feeds: readonly { freshness?: string | null; at?: string | null; checked?: boolean }[],
  now: Date,
): HealthBits {
  const checked = feeds.filter((feed) => feed.checked !== false);
  if (checked.length === 0) return bits("ok", "not connected");
  const stale = checked.some((feed) => feed.freshness !== "green");
  return bits("ok", stale ? "feed stale" : "feeds fresh", {
    stale,
    ageSeconds: oldestAge(checked.map((feed) => feed.at), now),
  });
}

export function botBits(agents: readonly { at?: string | null }[], now: Date): HealthBits {
  const age = youngestAge(agents.map((agent) => agent.at), now);
  if (age === null) return bits("ok", "no bot signal");
  const stale = age * 1000 > DAILY_FRESHNESS.redMs;
  return bits("ok", stale ? "bot signal stale" : "loaded", { stale, ageSeconds: age });
}

export function controlHomeBits(home: { lines: readonly string[]; live: boolean }): HealthBits {
  if (!home.live && home.lines.length === 1 && home.lines[0] === "unavailable") {
    return bits("unavailable", "storage unavailable");
  }
  return bits("ok", home.live ? "loaded" : "no bot signal");
}

export function buildBits(
  view: { updatedAt: readonly (string | null | undefined)[]; githubFresh: boolean },
  now: Date,
): HealthBits {
  const age = youngestAge(view.updatedAt, now);
  return bits("ok", view.githubFresh ? "loaded" : "github stale", {
    stale: !view.githubFresh,
    ageSeconds: age,
  });
}

export function logBits(
  count: number,
  stamps: readonly (string | null | undefined)[],
  now: Date,
  empty: HealthReason,
): HealthBits {
  if (count <= 0) return bits("ok", empty);
  return bits("ok", "loaded", { ageSeconds: youngestAge(stamps, now) });
}

export function fitnessBits(
  availability: string,
  stamps: readonly (string | null | undefined)[],
  now: Date,
): HealthBits {
  if (availability === "unavailable") return bits("unavailable", "storage unavailable");
  if (availability === "seed-only" || availability === "unconfigured") {
    return bits("ok", "seed only", { ageSeconds: youngestAge(stamps, now) });
  }
  const age = youngestAge(stamps, now);
  if (age === null) return bits("ok", "not recorded");
  const stale = age * 1000 > DAILY_FRESHNESS.amberMs;
  return bits("ok", stale ? "data stale" : "loaded", { stale, ageSeconds: age });
}

export function machineBits(report: { scored: boolean; storageDown: boolean }): HealthBits {
  if (report.storageDown) return bits("unavailable", "storage unavailable");
  return bits("ok", report.scored ? "scored" : "not scored");
}

export function triggerBits(
  loaded: boolean,
  cache: { ageMs: number } | null,
): HealthBits {
  if (!loaded) return bits("unavailable", "quote missing");
  if (!cache || !Number.isFinite(cache.ageMs)) return bits("ok", "loaded");
  const age = Math.max(0, Math.round(cache.ageMs / 1000));
  const stale = cache.ageMs > HISTORY_FRESHNESS.amberMs;
  return bits("ok", stale ? "quote stale" : "quote fresh", { stale, ageSeconds: age });
}

export function staticBits(reason: "static" | "not connected" = "static"): HealthBits {
  return bits("ok", reason);
}

export function assembleHealth(
  checkedAt: string,
  tileFacts: Readonly<Record<string, HealthBits>>,
  pageFacts: Readonly<Record<string, HealthBits>>,
  issues: readonly HealthIssue[] = [],
  counts?: IngestCounts,
): HealthFullReport {
  const missing = failedBits("error");
  return publicHealthReport({
    checkedAt,
    tiles: HEALTH_TILES.map((target) => surface(target, tileFacts[target.id] ?? missing)),
    pages: healthPages().map((target) => surface(target, pageFacts[target.id] ?? missing)),
    issues: [...issues],
    counts,
  });
}
