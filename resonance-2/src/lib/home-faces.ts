import { nodeShelved } from "@/lib/node-visibility";
import { predictionsHeadline } from "@/lib/home-lines";
import { hasMoneyText } from "@/lib/public-mode";
import type { ParentSummaryLine } from "@/lib/node-parents";

/**
 * One home tile. Every home node uses this shape:
 * glyph, name, one headline, one status line.
 * Callers pass facts they already loaded. A missing fact stays
 * "not connected" or "not recorded". Nothing here invents a number.
 */
export type HomeFaceTone = "" | "up" | "down" | "flat";

export type HomeFace = {
  id: string;
  /** Icon key. Defaults to `id`, so a child tile can keep its own id and the parent glyph. */
  glyph?: string;
  href: string;
  name: string;
  headline: string;
  status: string;
  live: boolean;
  tone: HomeFaceTone;
  /** Public finance stays on the floor and does not open. */
  locked?: boolean;
};

export const HOME_FACE_SLOTS = ["glyph", "name", "headline", "status"] as const;

/**
 * Desktop content box at 1440×900 after the toolbar, header, week strip, and footer.
 * The column pick is the one whose square still fits that box.
 */
export const DESKTOP_FACE_BOX = { width: 1324, height: 738, gap: 6.4 } as const;

/**
 * Private home paints five parents plus build, control, YouTube, system, and lessons.
 * Owner adds roundtable and chain security. Health is owner-only.
 * A shelved parent is one fewer square. Pass `shelved: []` to count the full floor.
 */
export function privateHomeNodeCount(input: {
  owner: boolean;
  health: boolean;
  shelved?: readonly string[];
}): number {
  const shelvedParent = nodeShelved("fitness", input.shelved) ? 1 : 0;
  return 10 - shelvedParent + (input.owner && input.health ? 1 : 0) + (input.owner ? 2 : 0);
}

/**
 * Public home paints the same owner floor, including finance and roundtable.
 * Fight Desk and Health are optional. Fitness was one of the nine always-on tiles.
 */
export function publicHomeNodeCount(input: {
  fight: boolean;
  health: boolean;
  shelved?: readonly string[];
}): number {
  const shelvedParent = nodeShelved("fitness", input.shelved) ? 1 : 0;
  return 11 - shelvedParent + (input.fight ? 1 : 0) + (input.health ? 1 : 0);
}

/** Columns and rows that keep every square inside the box. Phone stays on 3. */
export function faceGridPlan(
  count: number,
  box: { width: number; height: number; gap: number },
  phone = false,
): { columns: number; rows: number; size: number } {
  const n = Math.max(1, Math.floor(count));
  if (phone) {
    const columns = Math.min(3, n);
    const rows = Math.ceil(n / columns);
    const size = Math.min(
      (box.width - box.gap * (columns - 1)) / columns,
      (box.height - box.gap * (rows - 1)) / rows,
    );
    return { columns, rows, size };
  }
  let columns = 1;
  let size = 0;
  for (let cols = 1; cols <= n; cols += 1) {
    const rows = Math.ceil(n / cols);
    const next = Math.min(
      (box.width - box.gap * (cols - 1)) / cols,
      (box.height - box.gap * (rows - 1)) / rows,
    );
    if (next > size) {
      size = next;
      columns = cols;
    }
  }
  return { columns, rows: Math.ceil(n / columns), size };
}

const NOT_CONNECTED = "not connected";
const NOT_RECORDED = "not recorded";

function toneFromStatus(status: string): HomeFaceTone {
  const match = /([+-]\d+(?:\.\d+)?)%/.exec(status);
  if (!match?.[1]) return "";
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return "";
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

/**
 * One node-page tile. Same slots as a home face.
 * An empty headline is "not connected". An empty status is "not recorded".
 * Public mode replaces any dollar line with "not recorded".
 */
export function tileFace(input: {
  id: string;
  glyph?: string;
  href: string;
  name: string;
  headline: string | null | undefined;
  status: string | null | undefined;
  live?: boolean;
  publicMode?: boolean;
}): HomeFace {
  return finish(
    {
      id: input.id,
      glyph: input.glyph,
      href: input.href,
      name: input.name,
      headline: input.headline?.trim() || "",
      status: input.status?.trim() || "",
      live: input.live ?? true,
    },
    input.publicMode ?? false,
  );
}

/**
 * A value child. The headline is the dollar position when one exists.
 * The live price is the status. No position: the label is the headline and the price stays under it.
 */
export function valueTileFace(input: {
  id: string;
  glyph: string;
  href: string;
  name: string;
  headline: string | null;
  priceLine: string | null;
  label: string | null;
  publicMode?: boolean;
}): HomeFace {
  const headline = input.headline?.trim() || "";
  return tileFace({
    id: input.id,
    glyph: input.glyph,
    href: input.href,
    name: input.name,
    headline: headline || input.label,
    status: input.priceLine,
    live: headline.length > 0 || Boolean(input.priceLine?.trim()),
    publicMode: input.publicMode,
  });
}

function finish(face: Omit<HomeFace, "tone">, publicMode: boolean): HomeFace {
  let headline = face.headline.trim() || NOT_CONNECTED;
  let status = face.status.trim() || NOT_RECORDED;
  if (publicMode && hasMoneyText(headline)) headline = NOT_RECORDED;
  if (publicMode && hasMoneyText(status)) status = NOT_RECORDED;
  return { ...face, headline, status, tone: toneFromStatus(status) };
}

function isDollar(value: string): boolean {
  return /^[-−]?~?\$/.test(value.trim());
}

/** Crypto or AI Stocks. Private mode leads with the dollar sum. Public mode leads with the book weight. */
export function bookHomeFace(input: {
  id: "crypto" | "ai-stocks";
  name: string;
  href: string;
  publicMode: boolean;
  summary: ParentSummaryLine | null;
  connected: boolean;
  mover: string | null;
  weightLabel?: string | null;
  growthLabel?: string | null;
}): HomeFace {
  if (input.publicMode) {
    const weight = input.weightLabel?.trim() || "";
    return finish(
      {
        id: input.id,
        href: input.href,
        name: input.name,
        headline: weight || NOT_CONNECTED,
        status: input.growthLabel?.trim() || NOT_RECORDED,
        live: weight.length > 0 && !hasMoneyText(weight),
      },
      true,
    );
  }
  const summary = input.summary;
  const dollar = summary && isDollar(summary.value) ? summary.value : null;
  if (!input.connected || !dollar) {
    const coverage = summary?.coverage && summary.value.trim() ? summary.value.trim() : NOT_RECORDED;
    return finish(
      {
        id: input.id,
        href: input.href,
        name: input.name,
        headline: NOT_CONNECTED,
        status: coverage,
        live: false,
      },
      false,
    );
  }
  const status = summary?.coverage
    ? summary.unit.trim() || NOT_RECORDED
    : input.mover?.trim() || summary?.unit.trim() || "sum";
  return finish(
    {
      id: input.id,
      href: input.href,
      name: input.name,
      headline: dollar,
      status,
      live: true,
    },
    false,
  );
}

export function fitnessHomeFace(input: {
  value: string | null;
  unit: string | null;
  lines: readonly string[];
  publicMode: boolean;
}): HomeFace {
  const lines = input.lines.filter((line) => {
    if (!line.trim()) return false;
    if (!input.publicMode) return true;
    if (hasMoneyText(line)) return false;
    return !/\bbpm\b/i.test(line);
  });
  const value = input.value?.trim() && !(input.publicMode && hasMoneyText(input.value)) ? input.value.trim() : "";
  const unit = input.unit?.trim() ?? "";
  const headline = value || lines[0] || NOT_CONNECTED;
  const status = value ? lines[0] || unit || NOT_RECORDED : lines[1] || (value ? unit : "") || NOT_RECORDED;
  return finish(
    {
      id: "fitness",
      href: "/n/fitness",
      name: "Fitness",
      headline,
      status: status || NOT_RECORDED,
      live: Boolean(value || lines.length > 0),
    },
    input.publicMode,
  );
}

/**
 * Public finance tile. It stays on the floor so the node is visible,
 * with a Private lock and no link. No balance, account count, or date.
 * The argument is ignored so a caller cannot paint a private fact.
 */
export function financePublicHomeFace(
  _input?: { accountCount: number; asOfLine: string } | null,
): HomeFace {
  return finish(
    {
      id: "finance",
      href: "",
      name: "Finance",
      headline: "Private",
      status: "locked",
      live: false,
      locked: true,
    },
    true,
  );
}

/** Owner snapshot leads with net worth. No snapshot keeps the private label and no balance. */
export function financeHomeFaceTile(snapshot: { headline: string; asOfLine: string } | null): HomeFace {
  if (!snapshot) {
    return finish(
      {
        id: "finance",
        href: "/n/finance",
        name: "Finance",
        headline: "Bank linked",
        status: "private",
        live: false,
      },
      false,
    );
  }
  const partial = /\bpartial\b/i.test(snapshot.headline);
  const amount = snapshot.headline.replace(/\s+partial\b/i, "").trim();
  const asOf = snapshot.asOfLine.trim();
  return finish(
    {
      id: "finance",
      href: "/n/finance",
      name: "Finance",
      headline: isDollar(amount) ? amount : NOT_CONNECTED,
      status: [partial ? "partial" : "", asOf].filter(Boolean).join(" · ") || NOT_RECORDED,
      live: isDollar(amount),
    },
    false,
  );
}

export function fightHomeFace(input: {
  publicMode: boolean;
  headline: string | null;
  priceLine: string | null;
  record: string | null;
  /** The bet book loaded. The dollar bankroll did not, because deposits could not be read. */
  depositsUnavailable?: boolean;
}): HomeFace | null {
  if (input.publicMode) {
    const record = input.record?.trim() ?? "";
    if (!record || hasMoneyText(record)) return null;
    return finish(
      {
        id: "fight-desk",
        href: "/n/fight-desk",
        name: "Fight Desk",
        headline: record,
        status: "record",
        live: true,
      },
      true,
    );
  }
  const dollar = input.headline && isDollar(input.headline) ? input.headline : null;
  if (dollar) {
    return finish(
      {
        id: "fight-desk",
        href: "/n/fight-desk",
        name: "Fight Desk",
        headline: dollar,
        status: input.priceLine?.trim() || NOT_RECORDED,
        live: true,
      },
      false,
    );
  }
  const record = input.record?.trim() ?? "";
  if (input.depositsUnavailable && record && !hasMoneyText(record)) {
    return finish(
      {
        id: "fight-desk",
        href: "/n/fight-desk",
        name: "Fight Desk",
        headline: record,
        status: "deposits unavailable",
        live: false,
      },
      false,
    );
  }
  return finish(
    {
      id: "fight-desk",
      href: "/n/fight-desk",
      name: "Fight Desk",
      headline: "unavailable",
      status: NOT_RECORDED,
      live: false,
    },
    false,
  );
}

/** Private Fight Desk home tile. A real zero stays. A missing deposit read does not erase the bet book. */
export function fightDeskHomeFace(input: {
  bankroll: { headline: string; priceLine: string } | null;
  book: { recordLabel: string } | null;
  depositsUnavailable?: boolean;
}): HomeFace | null {
  return fightHomeFace({
    publicMode: false,
    headline: input.bankroll ? predictionsHeadline(input.bankroll.headline) : null,
    priceLine: input.bankroll?.priceLine ?? null,
    record: input.book?.recordLabel ?? null,
    depositsUnavailable: input.depositsUnavailable === true && input.bankroll === null,
  });
}

export function buildHomeFace(input: {
  unavailable: boolean;
  percentLabel: string | null;
  lines: readonly string[];
  publicMode: boolean;
}): HomeFace {
  const lines = input.lines.filter((line) => line.trim() && !(input.publicMode && hasMoneyText(line)));
  const percent = input.percentLabel?.trim() ?? "";
  const readable = !input.unavailable && !(input.publicMode && hasMoneyText(percent));
  if (readable && percent.length === 0) {
    return finish(
      {
        id: "build",
        href: "/n/build",
        name: "Build",
        headline: "0%",
        status: lines[0] || "no items",
        live: false,
      },
      input.publicMode,
    );
  }
  const ready = readable && percent.length > 0;
  return finish(
    {
      id: "build",
      href: "/n/build",
      name: "Build",
      headline: ready ? percent : "unavailable",
      status: lines[0] || (ready ? "complete" : NOT_RECORDED),
      live: ready,
    },
    input.publicMode,
  );
}

export function controlHomeFace(lines: readonly string[], live: boolean, publicMode: boolean): HomeFace {
  const safe = lines.filter((line) => line.trim() && !(publicMode && hasMoneyText(line)));
  return finish(
    {
      id: "control",
      href: "/n/control",
      name: "Control Room",
      headline: safe[0] || NOT_CONNECTED,
      status: safe[1] || NOT_RECORDED,
      live: live && safe.length > 0,
    },
    publicMode,
  );
}

export function healthHomeFace(report: { percent: number | null; ready: number; scores: readonly unknown[] }): HomeFace {
  const percent = report.percent;
  const ready = Number.isInteger(report.ready) ? report.ready : 0;
  const total = report.scores.length;
  return finish(
    {
      id: "health",
      href: "/n/health",
      name: "Health",
      headline: percent === null ? NOT_CONNECTED : `${percent}%`,
      status: `${ready} of ${total}`,
      live: percent !== null,
    },
    false,
  );
}

/** Gear count is the metric. The channel line stays the status. The brick list is on the YouTube page. */
export function youtubeHomeFace(lines: readonly string[]): HomeFace {
  const channel = lines.find((line) => /channel/i.test(line))?.trim() || NOT_CONNECTED;
  const gear = lines.find((line) => /gear/i.test(line))?.replace(/^Gear:\s*/i, "").trim() || NOT_RECORDED;
  return finish(
    {
      id: "youtube",
      href: "/n/youtube",
      name: "YouTube",
      headline: gear,
      status: channel,
      live: true,
    },
    false,
  );
}

export function systemHomeFace(agents: number, nodes: number): HomeFace {
  return finish(
    {
      id: "system",
      href: "/n/system",
      name: "System",
      headline: `${nodes} nodes`,
      status: `${agents} agents`,
      live: true,
    },
    false,
  );
}

export function lessonsHomeFace(card: { unavailable: boolean; count: number; latestTitle: string | null }, publicMode: boolean): HomeFace {
  if (card.unavailable) {
    return finish(
      {
        id: "lessons",
        href: "/n/lessons",
        name: "Lessons",
        headline: "unavailable",
        status: NOT_RECORDED,
        live: false,
      },
      publicMode,
    );
  }
  const title = card.latestTitle?.trim() ?? "";
  const safeTitle = publicMode && hasMoneyText(title) ? "" : title;
  const empty = card.count === 0 ? "no lessons yet" : NOT_RECORDED;
  return finish(
    {
      id: "lessons",
      href: "/n/lessons",
      name: "Lessons",
      headline: String(card.count),
      status: safeTitle || empty,
      live: card.count > 0,
    },
    publicMode,
  );
}

export function roundtableHomeFace(card: { unavailable: boolean; count: number; lines: readonly string[] }): HomeFace {
  if (card.unavailable) {
    return finish(
      {
        id: "roundtable",
        href: "/n/roundtable",
        name: "Roundtable",
        headline: "unavailable",
        status: NOT_RECORDED,
        live: false,
      },
      false,
    );
  }
  return finish(
    {
      id: "roundtable",
      href: "/n/roundtable",
      name: "Roundtable",
      headline: String(card.count),
      status: card.lines[0]?.trim() || "no messages yet",
      live: card.count > 0,
    },
    false,
  );
}

export function chainHomeFace(
  card: { unavailable: boolean; count: number; lines: readonly string[] },
  publicMode: boolean,
): HomeFace {
  if (card.unavailable) {
    return finish(
      {
        id: "chain-security",
        href: "/n/chain-security",
        name: "Chain Security",
        headline: "unavailable",
        status: NOT_RECORDED,
        live: false,
      },
      publicMode,
    );
  }
  const line = card.lines.find((item) => item.trim() && !(publicMode && hasMoneyText(item)))?.trim() ?? "";
  return finish(
    {
      id: "chain-security",
      href: "/n/chain-security",
      name: "Chain Security",
      headline: String(card.count),
      status: line || (card.count === 0 ? "No incidents yet" : "logged"),
      live: card.count > 0,
    },
    publicMode,
  );
}
