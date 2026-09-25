export const CALENDAR_LANES = ["cadence", "capital", "build", "gates"] as const;

export type CalendarLane = (typeof CALENDAR_LANES)[number];

export const CALENDAR_STATUSES = [
  "scheduled",
  "history",
  "pending",
  "awaiting",
  "merged",
  "open",
] as const;

export type CalendarStatus = (typeof CALENDAR_STATUSES)[number];

export const CALENDAR_WRITERS = ["agent", "founder"] as const;

export type CalendarWriter = (typeof CALENDAR_WRITERS)[number];

export const CALENDAR_TIME_ZONE = "America/Chicago";

/** Catalyst tags. Do not invent a node outside this list. */
export const CATALYST_NODES = [
  "XRP",
  "SUI",
  "FLR",
  "PWR",
  "ETN",
  "VRT",
  "GEV",
  "CEG",
  "HUBB",
  "MACRO",
] as const;

export type CatalystNode = (typeof CATALYST_NODES)[number];

export const CATALYST_STATUSES = ["confirmed", "tentative"] as const;

export type CatalystStatus = (typeof CATALYST_STATUSES)[number];

export const DATE_PRECISIONS = ["day", "window", "month"] as const;

export type DatePrecision = (typeof DATE_PRECISIONS)[number];

/** Weekday rhythm. Occurrences are derived in America/Chicago; they are not stored as rows. */
export type CalendarRecurrence = {
  freq: "weekdays";
  timeZone: typeof CALENDAR_TIME_ZONE;
  /** HH:mm wall time in America/Chicago. */
  time: string;
};

/**
 * One Resonance-owned calendar row.
 * Lane rows keep Cadence, Capital, Build, and Gates.
 * Catalysts are a separate type (`kind: "catalyst"`), tagged with a node.
 * Agents write cadence, capital, and build. The founder writes gates.
 */
export type CalendarEvent = {
  id: string;
  /** Set on catalysts. Lane rows omit it. */
  kind?: "catalyst";
  /** Required on lane rows. Omitted on catalysts. */
  lane?: CalendarLane;
  /** Required on catalysts. One of the ten catalyst nodes. */
  node?: CatalystNode;
  /** ISO-8601 with a numeric offset or `Z`. */
  start: string;
  /** Inclusive civil end `YYYY-MM-DD` for a multi-day row. */
  end?: string;
  title: string;
  status: CalendarStatus | CatalystStatus;
  writer: CalendarWriter;
  link?: string;
  /** Required on catalysts. https URL shown in the detail. */
  sourceUrl?: string;
  note?: string;
  location?: string;
  /** `month` is a month-level item. `window` spans a range and is not an exact day. */
  datePrecision?: DatePrecision;
  /** No wall clock. The desk prints "All day" instead of midnight. */
  allDay?: boolean;
  recurrence?: CalendarRecurrence;
};

export function isCatalystNode(value: string): value is CatalystNode {
  return (CATALYST_NODES as readonly string[]).includes(value);
}

export const CALENDAR_LANE_LABELS: Record<CalendarLane, string> = {
  cadence: "Cadence",
  capital: "Capital",
  build: "Build",
  gates: "Gates",
};

export const CALENDAR_LANE_CHIP: Record<CalendarLane, string> = {
  cadence: "Cad",
  capital: "Cap",
  build: "Bld",
  gates: "Gate",
};

/**
 * Seed / local fallback. Cadence and the Monday capital history only.
 * Build and Gates stay empty until a real write lands.
 */
export const calendarSeed: CalendarEvent[] = [
  {
    id: "cadence-daily-brief",
    lane: "cadence",
    start: "2026-09-21T07:00:00-05:00",
    title: "Daily Brief",
    status: "scheduled",
    writer: "agent",
    recurrence: {
      freq: "weekdays",
      timeZone: CALENDAR_TIME_ZONE,
      time: "07:00",
    },
    note: "OS rhythm. Weekdays at 7:00 AM America/Chicago.",
  },
  {
    id: "capital-monday-agentic-sui-6ai",
    lane: "capital",
    start: "2026-09-21T08:30:00-05:00",
    title: "Agentic SUI→6 AI",
    status: "history",
    writer: "agent",
    link: "/log?ticker=SUI&from=2026-09-21&to=2026-09-21",
    note: "Monday capital history. Opens the operator log for that SUI day.",
  },
];
