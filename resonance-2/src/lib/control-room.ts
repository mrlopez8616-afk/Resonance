/**
 * Control Room scoreboard. Read-only.
 * Chat is where the founder approves his own moves. This module counts,
 * names a last timestamp, and links to Carla's queue. It records nothing.
 *
 * Freshness, measured from a real timestamp to `now`:
 * - Quote feeds (CoinGecko spot, Yahoo, GitHub build sync): green through 10 minutes,
 *   amber after 10 minutes, red after 1 hour. GitHub's list is cached about 10 minutes,
 *   so it uses the quote window.
 * - XRP daily closes: the trigger watch's CoinGecko year chart, not the spot quote.
 *   That chart is reused for 15 minutes. Green through 15 minutes, amber after that,
 *   red after 1 hour.
 * - Daily feeds (Finance snapshot, Apple Health, Robinhood fills, Coinbase fills,
 *   calendar): green through 36 hours, amber after 36 hours, red after 48 hours.
 *   Forty-eight hours is the same window the finance page uses to call a snapshot stale.
 * A missing, unreadable, or future timestamp (more than a minute ahead) is red.
 * "Over" is strict: the exact threshold keeps the earlier color.
 */

import { SYSTEM_AGENTS } from "@/data/system-map";
import { chicagoDay, chicagoToday } from "@/lib/calendar-time";
import { stripMoneyText } from "@/lib/public-mode";

export const NO_SIGNAL = "no signal";

/** Quote and GitHub sync. Amber after 10 minutes, red after 1 hour. */
export const QUOTE_FRESHNESS = {
  amberMs: 10 * 60 * 1000,
  redMs: 60 * 60 * 1000,
} as const;

/** Daily feeds. Amber after 36 hours, red after 48 hours. */
export const DAILY_FRESHNESS = {
  amberMs: 36 * 60 * 60 * 1000,
  redMs: 48 * 60 * 60 * 1000,
} as const;

/**
 * XRP daily closes from the trigger watch's CoinGecko year chart.
 * Amber after 15 minutes, red after 1 hour.
 */
export const HISTORY_FRESHNESS = {
  amberMs: 15 * 60 * 1000,
  redMs: 60 * 60 * 1000,
} as const;

const FUTURE_SKEW_MS = 60_000;

export type FreshnessBand = "quote" | "history" | "daily";
export type Freshness = "green" | "amber" | "red";

export const CONTROL_VIEWS = ["approvals", "bots", "feeds"] as const;
export type ControlView = (typeof CONTROL_VIEWS)[number];

export function isControlView(value: string): value is ControlView {
  return (CONTROL_VIEWS as readonly string[]).includes(value);
}

/**
 * Display order for the cockpit. Names come from the system map.
 * The set must match SYSTEM_AGENTS. A new agent stays on "no signal"
 * until a source below clearly belongs to it.
 */
export const CONTROL_AGENT_ORDER = [
  "sophia",
  "architect",
  "robinhood-ops",
  "crypto-desk",
  "ai-stocks-desk",
  "fitness-coach",
  "fight-desk",
  "finance-desk",
  "youtube-studio",
] as const;

export type ControlAgentId = (typeof CONTROL_AGENT_ORDER)[number];

/**
 * Sources that name an agent in the system map.
 * Anything else, including lessons and a calendar writer of "agent" or "founder",
 * is not an agent heartbeat.
 *
 * - fills:robinhood — "Fills posted by Robinhood Ops through /api/fills."
 * - fills:cb-agentic — Robinhood Ops is "the only trader" for Coinbase Agentic.
 * - build_items — Architect is the site builder. The row is the Build checklist.
 * - fitness_ingest — Fitness Coach runs steps and runs. The row is the Health ingest.
 * - finance_snapshot — Finance Desk posts the encrypted snapshot.
 */
const SOURCE_AGENT: Readonly<Record<string, ControlAgentId>> = {
  "fills:robinhood": "robinhood-ops",
  "fills:cb-agentic": "robinhood-ops",
  build_items: "architect",
  fitness_ingest: "fitness-coach",
  finance_snapshot: "finance-desk",
};

const SOURCE_WORD: Readonly<Record<string, string>> = {
  "fills:robinhood": "fills",
  "fills:cb-agentic": "fills",
  build_items: "build",
  fitness_ingest: "ingest",
  finance_snapshot: "snapshot",
  calendar: "calendar",
};

export const CONTROL_FEEDS = [
  { id: "coingecko", label: "CoinGecko", band: "quote" },
  { id: "xrp-closes", label: "XRP daily closes", band: "history" },
  { id: "yahoo", label: "Yahoo", band: "quote" },
  { id: "finance", label: "Finance", band: "daily" },
  { id: "health", label: "Apple Health", band: "daily" },
  { id: "robinhood", label: "Robinhood fills", band: "daily" },
  { id: "coinbase", label: "Coinbase fills", band: "daily" },
  { id: "github", label: "GitHub build sync", band: "quote" },
  { id: "calendar", label: "Calendar", band: "daily" },
] as const;

export type ControlFeedId = (typeof CONTROL_FEEDS)[number]["id"];

export type ActivitySignal = {
  source: string;
  at: string;
  writer?: string | null;
};

export type ApprovalStamp = {
  status: string;
  createdAt: string;
  decidedAt: string | null;
  title: string;
  agent: string;
};

export type ControlApprovalRow = {
  title: string;
  agent: string;
  status: string;
  at: string;
};

export type ControlApprovals = {
  pending: number;
  doneToday: number;
  pendingRows: ControlApprovalRow[];
  doneTodayRows: ControlApprovalRow[];
};

export type ControlAgentRow = {
  id: ControlAgentId;
  name: string;
  at: string | null;
  source: string | null;
};

export type ControlFeedRow = {
  id: ControlFeedId;
  label: string;
  band: FreshnessBand;
  at: string | null;
  /** False when this render did not check the source. Those rows stay off the board. */
  checked: boolean;
  freshness: Freshness;
};

export type ControlRoom = {
  approvals: ControlApprovals;
  agents: ControlAgentRow[];
  feeds: ControlFeedRow[];
};

export type ControlRoomView = {
  approvals: ControlApprovals | null;
  agents: ControlAgentRow[];
  feeds: ControlFeedRow[];
};

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function agentName(id: ControlAgentId): string {
  return SYSTEM_AGENTS.find((agent) => agent.id === id)?.name ?? id;
}

/** A calendar writer maps only when it is an agent id or the agent name. */
export function agentIdForWriter(writer: string | null | undefined): ControlAgentId | null {
  const key = normalizeKey(writer ?? "");
  if (!key) return null;
  for (const agent of SYSTEM_AGENTS) {
    const id = agent.id as ControlAgentId;
    if (key === normalizeKey(agent.id) || key === normalizeKey(agent.name)) return id;
  }
  return null;
}

/**
 * The agent a signal belongs to.
 * Unknown sources, lessons, and writer kinds that are not agent names return null.
 */
export function agentIdForSignal(signal: ActivitySignal): ControlAgentId | null {
  if (!signal.at || !Number.isFinite(Date.parse(signal.at))) return null;
  if (signal.source === "calendar") return agentIdForWriter(signal.writer);
  return SOURCE_AGENT[signal.source] ?? null;
}

export function ageMs(at: string | null | undefined, now: Date): number | null {
  if (!at) return null;
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  const age = now.getTime() - ms;
  if (age < -FUTURE_SKEW_MS) return null;
  return Math.max(0, age);
}

export function feedFreshness(
  at: string | null | undefined,
  now: Date,
  band: FreshnessBand,
): Freshness {
  const age = ageMs(at, now);
  if (age === null) return "red";
  const limits =
    band === "quote" ? QUOTE_FRESHNESS : band === "history" ? HISTORY_FRESHNESS : DAILY_FRESHNESS;
  if (age <= limits.amberMs) return "green";
  if (age <= limits.redMs) return "amber";
  return "red";
}

function chicagoClock(at: string): string | null {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(new Date(ms));
  return `${formatted.replace(/\u202f|\u00a0/g, " ")} CT`;
}

function relativeAge(at: string, now: Date): string | null {
  const age = ageMs(at, now);
  if (age === null) return null;
  const sec = Math.floor(age / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** Relative age. Missing time is "no signal". */
export function formatControlAge(at: string | null | undefined, now: Date): string {
  if (!at) return NO_SIGNAL;
  return relativeAge(at, now) ?? NO_SIGNAL;
}

/** Relative age plus the America/Chicago clock. Missing time is "no signal". */
export function formatControlWhen(at: string | null | undefined, now: Date): string {
  if (!at) return NO_SIGNAL;
  const relative = relativeAge(at, now);
  const clock = chicagoClock(at);
  if (!relative || !clock) return NO_SIGNAL;
  return `${relative} · ${clock}`;
}

export function scoreApprovals(rows: readonly ApprovalStamp[], now: Date): ControlApprovals {
  const today = chicagoToday(now);
  const pendingRows: ControlApprovalRow[] = [];
  const doneTodayRows: ControlApprovalRow[] = [];
  for (const row of rows) {
    const title = stripMoneyText(row.title) || "Request";
    const agent = row.agent.trim() || "Unknown";
    if (row.status === "pending") {
      if (!row.createdAt) continue;
      pendingRows.push({ title, agent, status: "pending", at: row.createdAt });
      continue;
    }
    if (row.status !== "approved" && row.status !== "declined" && row.status !== "cancelled") {
      continue;
    }
    if (!row.decidedAt || chicagoDay(row.decidedAt) !== today) continue;
    doneTodayRows.push({ title, agent, status: row.status, at: row.decidedAt });
  }
  pendingRows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  doneTodayRows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return {
    pending: pendingRows.length,
    doneToday: doneTodayRows.length,
    pendingRows,
    doneTodayRows,
  };
}

export function scoreAgents(signals: readonly ActivitySignal[]): ControlAgentRow[] {
  const best = new Map<ControlAgentId, { at: string; source: string }>();
  for (const signal of signals) {
    const id = agentIdForSignal(signal);
    if (!id) continue;
    const ms = Date.parse(signal.at);
    const prev = best.get(id);
    if (!prev || ms > Date.parse(prev.at)) {
      best.set(id, { at: new Date(ms).toISOString(), source: signal.source });
    }
  }
  return CONTROL_AGENT_ORDER.map((id) => {
    const hit = best.get(id);
    return {
      id,
      name: agentName(id),
      at: hit?.at ?? null,
      source: hit ? (SOURCE_WORD[hit.source] ?? null) : null,
    };
  });
}

export function scoreFeeds(
  stamps: Readonly<Partial<Record<ControlFeedId, string | null>>>,
  checked: Readonly<Partial<Record<ControlFeedId, boolean>>>,
  now: Date,
): ControlFeedRow[] {
  return CONTROL_FEEDS.map((feed) => {
    const at = stamps[feed.id] ?? null;
    const didCheck = checked[feed.id] === true;
    return {
      id: feed.id,
      label: feed.label,
      band: feed.band,
      at: didCheck ? at : null,
      checked: didCheck,
      freshness: didCheck ? feedFreshness(at, now, feed.band) : "red",
    };
  });
}

/**
 * Public mode drops Approvals and Finance.
 * Finance is the snapshot feed and the Finance Desk row. Bots and the other
 * feeds stay, and this view carries no amounts.
 */
export function presentControlRoom(room: ControlRoom, publicMode: boolean): ControlRoomView {
  if (!publicMode) {
    return {
      approvals: room.approvals,
      agents: room.agents,
      feeds: room.feeds.filter((feed) => feed.checked),
    };
  }
  return {
    approvals: null,
    agents: room.agents.filter((agent) => agent.id !== "finance-desk"),
    feeds: room.feeds.filter((feed) => feed.checked && feed.id !== "finance"),
  };
}

export function controlHomeLines(view: ControlRoomView): string[] {
  const lines: string[] = [];
  if (view.approvals) {
    lines.push(`${view.approvals.pending} pending`);
    lines.push(`${view.approvals.doneToday} done today`);
  }
  const heard = view.agents.filter((agent) => agent.at).length;
  lines.push(heard === 0 ? "no bot signal" : `${heard} of ${view.agents.length} bots`);
  return lines.slice(0, 3);
}

export function controlHomeLive(view: ControlRoomView): boolean {
  if (view.approvals && view.approvals.pending > 0) return true;
  return view.agents.some((agent) => agent.at);
}

export type ControlParentCard = {
  id: "approvals" | "bots" | "feeds";
  href: string;
  label: string;
  figure: string;
  lines: string[];
  live: boolean;
};

export function controlParentCards(view: ControlRoomView, now: Date): ControlParentCard[] {
  const cards: ControlParentCard[] = [];
  if (view.approvals) {
    cards.push({
      id: "approvals",
      href: "/n/control/approvals",
      label: "Approvals",
      figure: String(view.approvals.pending),
      lines: [`${view.approvals.doneToday} done today`],
      live: view.approvals.pending > 0,
    });
  }
  const heard = view.agents.filter((agent) => agent.at);
  const quiet = view.agents.length - heard.length;
  const latest = [...heard].sort((a, b) => ((a.at ?? "") < (b.at ?? "") ? 1 : -1))[0];
  cards.push({
    id: "bots",
    href: "/n/control/bots",
    label: "Bots",
    figure: String(heard.length),
    lines: [
      latest?.at ? `${latest.name} · ${formatControlAge(latest.at, now)}` : NO_SIGNAL,
      quiet > 0 ? `${quiet} no signal` : "all heard",
    ].slice(0, 3),
    live: heard.length > 0,
  });
  const green = view.feeds.filter((feed) => feed.freshness === "green").length;
  const amber = view.feeds.filter((feed) => feed.freshness === "amber").length;
  const red = view.feeds.filter((feed) => feed.freshness === "red").length;
  const feedLines = [`${amber} amber`, `${red} red`];
  cards.push({
    id: "feeds",
    href: "/n/control/feeds",
    label: "Feeds",
    figure: String(green),
    lines: feedLines,
    live: view.feeds.length > 0 && red === 0 && amber === 0,
  });
  return cards;
}

export const FEED_THRESHOLD_LINE =
  "CoinGecko, Yahoo, and the GitHub sync turn amber after 10 minutes and red after 1 hour. XRP daily closes turn amber after 15 minutes and red after 1 hour. The other feeds turn amber after 36 hours and red after 48 hours.";
