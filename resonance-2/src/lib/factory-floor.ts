/**
 * Factory Floor wall model.
 * Public mode is the only mode: dollar inputs are weights, then dropped.
 * A missing source is "not connected". Nothing here invents a value.
 */

import type { CalendarEvent } from "@/data/calendar";
import type { Bet } from "@/lib/bets";
import { averageStepPercent, type BuildItem } from "@/lib/build-tracker";
import { catalystBuckets } from "@/lib/catalyst-calendar";
import {
  formatControlAge,
  presentControlRoom,
  type ControlRoom,
  type Freshness,
} from "@/lib/control-room";
import { fightPromotions } from "@/lib/fight-desk";
import { isPublicLesson, visibleLessons, type Lesson } from "@/lib/lessons";
import { XRP_DAILY_CLOSE_USD } from "@/lib/home-lines";
import {
  hasMoneyText,
  PUBLIC_BOOK,
  publicPayloadLeaks,
  scrubTextFields,
  stripMoneyText,
  TREASURY_LINE,
  type PublicFloorModel,
} from "@/lib/public-mode";
import { evaluateXrpTrigger, type DailyClose } from "@/lib/xrp-trigger";

export const FACTORY_CATALYST_LIMIT = 5;
export const FACTORY_PLAY_LIMIT = 3;

/**
 * Health of the Machine. Drop a score in `MACHINE_HEALTH` when the feed exists.
 * Null keeps the reserved slot on "coming soon".
 */
export type MachineHealth = {
  /** 0 through 100. */
  score: number;
  label: string;
  tone: "steady" | "watch" | "down";
};

/** The score is not wired yet. The slot still renders. */
export const MACHINE_HEALTH: MachineHealth | null = null;

/** False hides the reserved slot. The `MachineHealth` fields stay the contract. */
export const SHOW_MACHINE_SLOT = true;

export type TvNode = {
  ticker: string;
  weight: string;
  growth: string | null;
};

export type TvBuildItem = {
  title: string;
  percent: string | null;
};

export type TvBuildPanel = {
  status: "down" | "ready";
  percent: string | null;
  items: TvBuildItem[];
};

export type TvFeed = {
  id: string;
  label: string;
  freshness: Freshness;
};

export type TvAgent = {
  name: string;
  activity: string;
};

export type TvControlPanel = {
  status: "down" | "ready";
  feeds: TvFeed[];
  agents: TvAgent[];
};

export type TvTriggerPanel = {
  status: "down" | "ready";
  line: string;
  close: string;
  versus: string;
  streak: string;
  state: string;
};

export type TvCatalyst = {
  when: string;
  title: string;
};

export type TvCatalystPanel = {
  status: "down" | "list";
  items: TvCatalyst[];
};

export type TvLessonPanel = {
  status: "down" | "empty" | "entry";
  date: string | null;
  title: string | null;
  body: string | null;
};

export type TvPlay = {
  fight: string;
  pick: string;
  tier: string | null;
};

export type TvFightPanel = {
  status: "down" | "empty" | "card";
  title: string | null;
  when: string | null;
  /** Null when the bet book did not load. An empty list is a card with no picks. */
  plays: TvPlay[] | null;
};

export type FactoryFloorModel = {
  clock: string;
  nodes: TvNode[];
  treasury: typeof TREASURY_LINE;
  build: TvBuildPanel;
  control: TvControlPanel;
  approvalsPending: number | null;
  trigger: TvTriggerPanel;
  catalysts: TvCatalystPanel;
  lesson: TvLessonPanel;
  fight: TvFightPanel;
  machine: MachineHealth | null;
  showMachine: boolean;
};

export type FactoryFloorInput = {
  now: Date;
  floor: PublicFloorModel | null;
  buildItems: readonly BuildItem[] | null;
  control: ControlRoom | null;
  approvalsPending: number | null;
  closes: readonly DailyClose[] | null;
  lessons: readonly Lesson[] | null;
  events: readonly CalendarEvent[] | null;
  bets: readonly Bet[] | null;
  machine?: MachineHealth | null;
};

const NOT_CONNECTED = "not connected";
const LESSON_CAP = 220;

function cleanText(value: string): string {
  return stripMoneyText(value).replace(/\s+/g, " ").trim();
}

function clip(value: string, max: number): string {
  const text = cleanText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function percentLabel(percent: number | null): string | null {
  if (percent === null || !Number.isFinite(percent)) return null;
  return `${Math.round(percent)}%`;
}

function plainNumber(value: number): string {
  return value.toFixed(2);
}

function chicagoClock(now: Date): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(now);
  return formatted.replace(/\u202f|\u00a0/g, " ");
}

function whenLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  })
    .format(new Date(ms))
    .replace(/\u202f|\u00a0/g, " ");
}

function financeItem(item: BuildItem): boolean {
  return item.node === "finance" || /\bfinance\b/i.test(item.title);
}

function lessonPrivate(lesson: Lesson): boolean {
  if (!isPublicLesson(lesson)) return true;
  const blob = [lesson.title, lesson.category, lesson.whatChanged, lesson.why, lesson.lesson].join(" ");
  return hasMoneyText(blob);
}

function nodesFrom(model: PublicFloorModel | null): TvNode[] {
  const holdings = model ? [...model.crypto.holdings, ...model.aiStocks.holdings] : [];
  const byTicker = new Map(holdings.map((row) => [row.ticker, row]));
  return PUBLIC_BOOK.map((row) => {
    const holding = byTicker.get(row.ticker);
    if (!holding) return { ticker: row.ticker, weight: NOT_CONNECTED, growth: null };
    const growth = holding.gainLabel ? cleanText(holding.gainLabel) : null;
    return {
      ticker: row.ticker,
      weight: cleanText(holding.weightLabel) || NOT_CONNECTED,
      growth: growth || null,
    };
  });
}

function buildPanel(items: readonly BuildItem[] | null): TvBuildPanel {
  if (!items) return { status: "down", percent: null, items: [] };
  const visible = items.filter((item) => !financeItem(item));
  const inProgress = visible
    .filter((item) => item.status === "in_progress")
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));
  return {
    status: "ready",
    percent: percentLabel(averageStepPercent(visible)),
    items: inProgress.flatMap((item) => {
      const title = cleanText(item.title);
      if (!title) return [];
      return [{ title, percent: percentLabel(averageStepPercent([item])) }];
    }),
  };
}

function controlPanel(room: ControlRoom | null, now: Date): TvControlPanel {
  if (!room) return { status: "down", feeds: [], agents: [] };
  const view = presentControlRoom(room, true);
  return {
    status: "ready",
    feeds: view.feeds.map((feed) => ({
      id: feed.id,
      label: cleanText(feed.label),
      freshness: feed.freshness,
    })),
    agents: view.agents.map((agent) => ({
      name: cleanText(agent.name),
      activity: agent.at ? formatControlAge(agent.at, now) : "no signal",
    })),
  };
}

function triggerPanel(closes: readonly DailyClose[] | null, now: Date): TvTriggerPanel {
  const line = plainNumber(XRP_DAILY_CLOSE_USD);
  if (!closes) {
    return {
      status: "down",
      line,
      close: NOT_CONNECTED,
      versus: `vs ${line}`,
      streak: NOT_CONNECTED,
      state: NOT_CONNECTED,
    };
  }
  const view = evaluateXrpTrigger(closes, now);
  const close = view.lastClose === null ? "no completed close" : plainNumber(view.lastClose);
  const versus = view.lastClose === null ? `vs ${line}` : `${view.above ? "above" : "below"} ${line}`;
  return {
    status: "ready",
    line,
    close,
    versus,
    streak: `${view.streak} of ${view.holdDays}`,
    state: cleanText(view.stateLabel),
  };
}

function catalystPanel(events: readonly CalendarEvent[] | null, now: Date): TvCatalystPanel {
  if (!events) return { status: "down", items: [] };
  const scrubbed = events.map((event) => scrubTextFields(event));
  const items = catalystBuckets(scrubbed, now)
    .flatMap((bucket) => bucket.events)
    .slice(0, FACTORY_CATALYST_LIMIT)
    .flatMap((item) => {
      const title = cleanText(item.title);
      const when = cleanText(item.when);
      if (!title) return [];
      return [{ when, title }];
    });
  return { status: "list", items };
}

function lessonPanel(lessons: readonly Lesson[] | null): TvLessonPanel {
  if (!lessons) return { status: "down", date: null, title: null, body: null };
  const latest = visibleLessons(lessons, true).find((lesson) => !lessonPrivate(lesson));
  if (!latest) return { status: "empty", date: null, title: null, body: null };
  const title = cleanText(latest.title);
  const body = clip(latest.lesson, LESSON_CAP);
  if (!title || !body) return { status: "empty", date: null, title: null, body: null };
  return {
    status: "entry",
    date: latest.date,
    title,
    body,
  };
}

function playRank(bet: Bet): number {
  if (bet.status !== "open") return 50;
  if (bet.tier === "STRONG") return 0;
  if (bet.tier === "LEAN") return 1;
  return 2;
}

function fightPanel(
  events: readonly CalendarEvent[] | null,
  bets: readonly Bet[] | null,
  now: Date,
): TvFightPanel {
  if (!events) return { status: "down", title: null, when: null, plays: null };
  const scrubbed = events.map((event) => scrubTextFields(event));
  const promotions = fightPromotions({
    bets: bets ?? [],
    events: scrubbed,
    now,
  });
  const upcoming = promotions
    .flatMap((promotion) => promotion.events)
    .filter((event) => {
      const ms = event.when ? Date.parse(event.when) : Number.NaN;
      return Number.isFinite(ms) && ms >= now.getTime();
    })
    .sort((left, right) => Date.parse(left.when ?? "") - Date.parse(right.when ?? ""));
  const next = upcoming[0];
  if (!next) return { status: "empty", title: null, when: null, plays: bets ? [] : null };
  const title = cleanText(next.title);
  const ranked = next.bets
    .slice()
    .sort((left, right) => playRank(left) - playRank(right) || left.fight.localeCompare(right.fight));
  const seen = new Set<string>();
  const plays: TvPlay[] = [];
  for (const bet of ranked) {
    if (plays.length >= FACTORY_PLAY_LIMIT) break;
    const pick = cleanText(bet.pick);
    const fight = cleanText(bet.fight);
    if (!pick || !fight) continue;
    const key = `${fight}|${pick}`;
    if (seen.has(key)) continue;
    seen.add(key);
    plays.push({
      fight,
      pick,
      tier: bet.tier === "STRONG" || bet.tier === "LEAN" ? bet.tier : null,
    });
  }
  return {
    status: "card",
    title: title || "Next card",
    when: next.when ? cleanText(whenLabel(next.when)) : "",
    plays: bets ? plays : null,
  };
}

function machineSlot(health: MachineHealth | null | undefined): MachineHealth | null {
  if (!health) return null;
  if (!Number.isFinite(health.score)) return null;
  const score = Math.max(0, Math.min(100, Math.round(health.score)));
  const label = cleanText(health.label);
  if (!label) return null;
  if (health.tone !== "steady" && health.tone !== "watch" && health.tone !== "down") return null;
  return { score, label, tone: health.tone };
}

export function assembleFactoryFloor(input: FactoryFloorInput): FactoryFloorModel {
  return {
    clock: chicagoClock(input.now),
    nodes: nodesFrom(input.floor),
    treasury: TREASURY_LINE,
    build: buildPanel(input.buildItems),
    control: controlPanel(input.control, input.now),
    approvalsPending:
      typeof input.approvalsPending === "number" && Number.isFinite(input.approvalsPending)
        ? Math.max(0, Math.round(input.approvalsPending))
        : null,
    trigger: triggerPanel(input.closes, input.now),
    catalysts: catalystPanel(input.events, input.now),
    lesson: lessonPanel(input.lessons),
    fight: fightPanel(input.events, input.bets, input.now),
    machine: machineSlot(input.machine === undefined ? MACHINE_HEALTH : input.machine),
    showMachine: SHOW_MACHINE_SLOT,
  };
}

/** Keys and dollar text a public wall must not carry. A `$` fails closed. */
export function factoryFloorLeaks(model: FactoryFloorModel): string[] {
  const serialized = JSON.stringify(model);
  const leaks = publicPayloadLeaks(model);
  if (serialized.includes("$") || /\bUSD\b/.test(serialized)) leaks.push("dollar-char");
  return leaks;
}
