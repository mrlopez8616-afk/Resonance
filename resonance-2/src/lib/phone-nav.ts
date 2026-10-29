import { FLOOR_NODES } from "@/data/floor-nodes";
import { filmPhoneTrail } from "@/lib/film-episode";
import { navHrefShelved } from "@/lib/node-visibility";
import { findGear, gearHref, youtubeChildLabel } from "@/lib/youtube-node";
import { NODE_PARENT, PARENTS } from "@/data/node-parents";
import { buildSectionLabel } from "@/lib/build-tracker";
import { cwrGroupLabel, cwrItemLabel, CWR_HREF, groupHref, itemHref } from "@/lib/crawl-walk-run";

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
  { href: "/n/approvals", label: "Approvals" },
  { href: "/settings/security", label: "Settings" },
] as const;

/** Public mode hides the operator log and the whole approval queue. */
/** The wall has no phone chrome. Back and the tab bar stay off /tv. */
export function phoneChromeHidden(pathname: string): boolean {
  const path = (pathname.split("?")[0]?.split("#")[0] ?? "").replace(/\/+$/, "") || "/";
  return path === "/tv";
}

export function phoneTabHidden(
  href: string,
  publicMode: boolean,
  shelved?: readonly string[],
): boolean {
  if (navHrefShelved(href, shelved)) return true;
  if (!publicMode) return false;
  return href === "/log";
}

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
  analytics: "Analytics",
  lifting: "Lifting",
  heart: "Heart",
  manual: "Manual import",
  "cash-flow": "Cash Flow",
  bills: "Bills & Subscriptions",
  debt: "Debt",
  "net-worth": "Net Worth",
  fees: "Fees & Alerts",
  bankroll: "Bankroll",
  "xrp-trigger": "XRP Trigger",
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

function fightBucket(id: string): PhoneTarget {
  const label = id === "upcoming" ? "Upcoming Events" : "Past Events";
  return { href: `/fights/${id}`, label };
}

const TIER_SLICE_LABELS: Record<string, string> = {
  strong: "STRONG",
  lean: "LEAN",
  pass: "PASS",
  "ko-gated": "KO-gated",
};

/** Tier tracker sits under Fights. Back goes up one path segment. */
function tierPhoneTrail(parts: string[]): PhoneTrail {
  const desk: PhoneTarget = { href: "/n/fight-desk", label: "Fight Desk" };
  const fights: PhoneTarget = { href: "/fights", label: "Fights" };
  const tracker: PhoneTarget = { href: "/fights/tiers", label: "Tier tracker" };
  if (parts.length === 2) return { back: fights, crumbs: [HOME, desk, fights, tracker] };
  const third = parts[2] ?? "";
  if (third === "cards") {
    if (parts.length < 4 || parts.length > 5) return homeTrail();
    const eventSlug = parts[3] ?? "";
    const card: PhoneTarget = { href: `/fights/tiers/cards/${eventSlug}`, label: slugLabel(eventSlug) };
    if (parts.length === 4) return { back: tracker, crumbs: [HOME, desk, fights, tracker, card] };
    const slice = TIER_SLICE_LABELS[parts[4] ?? ""];
    if (!slice) return homeTrail();
    return {
      back: card,
      crumbs: [
        HOME,
        desk,
        fights,
        tracker,
        card,
        { href: `/fights/tiers/cards/${eventSlug}/${parts[4]}`, label: slice },
      ],
    };
  }
  const slice = TIER_SLICE_LABELS[third];
  if (!slice) return homeTrail();
  const sliceTarget: PhoneTarget = { href: `/fights/tiers/${third}`, label: slice };
  if (parts.length === 3) return { back: tracker, crumbs: [HOME, desk, fights, tracker, sliceTarget] };
  if (parts.length !== 4) return homeTrail();
  const eventSlug = parts[3] ?? "";
  return {
    back: sliceTarget,
    crumbs: [
      HOME,
      desk,
      fights,
      tracker,
      sliceTarget,
      { href: `/fights/tiers/${third}/${eventSlug}`, label: slugLabel(eventSlug) },
    ],
  };
}

function homeTrail(): PhoneTrail {
  return { back: HOME, crumbs: [HOME] };
}

const CATALYST_BUCKET_LABELS: Record<string, string> = {
  "this-week": "This week",
  "next-week": "Next week",
  later: "Later",
};

/** Catalyst calendar sits under AI Stocks and drills one more level than a ticker. */
function catalystPhoneTrail(parts: string[]): PhoneTrail {
  const parent: PhoneTarget = { href: "/n/ai-stocks", label: "AI Stocks" };
  const catalysts: PhoneTarget = { href: "/n/ai-stocks/catalysts", label: "Catalysts" };
  if (parts.length === 3) return { back: parent, crumbs: [HOME, parent, catalysts] };
  const bucketId = parts[3] ?? "";
  const bucketLabel = CATALYST_BUCKET_LABELS[bucketId];
  if (!bucketLabel || parts.length > 5) return homeTrail();
  const week: PhoneTarget = {
    href: `/n/ai-stocks/catalysts/${bucketId}`,
    label: bucketLabel,
  };
  if (parts.length === 4) return { back: catalysts, crumbs: [HOME, parent, catalysts, week] };
  const eventId = parts[4] ?? "";
  if (!eventId) return homeTrail();
  return {
    back: week,
    crumbs: [
      HOME,
      parent,
      catalysts,
      week,
      {
        href: `/n/ai-stocks/catalysts/${bucketId}/${eventId}`,
        label: slugLabel(eventId),
      },
    ],
  };
}

const BRICK_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** /n/crawl-walk-run → a group → one capability. Back goes up one level, to Build from the parent. */
function crawlWalkRunPhoneTrail(parts: readonly string[]): PhoneTrail {
  const build: PhoneTarget = { href: "/n/build", label: "Build" };
  const root: PhoneTarget = { href: CWR_HREF, label: "Crawl Walk Run" };
  if (parts.length === 2) return { back: build, crumbs: [HOME, build, root] };
  const groupId = parts[2] ?? "";
  const groupLabel = cwrGroupLabel(groupId);
  if (!groupLabel) return homeTrail();
  const group: PhoneTarget = { href: groupHref(groupId), label: groupLabel };
  if (parts.length === 3) return { back: root, crumbs: [HOME, build, root, group] };
  if (parts.length !== 4) return homeTrail();
  const itemId = parts[3] ?? "";
  const itemLabel = cwrItemLabel(groupId, itemId);
  if (!itemLabel) return homeTrail();
  return {
    back: group,
    crumbs: [HOME, build, root, group, { href: itemHref(groupId, itemId), label: itemLabel }],
  };
}

/** /n/youtube → Channel, Gear, or Brick Tracker. Gear and bricks open one page further down. */
function youtubePhoneTrail(parts: readonly string[]): PhoneTrail {
  const youtube: PhoneTarget = { href: "/n/youtube", label: "YouTube" };
  if (parts.length === 2) return { back: FLOOR, crumbs: [HOME, youtube] };
  const view = parts[2] ?? "";
  const viewLabel = youtubeChildLabel(view);
  if (!viewLabel) return homeTrail();
  const child: PhoneTarget = { href: `/n/youtube/${view}`, label: viewLabel };
  if (parts.length === 3) return { back: youtube, crumbs: [HOME, youtube, child] };
  if (parts.length !== 4) return homeTrail();
  if (view === "gear") {
    const item = findGear(parts[3] ?? "");
    if (!item) return homeTrail();
    return {
      back: child,
      crumbs: [HOME, youtube, child, { href: gearHref(item.id), label: item.name }],
    };
  }
  if (view === "bricks") {
    const id = parts[3] ?? "";
    if (!BRICK_ID.test(id)) return homeTrail();
    return {
      back: child,
      crumbs: [HOME, youtube, child, { href: `/n/youtube/bricks/${id}`, label: slugLabel(id) }],
    };
  }
  return homeTrail();
}

/**
 * One-level trail for a pathname.
 * `search` may be `?ticker=NVDA` or `ticker=NVDA`. It only changes `/log`.
 */
export function phoneTrail(pathname: string, search = ""): PhoneTrail {
  const parts = segments(pathname);
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  if (parts.length === 0) return { back: null, crumbs: [HOME] };

  if (parts[0] === "film") {
    return filmPhoneTrail(parts.slice(1)) ?? homeTrail();
  }

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
    if (parts[1] === "ai-stocks" && parts[2] === "catalysts") return catalystPhoneTrail(parts);
    if (parts[1] === "youtube") return youtubePhoneTrail(parts);
    if (parts[1] === "crawl-walk-run") return crawlWalkRunPhoneTrail(parts);
    const parentId = parts[1];
    const runDetail = parentId === "fitness" && parts[2] === "runs" && parts.length === 4;
    if (!parentId || (parts.length > 3 && !runDetail)) return homeTrail();
    if (parentId === "ideas") {
      if (parts.length !== 2) return homeTrail();
      const build: PhoneTarget = { href: "/n/build", label: "Build" };
      const ideas: PhoneTarget = { href: "/n/ideas", label: "Future Ideas" };
      return { back: build, crumbs: [HOME, build, ideas] };
    }
    if (parentId === "backup") {
      if (parts.length !== 2) return homeTrail();
      const build: PhoneTarget = { href: "/n/build", label: "Build" };
      const backup: PhoneTarget = { href: "/n/backup", label: "Backup" };
      return { back: build, crumbs: [HOME, build, backup] };
    }
    if (parentId === "lessons" && parts.length === 2) {
      const lessons: PhoneTarget = { href: "/n/lessons", label: "Lessons" };
      return { back: HOME, crumbs: [HOME, lessons] };
    }
    if (parentId === "roundtable") {
      const roundtable: PhoneTarget = { href: "/n/roundtable", label: "Roundtable" };
      if (parts.length === 2) return { back: FLOOR, crumbs: [HOME, roundtable] };
      const threadId = parts[2] ?? "";
      if (parts.length === 3 && /^[a-z0-9][a-z0-9-]{0,63}$/.test(threadId)) {
        return {
          back: roundtable,
          crumbs: [
            HOME,
            roundtable,
            { href: `/n/roundtable/${threadId}`, label: "Thread" },
          ],
        };
      }
      return homeTrail();
    }
    if (parentId === "chain-security") {
      const chain: PhoneTarget = { href: "/n/chain-security", label: "Chain Security" };
      if (parts.length === 2) return { back: FLOOR, crumbs: [HOME, chain] };
      const incidentId = parts[2] ?? "";
      if (parts.length === 3 && /^[a-z0-9][a-z0-9-]{0,63}$/.test(incidentId)) {
        return {
          back: chain,
          crumbs: [
            HOME,
            chain,
            { href: `/n/chain-security/${incidentId}`, label: slugLabel(incidentId) },
          ],
        };
      }
      return homeTrail();
    }
    if (parentId === "health") {
      if (parts.length !== 2) return homeTrail();
      const health: PhoneTarget = { href: "/n/health", label: "Health" };
      return { back: FLOOR, crumbs: [HOME, health] };
    }
    if (parentId === "approvals") {
      const approvals: PhoneTarget = { href: "/n/approvals", label: "Approvals" };
      if (parts.length === 2) return { back: FLOOR, crumbs: [HOME, approvals] };
      const view = parts[2];
      if (view === "pending" || view === "done") {
        const child: PhoneTarget = {
          href: `/n/approvals/${view}`,
          label: view === "pending" ? "Pending" : "Done",
        };
        return { back: approvals, crumbs: [HOME, approvals, child] };
      }
      return homeTrail();
    }
    if (parentId === "control") {
      const control: PhoneTarget = { href: "/n/control", label: "Control Room" };
      if (parts.length === 2) return { back: FLOOR, crumbs: [HOME, control] };
      const view = parts[2];
      const childLabel =
        view === "approvals" ? "Approvals" : view === "bots" ? "Bots" : view === "feeds" ? "Feeds" : null;
      if (childLabel && view) {
        const child: PhoneTarget = { href: `/n/control/${view}`, label: childLabel };
        return { back: control, crumbs: [HOME, control, child] };
      }
      return homeTrail();
    }
    const parentLabel = PARENT_LABELS[parentId];
    if (!parentLabel) return homeTrail();
    const parent: PhoneTarget = { href: `/n/${parentId}`, label: parentLabel };
    if (parentId === "fitness" && parts[2] === "runs" && parts.length === 4) {
      const runId = parts[3] ?? "";
      return {
        back: parent,
        crumbs: [HOME, parent, { href: `/n/fitness/runs/${runId}`, label: "Run" }],
      };
    }
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
    const second = parts[1] ?? "";
    if (second === "tiers") return tierPhoneTrail(parts);
    if (parts.length > 4) return homeTrail();
    if (second === "upcoming" || second === "past") {
      const bucket = fightBucket(second);
      if (parts.length === 2) return { back: fights, crumbs: [HOME, desk, fights, bucket] };
      const eventSlug = parts[2] ?? "";
      const event: PhoneTarget = {
        href: `/fights/${second}/${eventSlug}`,
        label: slugLabel(eventSlug),
      };
      if (parts.length === 3) return { back: bucket, crumbs: [HOME, desk, fights, bucket, event] };
      const fightId = parts[3] ?? "";
      return {
        back: event,
        crumbs: [
          HOME,
          desk,
          fights,
          bucket,
          event,
          { href: `/fights/${second}/${eventSlug}/${fightId}`, label: slugLabel(fightId) },
        ],
      };
    }
    if (parts.length > 3) return homeTrail();
    if (second === "ufc" || second === "contender-series") {
      if (parts.length !== 2) return homeTrail();
      const promo: PhoneTarget = {
        href: `/fights/${second}`,
        label: second === "ufc" ? "UFC" : "Contender Series",
      };
      return { back: fights, crumbs: [HOME, desk, fights, promo] };
    }
    if (second === "fighters") {
      if (parts.length !== 3) return homeTrail();
      const fighter = parts[2] ?? "";
      return {
        back: fights,
        crumbs: [HOME, desk, fights, { href: `/fights/fighters/${fighter}`, label: slugLabel(fighter) }],
      };
    }
    if (second === "main-card" || second === "prelims") {
      return { back: fights, crumbs: [HOME, desk, fights] };
    }
    const event: PhoneTarget = { href: `/fights/${second}`, label: slugLabel(second) };
    if (parts.length === 2) return { back: fights, crumbs: [HOME, desk, fights, event] };
    const fightId = parts[2] ?? "";
    return {
      back: event,
      crumbs: [HOME, desk, fights, event, { href: `/fights/${second}/${fightId}`, label: slugLabel(fightId) }],
    };
  }

  return homeTrail();
}

export function phoneTabActive(href: string, pathname: string): boolean {
  const path = segments(pathname).join("/");
  const normalized = path ? `/${path}` : "/";
  if (href === "/n/build") {
    return (
      normalized === "/n/build" ||
      normalized.startsWith("/n/build/") ||
      normalized === "/n/ideas" ||
      normalized === "/n/backup" ||
      normalized === CWR_HREF ||
      normalized.startsWith(`${CWR_HREF}/`)
    );
  }
  if (href === "/n/approvals") {
    return normalized === "/n/approvals" || normalized.startsWith("/n/approvals/");
  }
  if (href === "/") {
    if (
      normalized === "/n/build" ||
      normalized.startsWith("/n/build/") ||
      normalized === "/n/ideas" ||
      normalized === "/n/backup" ||
      normalized === CWR_HREF ||
      normalized.startsWith(`${CWR_HREF}/`)
    ) {
      return false;
    }
    if (normalized === "/n/approvals" || normalized.startsWith("/n/approvals/")) return false;
    return (
      normalized === "/" ||
      normalized.startsWith("/n/") ||
      normalized.startsWith("/fights") ||
      normalized === "/film" ||
      normalized.startsWith("/film/")
    );
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
