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

/** Weekday rhythm. Occurrences are derived in America/Chicago; they are not stored as rows. */
export type CalendarRecurrence = {
  freq: "weekdays";
  timeZone: typeof CALENDAR_TIME_ZONE;
  /** HH:mm wall time in America/Chicago. */
  time: string;
};

/**
 * One Resonance-owned calendar row.
 * Agents write cadence, capital, and build. The founder writes gates.
 */
export type CalendarEvent = {
  id: string;
  lane: CalendarLane;
  /** ISO-8601 with a numeric offset or `Z`. */
  start: string;
  title: string;
  status: CalendarStatus;
  writer: CalendarWriter;
  link?: string;
  note?: string;
  recurrence?: CalendarRecurrence;
};

export const CALENDAR_LANE_LABELS: Record<CalendarLane, string> = {
  cadence: "Cadence",
  capital: "Capital",
  build: "Build",
  gates: "Gates",
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
