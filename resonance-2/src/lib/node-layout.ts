/**
 * Shared node-page layout rules.
 * Status and the updated line come from data the page already loaded.
 * A missing timestamp stays blank. The render clock is not a timestamp.
 */

export const NODE_STATUS_LABEL = {
  live: "Live",
  partial: "Partial",
  "not-connected": "Not connected",
} as const;

export type NodeStatus = keyof typeof NODE_STATUS_LABEL;

/** One loaded source. `missing` is no row and no connection. */
export type NodePart = "live" | "partial" | "missing";

export const SECTION_ORDER = ["numbers", "trends", "lists"] as const;
export type NodeSectionKind = (typeof SECTION_ORDER)[number];

export const SECTION_LABEL: Record<NodeSectionKind, string> = {
  numbers: "Key numbers",
  trends: "Trends",
  lists: "Lists/Children",
};

export type CardSpan = "stat" | "trend" | "list";

/** Shared card face. Stat cards and empty cards use the same class pair. */
export const EQUAL_CARD_CLASS = "node-card node-card-equal";

export const EMPTY_CARD_NOTE = "Connect to see data";

/**
 * Live when every part is live.
 * Not connected when there is nothing to read.
 * Anything in between is partial.
 */
export function deriveNodeStatus(parts: readonly NodePart[]): NodeStatus {
  if (parts.length === 0 || parts.every((part) => part === "missing")) return "not-connected";
  if (parts.every((part) => part === "live")) return "live";
  return "partial";
}

const EMPTY_HEADLINE = /^(?:—|-|not recorded|not connected|stats not connected)$/i;

/** True when a headline is blank or a placeholder, so the card stays an empty box. */
export function headlineIsEmpty(value: string | null | undefined): boolean {
  if (value == null) return true;
  return EMPTY_HEADLINE.test(value.trim());
}

export function cardSpanClass(span: CardSpan): string {
  if (span === "trend") return "node-span-6";
  if (span === "list") return "node-span-12";
  return "node-span-3";
}

/**
 * Newest clock time already loaded on the page.
 * Blank, unparseable, and date-only values are skipped. No stamps returns null.
 * A date with no time is not a timestamp, so the header can omit Updated.
 */
export function latestTimestamp(values: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value == null) continue;
    const trimmed = value.trim();
    if (!trimmed || !trimmed.includes("T")) continue;
    const ms = Date.parse(trimmed);
    if (!Number.isFinite(ms) || ms <= bestMs) continue;
    bestMs = ms;
    best = trimmed;
  }
  return best;
}

/**
 * "Updated 2:04 PM CT" from a real timestamp.
 * Null, blank, and unparseable values return null so the header can omit the line.
 */
export function formatUpdatedCt(timestamp: string | null | undefined): string | null {
  if (timestamp == null) return null;
  const trimmed = timestamp.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(date)
    .replace(/\u202f/g, " ")
    .replace(/\u00a0/g, " ");
  return `Updated ${time} CT`;
}
