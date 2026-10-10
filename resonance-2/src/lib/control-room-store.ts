import "server-only";

import { readGithubCache, loadGithubPulls } from "@/lib/build-github";
import { GITHUB_REVALIDATE_SECONDS } from "@/lib/build-tracker";
import {
  controlHomeLines,
  controlHomeLive,
  presentControlRoom,
  scoreAgents,
  scoreApprovals,
  HISTORY_FRESHNESS,
  scoreFeeds,
  type ActivitySignal,
  type ApprovalStamp,
  type ControlFeedId,
  type ControlRoom,
} from "@/lib/control-room";
import { readEquityCache, loadEquityQuote } from "@/lib/equity-price";
import { sqlQuery } from "@/lib/pg/client";
import { loadXrpTriggerCloses, readXrpDailyCloseCache } from "@/lib/price-history";
import { readSpotCache, loadSpotQuote } from "@/lib/spot-price";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

const QUOTE_TTL_MS = 30_000;
const GITHUB_TTL_MS = GITHUB_REVALIDATE_SECONDS * 1000;

function iso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return null;
}

async function maxAt(text: string): Promise<string | null> {
  const rows = await sqlQuery<{ at: unknown }>(text);
  return iso(rows[0]?.at);
}

async function approvalStamps(): Promise<ApprovalStamp[]> {
  const rows = await sqlQuery<{
    status: string;
    created_at: unknown;
    decided_at: unknown;
    title: string;
    requested_by_agent: string;
  }>(
    `SELECT status, created_at, decided_at, title, requested_by_agent
     FROM approvals
     ORDER BY created_at ASC`,
  );
  const stamps: ApprovalStamp[] = [];
  for (const row of rows) {
    const createdAt = iso(row.created_at);
    if (!createdAt) continue;
    stamps.push({
      status: row.status,
      createdAt,
      decidedAt: iso(row.decided_at),
      title: typeof row.title === "string" ? row.title : "",
      agent: typeof row.requested_by_agent === "string" ? row.requested_by_agent : "",
    });
  }
  return stamps;
}

async function signals(includeFinance: boolean): Promise<ActivitySignal[]> {
  const [robinhood, agentic, build, fitnessMetrics, fitnessWorkouts, lessons, finance, calendar] =
    await Promise.all([
      maxAt(
        `SELECT max(created_at) AS at FROM fills
         WHERE source ILIKE '%robinhood%' OR coalesce(venue, '') ILIKE '%robinhood%'`,
      ),
      maxAt(
        `SELECT max(created_at) AS at FROM fills
         WHERE lower(coalesce(sleeve, '')) = 'cb-agentic'
           AND (source ILIKE '%coinbase%' OR coalesce(venue, '') ILIKE '%coinbase%')`,
      ),
      maxAt(`SELECT max(updated_at) AS at FROM build_items`),
      maxAt(`SELECT max(updated_at) AS at FROM fitness_metrics`),
      maxAt(`SELECT max(updated_at) AS at FROM fitness_workouts`),
      maxAt(`SELECT max(created_at) AS at FROM lessons`),
      includeFinance
        ? maxAt(`SELECT max(stored_at) AS at FROM finance_snapshots`)
        : Promise.resolve(null),
      sqlQuery<{ writer: string; at: unknown }>(
        `SELECT writer, max(updated_at) AS at FROM calendar_entries GROUP BY writer`,
      ),
    ]);

  const list: ActivitySignal[] = [];
  const push = (source: string, at: string | null, writer?: string | null) => {
    if (at) list.push({ source, at, writer });
  };
  push("fills:robinhood", robinhood);
  push("fills:cb-agentic", agentic);
  push("build_items", build);
  const fitness = later(fitnessMetrics, fitnessWorkouts);
  push("fitness_ingest", fitness);
  push("lessons", lessons);
  if (includeFinance) push("finance_snapshot", finance);
  for (const row of calendar) {
    push("calendar", iso(row.at), row.writer);
  }
  return list;
}

function later(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

async function feedStamps(includeFinance: boolean): Promise<Partial<Record<ControlFeedId, string | null>>> {
  const [healthMetrics, healthWorkouts, robinhood, coinbase, calendar, finance] = await Promise.all([
    maxAt(`SELECT max(updated_at) AS at FROM fitness_metrics`),
    maxAt(`SELECT max(updated_at) AS at FROM fitness_workouts`),
    maxAt(
      `SELECT max(created_at) AS at FROM fills
       WHERE source ILIKE '%robinhood%' OR coalesce(venue, '') ILIKE '%robinhood%'`,
    ),
    maxAt(
      `SELECT max(created_at) AS at FROM fills
       WHERE source ILIKE '%coinbase%' OR coalesce(venue, '') ILIKE '%coinbase%'`,
    ),
    maxAt(`SELECT max(updated_at) AS at FROM calendar_entries`),
    includeFinance
      ? maxAt(`SELECT max(stored_at) AS at FROM finance_snapshots`)
      : Promise.resolve(null),
  ]);
  return {
    health: later(healthMetrics, healthWorkouts),
    robinhood,
    coinbase,
    calendar,
    finance: includeFinance ? finance : null,
  };
}

async function coinGeckoAt(nowMs: number): Promise<string | null> {
  const cached = readSpotCache("XRP", nowMs);
  if (cached && cached.source === "CoinGecko" && cached.ageMs >= 0 && cached.ageMs < QUOTE_TTL_MS) {
    return cached.fetchedAt;
  }
  const quote = await loadSpotQuote("XRP");
  if (quote?.source === "CoinGecko" && quote.fetchedAt) return quote.fetchedAt;
  const last = readSpotCache("XRP", Date.now());
  return last?.source === "CoinGecko" ? last.fetchedAt : null;
}

async function xrpDailyClosesAt(nowMs: number): Promise<string | null> {
  const cached = readXrpDailyCloseCache(nowMs);
  if (cached && cached.ageMs >= 0 && cached.ageMs <= HISTORY_FRESHNESS.amberMs) return cached.fetchedAt;
  const previous = cached?.fetchedAt ?? null;
  const closes = await loadXrpTriggerCloses().catch(() => null);
  const after = readXrpDailyCloseCache(Date.now());
  if (closes && after) return after.fetchedAt;
  return previous;
}

async function yahooAt(nowMs: number): Promise<string | null> {
  const cached = readEquityCache("NVDA", nowMs);
  if (
    cached &&
    cached.source.toLowerCase().includes("yahoo") &&
    cached.ageMs >= 0 &&
    cached.ageMs < QUOTE_TTL_MS
  ) {
    return cached.fetchedAt;
  }
  const quote = await loadEquityQuote("NVDA");
  if (quote?.source.toLowerCase().includes("yahoo") && quote.fetchedAt) return quote.fetchedAt;
  const last = readEquityCache("NVDA", Date.now());
  return last?.source.toLowerCase().includes("yahoo") ? last.fetchedAt : null;
}

async function githubAt(nowMs: number): Promise<string | null> {
  const cached = readGithubCache(nowMs);
  if (cached && cached.ageMs >= 0 && cached.ageMs < GITHUB_TTL_MS) return cached.fetchedAt;
  try {
    const loaded = await loadGithubPulls([]);
    const after = readGithubCache(Date.now());
    if (loaded.fresh && after) return after.fetchedAt;
    return after?.fetchedAt ?? null;
  } catch {
    return readGithubCache(Date.now())?.fetchedAt ?? null;
  }
}

export async function loadControlRoom(options: {
  publicMode: boolean;
  probeLive: boolean;
  now?: Date;
}): Promise<ControlRoom> {
  const now = options.now ?? new Date();
  const includeFinance = !options.publicMode;
  const [activity, approvals, feeds] = await Promise.all([
    signals(includeFinance),
    options.publicMode ? Promise.resolve([] as ApprovalStamp[]) : approvalStamps(),
    feedStamps(includeFinance),
  ]);

  const checked: Partial<Record<ControlFeedId, boolean>> = {
    health: true,
    robinhood: true,
    coinbase: true,
    calendar: true,
    finance: includeFinance,
  };

  if (options.probeLive) {
    const [coingecko, xrpCloses, yahoo, github] = await Promise.all([
      coinGeckoAt(now.getTime()).catch(() => null),
      xrpDailyClosesAt(now.getTime()).catch(() => null),
      yahooAt(now.getTime()).catch(() => null),
      githubAt(now.getTime()),
    ]);
    feeds.coingecko = coingecko;
    feeds["xrp-closes"] = xrpCloses;
    feeds.yahoo = yahoo;
    feeds.github = github;
    checked.coingecko = true;
    checked["xrp-closes"] = true;
    checked.yahoo = true;
    checked.github = true;
  }

  return {
    approvals: scoreApprovals(approvals, now),
    agents: scoreAgents(activity),
    feeds: scoreFeeds(feeds, checked, now),
  };
}

export async function loadControlHome(publicMode: boolean): Promise<{ lines: string[]; live: boolean }> {
  try {
    const room = await loadControlRoom({ publicMode, probeLive: false });
    const view = presentControlRoom(room, publicMode);
    return { lines: controlHomeLines(view), live: controlHomeLive(view) };
  } catch (error) {
    if (!isStorageUnavailable(error)) throw error;
    return { lines: ["unavailable"], live: false };
  }
}
