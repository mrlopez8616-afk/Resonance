import { YOUTUBE_GEAR, YOUTUBE_GEAR_SOURCE, type YouTubeGear } from "@/data/youtube-gear";

/**
 * YouTube node. Parent /n/youtube → Channel, Gear, and Brick Tracker.
 * Gear opens one device per page. Brick Tracker opens one build per page.
 * No channel source is connected yet, so every channel stat reads NOT_CONNECTED.
 * Nothing here invents a number.
 */

export const NOT_CONNECTED = "not connected";
export const NOT_RECORDED = "not recorded";

export const YOUTUBE_HREF = "/n/youtube";

export const YOUTUBE_CHILDREN = [
  { id: "channel", label: "Channel", href: "/n/youtube/channel" },
  { id: "gear", label: "Gear", href: "/n/youtube/gear" },
  { id: "bricks", label: "Brick Tracker", href: "/n/youtube/bricks" },
] as const;

export type YouTubeChildId = (typeof YOUTUBE_CHILDREN)[number]["id"];

export function isYouTubeChild(value: string): value is YouTubeChildId {
  return YOUTUBE_CHILDREN.some((child) => child.id === value);
}

export function youtubeChildLabel(id: string): string | null {
  return YOUTUBE_CHILDREN.find((child) => child.id === id)?.label ?? null;
}

/** The channel stats the node will show once a source is connected. */
export const CHANNEL_STATS = [
  { id: "subscribers", label: "Subscribers" },
  { id: "views-28d", label: "Views, last 28 days" },
  { id: "videos", label: "Videos posted" },
] as const;

export type ChannelStatRow = { id: string; label: string; value: string };

/** No source yet: every value is NOT_CONNECTED. A connected screen passes the three strings. */
export function channelStatRows(values?: {
  subscribers: string;
  views: string;
  videos: string;
} | null): ChannelStatRow[] {
  const stored = values
    ? {
        subscribers: values.subscribers,
        "views-28d": values.views,
        videos: values.videos,
      }
    : null;
  return CHANNEL_STATS.map((stat) => ({
    id: stat.id,
    label: stat.label,
    value: stored?.[stat.id as keyof typeof stored] || NOT_CONNECTED,
  }));
}

export type YouTubeBrickCard = {
  figure: string;
  lines: string[];
  live: boolean;
};

const BRICK_UNCONNECTED: YouTubeBrickCard = { figure: NOT_CONNECTED, lines: [], live: false };

export type YouTubeCard = {
  id: YouTubeChildId;
  label: string;
  href: string;
  figure: string;
  lines: string[];
  live: boolean;
};

function gearCountLabel(count: number): string {
  if (count === 0) return "No gear listed";
  return count === 1 ? "1 device" : `${count} devices`;
}

export type YouTubeChannelFace = {
  figure: string;
  status: string | null;
  live: boolean;
};

export function youtubeParentCards(
  gear: readonly YouTubeGear[] = YOUTUBE_GEAR,
  brick: YouTubeBrickCard = BRICK_UNCONNECTED,
  channel?: YouTubeChannelFace,
): YouTubeCard[] {
  const fresh = gear.filter((item) => item.isNew).length;
  return [
    {
      id: "channel",
      label: "Channel",
      href: "/n/youtube/channel",
      figure: channel?.figure ?? `Stats ${NOT_CONNECTED}`,
      lines: channel?.status ? [channel.status] : [],
      live: channel?.live ?? false,
    },
    {
      id: "gear",
      label: "Gear",
      href: "/n/youtube/gear",
      figure: gearCountLabel(gear.length),
      lines: fresh > 0 ? [`${fresh} new`] : [],
      live: gear.length > 0,
    },
    {
      id: "bricks",
      label: "Brick Tracker",
      href: "/n/youtube/bricks",
      figure: brick.figure,
      lines: brick.lines.slice(0, 3),
      live: brick.live,
    },
  ];
}

export function youtubeHomeLines(gear: readonly YouTubeGear[] = YOUTUBE_GEAR, channelLine?: string): string[] {
  return [channelLine?.trim() || `Channel ${NOT_CONNECTED}`, `Gear: ${gearCountLabel(gear.length).toLowerCase()}`, "Brick Tracker"];
}

export function gearHref(id: string): string {
  return `/n/youtube/gear/${id}`;
}

export function findGear(id: string, gear: readonly YouTubeGear[] = YOUTUBE_GEAR): YouTubeGear | null {
  const slug = id.trim().toLowerCase();
  return gear.find((item) => item.id === slug) ?? null;
}

export type GearField = { label: string; value: string };

function formatAcquired(value: string | null): string {
  if (!value) return NOT_RECORDED;
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return NOT_RECORDED;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Detail rows for one device. Cost is owner-only: Public mode drops the row entirely,
 * so a shared screen never shows a dollar sign.
 */
export function gearFields(item: YouTubeGear, publicMode: boolean): GearField[] {
  const rows: GearField[] = [
    { label: "Role", value: item.role },
    { label: "Acquired", value: formatAcquired(item.acquired) },
  ];
  if (!publicMode) {
    rows.push({
      label: "Cost",
      value: item.costUsd == null ? NOT_RECORDED : `$${Math.round(item.costUsd).toLocaleString("en-US")}`,
    });
  }
  rows.push({ label: "Usage", value: item.usage?.trim() || NOT_RECORDED });
  return rows;
}

export { YOUTUBE_GEAR, YOUTUBE_GEAR_SOURCE };
export type { YouTubeGear };
