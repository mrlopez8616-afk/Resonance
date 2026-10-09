import { FLOOR_NODES } from "@/data/floor-nodes";
import { NODE_PARENT, PARENTS } from "@/data/node-parents";
import { buildSectionLabel } from "@/lib/build-tracker";

/**
 * Phone drill-down. Back goes up exactly one level.
 * A parent page returns to the floor. A child page returns to its parent.
 * An unknown parent, or a route this map does not own, returns home.
 * This is not history.back().
 */

export type PhoneTarget = {
  href: string;
  label: string;
};

export type PhoneTrail = {
  back: PhoneTarget | null;
  crumbs: PhoneTarget[];
};

export const PHONE_TABS = [
  { href: "/", label: "Home" },
  { href: "/log", label: "Log" },
  { href: "/calendar", label: "Calendar" },
  { href: "/n/build", label: "Build" },
  { href: "/settings/security", label: "Settings" },
] as const;

/** Left-edge start zone, in CSS pixels. */
export const SWIPE_EDGE_PX = 24;
/** Horizontal travel that commits an up-one-level swipe. */
export const SWIPE_COMMIT_PX = 80;
/** Downward travel from the top of the page that commits a refresh. */
export const PULL_COMMIT_PX = 70;

export type SwipeSample = {
  startX: number;
  startY: number;
  x: number;
  y: number;
  standalone: boolean;
  /** The gesture began on a node that already scrolls sideways. */
  horizontalScroller: boolean;
  /** Chart, field, or other surface that owns horizontal drags. */
  blockedSurface: boolean;
};

export type SwipeDecision = "ignore" | "track" | "commit";

export type PullSample = {
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Window or main scroller offset. A pull only starts at the top. */
  scrollTop: number;
  standalone: boolean;
  horizontalScroller: boolean;
  blockedSurface: boolean;
};

type PullListener = () => void | Promise<void>;
const pullListeners = new Set<PullListener>();

/** Client price pollers register here so a pull refetches them with the server render. */
export function subscribePullRefresh(listener: PullListener): () => void {
  pullListeners.add(listener);
  return () => {
    pullListeners.delete(listener);
  };
}

export function notifyPullRefresh(): Promise<void> {
  const pending = [...pullListeners].map((listener) => Promise.resolve().then(listener));
  return Promise.allSettled(pending).then(() => undefined);
}

/** Local clock, 12-hour, no meridiem. `Updated 9:05`. */
export function formatUpdatedTime(date: Date): string {
  const hour = date.getHours() % 12 || 12;
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `Updated ${hour}:${minute}`;
}

const HOME: PhoneTarget = { href: "/", label: "Home" };
const FLOOR: PhoneTarget = { href: "/", label: "Floor" };

const PARENT_LABELS: Record<string, string> = {
  ...Object.fromEntries(PARENTS.map((parent) => [parent.id, parent.label])),
  build: "Build",
};

/** Titles for children that are not floor tickers. Kept aligned by phone-nav tests. */
const CHILD_TITLES: Record<string, string> = {
  steps: "Steps",
  runs: "Runs",
  lifting: "Lifting",
  heart: "Heart",
  "cash-flow": "Cash Flow",
  bills: "Bills & Subscriptions",
  debt: "Debt",
  "net-worth": "Net Worth",
  fees: "Fees & Alerts",
  bankroll: "Bankroll",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function segments(pathname: string): string[] {
  const path = pathname.split("?")[0]?.split("#")[0] ?? "";
  return path.split("/").filter(Boolean);
}

/** Same destination as `nodePageHref`, without pulling the floor helpers into the phone client. */
function nodeHref(ticker: string): string | null {
  const id = ticker.trim().toLowerCase();
  const node = FLOOR_NODES.find((item) => item.id === id && item.status !== "empty");
  if (!node) return null;
  const parentId = NODE_PARENT[node.id as keyof typeof NODE_PARENT];
  if (!parentId || parentId === "fight-desk") return null;
  return `/n/${parentId}/${node.id}`;
}

/** Public mode never prints the treasury token in the phone trail. */
export function publicTrailLabel(href: string, label: string): string {
  if (href === "/n/crypto/xrp" || label === "XRP") return "Treasury";
  return label;
}

function childLabel(nodeId: string, parentId?: string): string {
  if (parentId === "build") return buildSectionLabel(nodeId);
  const titled = CHILD_TITLES[nodeId];
  if (titled) return titled;
  const floor = FLOOR_NODES.find((node) => node.id === nodeId && node.status !== "empty");
  if (floor) return floor.ticker;
  return slugLabel(nodeId);
}

function slugLabel(slug: string): string {
  if (slug === "ufc-332") return "UFC 332";
  return slug
    .split("-")
    .map((part) => {
      if (part === "ufc" || part === "dwcs") return part.toUpperCase();
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function dayLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return slugLabel(day);
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return day;
  return `${month} ${Number(match[3])}`;
}

function eventParent(slug: string): PhoneTarget {
  const text = slug.toLowerCase();
  if (text.includes("contender") || text.includes("dwcs")) {
    return { href: "/fights/contender-series", label: "Contender Series" };
  }
  return { href: "/fights/ufc", label: "UFC" };
}

function homeTrail(): PhoneTrail {
  return { back: HOME, crumbs: [HOME] };
}

/**
 * One-level trail for a pathname.
 * `search` may be `?ticker=NVDA` or `ticker=NVDA`. It only changes `/log`.
 */
export function phoneTrail(pathname: string, search = ""): PhoneTrail {
  const parts = segments(pathname);
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  if (parts.length === 0) return { back: null, crumbs: [HOME] };

  if (parts[0] === "n") {
    if (parts[1] === "system") {
      const system: PhoneTarget = { href: "/n/system", label: "System Map" };
      if (parts.length === 2) return { back: FLOOR, crumbs: [HOME, system] };
      if (parts.length === 3 && parts[2] === "live") {
        return {
          back: system,
          crumbs: [HOME, system, { href: "/n/system/live", label: "Live" }],
        };
      }
      return homeTrail();
    }
    const parentId = parts[1];
    if (!parentId || parts.length > 3) return homeTrail();
    if (parentId === "lessons" && parts.length === 2) {
      const lessons: PhoneTarget = { href: "/n/lessons", label: "Lessons" };
      return { back: HOME, crumbs: [HOME, lessons] };
    }
    const parentLabel = PARENT_LABELS[parentId];
    if (!parentLabel) return homeTrail();
    const parent: PhoneTarget = { href: `/n/${parentId}`, label: parentLabel };
    const nodeId = parts[2];
    if (!nodeId) return { back: FLOOR, crumbs: [HOME, parent] };
    return {
      back: parent,
      crumbs: [HOME, parent, { href: `/n/${parentId}/${nodeId}`, label: childLabel(nodeId, parentId) }],
    };
  }

  if (parts[0] === "log") {
    if (parts.length !== 1) return homeTrail();
    const log: PhoneTarget = { href: "/log", label: "Log" };
    const ticker = params.get("ticker")?.trim() ?? "";
    if (!ticker) return { back: null, crumbs: [HOME, log] };
    const href = nodeHref(ticker);
    if (!href) return homeTrail();
    return {
      back: { href, label: ticker.toUpperCase() },
      crumbs: [
        HOME,
        log,
        { href: `/log?ticker=${encodeURIComponent(ticker)}`, label: ticker.toUpperCase() },
      ],
    };
  }

  if (parts[0] === "calendar") {
    const calendar: PhoneTarget = { href: "/calendar", label: "Calendar" };
    if (parts.length === 1) return { back: null, crumbs: [HOME, calendar] };
    if (parts.length !== 2) return homeTrail();
    const day = parts[1] ?? "";
    return {
      back: calendar,
      crumbs: [HOME, calendar, { href: `/calendar/${day}`, label: dayLabel(day) }],
    };
  }

  if (parts[0] === "settings") {
    if (parts.length === 2 && parts[1] === "security") {
      return { back: null, crumbs: [HOME, { href: "/settings/security", label: "Settings" }] };
    }
    return homeTrail();
  }

  if (parts[0] === "fights") {
    const desk: PhoneTarget = { href: "/n/fight-desk", label: "Fight Desk" };
    const fights: PhoneTarget = { href: "/fights", label: "Fights" };
    if (parts.length === 1) return { back: desk, crumbs: [HOME, desk, fights] };
    if (parts.length > 3) return homeTrail();
    const second = parts[1] ?? "";
    if (second === "ufc" || second === "contender-series") {
      if (parts.length !== 2) return homeTrail();
      const promo: PhoneTarget = {
        href: `/fights/${second}`,
        label: second === "ufc" ? "UFC" : "Contender Series",
      };
      return { back: fights, crumbs: [HOME, desk, fights, promo] };
    }
    if (second === "main-card" || second === "prelims") {
      const ufc: PhoneTarget = { href: "/fights/ufc", label: "UFC" };
      return { back: ufc, crumbs: [HOME, fights, ufc] };
    }
    const event: PhoneTarget = { href: `/fights/${second}`, label: slugLabel(second) };
    if (parts.length === 2) {
      const back = eventParent(second);
      return { back, crumbs: [HOME, desk, fights, back, event] };
    }
    const fightId = parts[2] ?? "";
    return {
      back: event,
      crumbs: [HOME, fights, event, { href: `/fights/${second}/${fightId}`, label: slugLabel(fightId) }],
    };
  }

  return homeTrail();
}

export function phoneTabActive(href: string, pathname: string): boolean {
  const path = segments(pathname).join("/");
  const normalized = path ? `/${path}` : "/";
  if (href === "/n/build") return normalized === "/n/build" || normalized.startsWith("/n/build/");
  if (href === "/") {
    if (normalized === "/n/build" || normalized.startsWith("/n/build/")) return false;
    return normalized === "/" || normalized.startsWith("/n/") || normalized.startsWith("/fights");
  }
  if (href === "/settings/security") return normalized === "/settings" || normalized.startsWith("/settings/");
  return normalized === href || normalized.startsWith(`${href}/`);
}

/**
 * Left-edge swipe, finger moving right.
 * Commit only after about 80px of horizontal travel that stays more
 * horizontal than vertical. Standalone, charts, and sideways scrollers opt out.
 */
export function swipeDecision(sample: SwipeSample): SwipeDecision {
  if (!sample.standalone || sample.horizontalScroller || sample.blockedSurface) return "ignore";
  if (sample.startX > SWIPE_EDGE_PX) return "ignore";
  const dx = sample.x - sample.startX;
  const dy = Math.abs(sample.y - sample.startY);
  if (dx <= 0) return "ignore";
  if (dy > dx) return "ignore";
  if (dx >= SWIPE_COMMIT_PX) return "commit";
  return "track";
}

/** A committed swipe still navigates when motion is reduced. The slide does not play. */
export function swipeShouldAnimate(reducedMotion: boolean): boolean {
  return !reducedMotion;
}

/**
 * Pull down while the page is at the top.
 * Commit after about 70px that stays more vertical than horizontal.
 * Standalone only. Charts, sideways scrollers, and a scrolled page opt out.
 */
export function pullDecision(sample: PullSample): SwipeDecision {
  if (!sample.standalone || sample.horizontalScroller || sample.blockedSurface) return "ignore";
  if (sample.scrollTop > 0) return "ignore";
  const dy = sample.y - sample.startY;
  const dx = Math.abs(sample.x - sample.startX);
  if (dy <= 0) return "ignore";
  if (dx >= dy) return "ignore";
  if (dy >= PULL_COMMIT_PX) return "commit";
  return "track";
}

/** A committed pull still refreshes when motion is reduced. The spinner does not spin. */
export function pullShouldAnimate(reducedMotion: boolean): boolean {
  return !reducedMotion;
}

export function isStandaloneMode(flags: {
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
}): boolean {
  return flags.displayModeStandalone || flags.navigatorStandalone;
}
