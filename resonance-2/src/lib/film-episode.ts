import { SYSTEM_AGENTS, SYSTEM_NODES } from "@/data/system-map";
import { textLooksSecret } from "@/lib/approvals";
import {
  bookHomeFace,
  buildHomeFace,
  chainHomeFace,
  controlHomeFace,
  fightHomeFace,
  healthHomeFace,
  lessonsHomeFace,
  tileFace,
  youtubeHomeFace,
  type HomeFace,
} from "@/lib/home-faces";
import { nodeShelved, SHELVED_NODES } from "@/lib/node-visibility";
import {
  hasMoneyText,
  toPublicFloor,
  TREASURY_LINE,
  type PublicGroup,
  type PublicHolding,
} from "@/lib/public-mode";
import { channelStatRows, gearFields, youtubeHomeLines, type YouTubeGear } from "@/lib/youtube-node";

/**
 * Episode 1 filming view. Public mode only.
 * Tiles stay on NodeFace. Paths stay under /film with no query string.
 * Dollar amounts, ticker symbols, and hub chat never become tile text.
 */

export const FILM_HREF = "/film";

export const FILM_TICKERS = [
  "XRP",
  "XRPL",
  "FXRP",
  "SUI",
  "BTC",
  "ETH",
  "SOL",
  "FLR",
  "HBAR",
  "XLM",
  "PWR",
  "VRT",
  "GEV",
  "CEG",
  "NVDA",
  "TSM",
  "TSLA",
  "SPCX",
  "ETN",
  "HUBB",
] as const;

const TICKER = new RegExp(`\\b(?:${FILM_TICKERS.join("|")})\\b`, "i");
const SEGMENT = /^[a-z0-9][a-z0-9-]{0,79}$/;

const HOLDINGS = [
  { id: "sui", parent: "crypto", slug: "network", name: "Network" },
  { id: "pwr", parent: "ai-stocks", slug: "grid", name: "Grid" },
  { id: "vrt", parent: "ai-stocks", slug: "cooling", name: "Cooling" },
  { id: "gev", parent: "ai-stocks", slug: "turbines", name: "Turbines" },
  { id: "ceg", parent: "ai-stocks", slug: "nuclear", name: "Nuclear" },
  { id: "nvda", parent: "ai-stocks", slug: "compute", name: "Compute" },
  { id: "tsm", parent: "ai-stocks", slug: "foundry", name: "Foundry" },
  { id: "tsla", parent: "ai-stocks", slug: "vehicles", name: "Vehicles" },
  { id: "spcx", parent: "ai-stocks", slug: "launch", name: "Launch" },
] as const;

const PART_LABELS: Record<string, string> = {
  crypto: "Crypto",
  "ai-stocks": "AI Stocks",
  fitness: "Fitness",
  "fight-desk": "Fight Desk",
  build: "Build",
  control: "Control Room",
  health: "Health",
  youtube: "YouTube",
  system: "System",
  lessons: "Lessons",
  "chain-security": "Chain Security",
  network: "Network",
  grid: "Grid",
  cooling: "Cooling",
  turbines: "Turbines",
  nuclear: "Nuclear",
  compute: "Compute",
  foundry: "Foundry",
  vehicles: "Vehicles",
  launch: "Launch",
  treasury: "Treasury",
  ideas: "Future Ideas",
  bots: "Bots",
  feeds: "Feeds",
  channel: "Channel",
  gear: "Gear",
  bricks: "Brick Tracker",
  nodes: "Nodes",
  agents: "Agents",
  closes: "Daily closes",
  platform: "Platform",
  queue: "Queue",
  finance: "Finance",
};

const NODE_HREF: Record<string, string> = {
  crypto: "/film/crypto",
  "ai-stocks": "/film/ai-stocks",
  fitness: "/film/fitness",
  "fight-desk": "/film/fight-desk",
  build: "/film/build",
  youtube: "/film/youtube",
  lessons: "/film/lessons",
  health: "/film/health",
};

export type FilmLink = { href: string; label: string };

export type FilmLevel = {
  label: string;
  back: FilmLink | null;
  faces: HomeFace[];
};

export type FilmLesson = {
  id: string;
  title: string;
  lesson: string;
  whatChanged: string;
  why: string;
};

export type FilmIncident = {
  id: string;
  subject: string;
  category: string;
  status: string;
  cause: string;
  date: string;
};

export type FilmBuildItem = {
  id: string;
  title: string;
  status: string;
  nextStep: string | null;
  percent: number | null;
};

export type FilmBuildSection = {
  id: string;
  label: string;
  percent: number | null;
  live: number;
  inProgress: number;
  queued: number;
  items: readonly FilmBuildItem[];
};

export type FilmIdea = {
  id: string;
  title: string;
  note: string;
  status: string;
};

export type FilmGear = {
  id: string;
  name: string;
  role: string;
  fields: readonly { label: string; value: string }[];
};

export type FilmBrick = {
  id: string;
  title: string;
  status: string;
  summary: string;
  note: string;
};

export type FilmBot = { slug: string; name: string; line: string };
export type FilmFeed = { slug: string; name: string; line: string };

export type FilmScore = {
  id: string;
  label: string;
  detail: string;
  percent: number | null;
};

export type FilmSnapshot = {
  shelved: readonly string[];
  crypto: PublicGroup;
  aiStocks: PublicGroup;
  fightRecord: string | null;
  buildUnavailable: boolean;
  buildPercent: string | null;
  buildLines: readonly string[];
  sections: readonly FilmBuildSection[];
  ideas: readonly FilmIdea[];
  controlLines: readonly string[];
  controlLive: boolean;
  bots: readonly FilmBot[];
  feeds: readonly FilmFeed[];
  health: { percent: number | null; ready: number; scores: readonly FilmScore[] } | null;
  lessonsUnavailable: boolean;
  lessons: readonly FilmLesson[];
  chainUnavailable: boolean;
  incidents: readonly FilmIncident[];
  gear: readonly FilmGear[];
  bricks: readonly FilmBrick[];
};

export function filmTextLeaks(value: string): string[] {
  const leaks: string[] = [];
  if (value.includes("$") || hasMoneyText(value)) leaks.push("dollar");
  if (TICKER.test(value)) leaks.push("ticker");
  if (/hub\s+chat/i.test(value)) leaks.push("hub-chat");
  if (/\bshares?\b/i.test(value)) leaks.push("shares");
  if (/\bquantit(?:y|ies)\b/i.test(value)) leaks.push("quantity");
  if (/\btokens?\b/i.test(value)) leaks.push("token");
  if (textLooksSecret(value)) leaks.push("secret");
  return leaks;
}

export function filmLine(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text || filmTextLeaks(text).length > 0) return null;
  return text;
}

export function filmSegment(value: string): boolean {
  return SEGMENT.test(value) && filmTextLeaks(value).length === 0;
}

function slugId(value: string): string | null {
  const slug = value.trim().toLowerCase();
  return filmSegment(slug) ? slug : null;
}

function itemStatus(status: string): string {
  return status === "in_progress" ? "in progress" : status;
}

export function filmHref(href: string): boolean {
  if (!href.startsWith("/film")) return false;
  if (href.includes("?") || href.includes("#")) return false;
  const parts = href.split("/").filter(Boolean);
  if (parts[0] !== "film" || parts.length > 4) return false;
  return parts.every((part) => filmSegment(part));
}

export function toFilmGear(item: YouTubeGear): FilmGear {
  const fields = gearFields(item, true).flatMap((field) => {
    const label = filmLine(field.label);
    const value = filmLine(field.value);
    if (!label || !value) return [];
    return [{ label, value }];
  });
  return {
    id: item.id,
    name: item.name,
    role: item.role,
    fields,
  };
}

export function filmFeedIdentity(id: string, label: string): { slug: string; name: string } | null {
  if (id === "finance") return null;
  if (id === "xrp-closes") return { slug: "closes", name: "Daily closes" };
  const slug = id.toLowerCase();
  const name = filmLine(label);
  if (!name || !filmSegment(slug)) return null;
  return { slug, name };
}

export function blankFilmSnapshot(shelved: readonly string[] = SHELVED_NODES): FilmSnapshot {
  const empty = toPublicFloor([]);
  return {
    shelved,
    crypto: empty.crypto,
    aiStocks: empty.aiStocks,
    fightRecord: null,
    buildUnavailable: true,
    buildPercent: null,
    buildLines: [],
    sections: [],
    ideas: [],
    controlLines: [],
    controlLive: false,
    bots: [],
    feeds: [],
    health: null,
    lessonsUnavailable: true,
    lessons: [],
    chainUnavailable: true,
    incidents: [],
    gear: [],
    bricks: [],
  };
}

function cleanFace(face: HomeFace): HomeFace {
  return {
    ...face,
    name: filmLine(face.name) ?? "Node",
    headline: filmLine(face.headline) ?? "not recorded",
    status: filmLine(face.status) ?? "not recorded",
    href: face.href && filmHref(face.href) ? face.href : "",
  };
}

function face(input: {
  id: string;
  glyph?: string;
  href?: string;
  name: string;
  headline?: string | null;
  status?: string | null;
  live?: boolean;
}): HomeFace | null {
  if (!filmLine(input.name) || !filmSegment(input.id)) return null;
  const href = input.href ?? "";
  if (href && !filmHref(href)) return null;
  return cleanFace(
    tileFace({
      id: input.id,
      glyph: input.glyph,
      href,
      name: input.name,
      headline: input.headline,
      status: input.status,
      live: input.live,
      publicMode: true,
    }),
  );
}

function board(label: string, back: FilmLink | null, faces: Array<HomeFace | null>): FilmLevel {
  const clean = faces.filter((row): row is HomeFace => row !== null);
  return {
    label,
    back,
    faces:
      clean.length > 0
        ? clean
        : [
            cleanFace(
              tileFace({
                id: "empty",
                href: "",
                name: filmLine(label) ?? "Film",
                headline: "not recorded",
                status: null,
                live: false,
                publicMode: true,
              }),
            ),
          ],
  };
}

const ROOT: FilmLink = { href: FILM_HREF, label: "Film" };

function up(href: string, label: string): FilmLink {
  return { href, label };
}

function holdingNamed(parent: "crypto" | "ai-stocks", holding: PublicHolding) {
  return HOLDINGS.find((row) => row.parent === parent && row.id === holding.id) ?? null;
}

function holdingTile(parent: "crypto" | "ai-stocks", holding: PublicHolding, href: string): HomeFace | null {
  const named = holdingNamed(parent, holding);
  if (!named) return null;
  const gain = filmLine(holding.gainLabel);
  return face({
    id: named.slug,
    glyph: parent,
    href,
    name: named.name,
    headline: holding.weightLabel,
    status: gain ? `${gain} since first buy` : null,
    live: true,
  });
}

function fitnessTile(): HomeFace | null {
  return face({
    id: "fitness",
    href: "/film/fitness",
    name: "Fitness",
    headline: "coming soon",
    status: "not recorded",
    live: false,
  });
}

function safeLessons(snap: FilmSnapshot): FilmLesson[] {
  return snap.lessons.filter((row) => slugId(row.id) && filmLine(row.title));
}

function safeIncidents(snap: FilmSnapshot): FilmIncident[] {
  return snap.incidents.filter((row) => filmSegment(row.id) && filmLine(row.subject));
}

function systemNodes(shelved: readonly string[]): { id: string; label: string; href: string }[] {
  return SYSTEM_NODES.flatMap((node) => {
    const href = NODE_HREF[node.id];
    if (!href) return [];
    if (node.id === "fitness" && nodeShelved("fitness", shelved)) return [];
    if (!filmLine(node.label)) return [];
    return [{ id: node.id, label: node.label, href }];
  });
}

function systemAgents(): { id: string; name: string; role: string }[] {
  return SYSTEM_AGENTS.flatMap((agent) => {
    if (!filmSegment(agent.id) || !filmLine(agent.name)) return [];
    return [{ id: agent.id, name: agent.name, role: agent.role }];
  });
}

function home(snap: FilmSnapshot): FilmLevel {
  const lessons = safeLessons(snap);
  const incidents = safeIncidents(snap);
  const fight = fightHomeFace({
    publicMode: true,
    headline: null,
    priceLine: null,
    record: filmLine(snap.fightRecord),
  });
  const nodes = systemNodes(snap.shelved);
  const agents = systemAgents();
  const faces: Array<HomeFace | null> = [
    cleanFace(
      bookHomeFace({
        id: "crypto",
        name: "Crypto",
        href: "/film/crypto",
        publicMode: true,
        summary: null,
        connected: Boolean(filmLine(snap.crypto.weightLabel)),
        mover: null,
        weightLabel: filmLine(snap.crypto.weightLabel),
        growthLabel: filmLine(snap.crypto.growthLabel),
      }),
    ),
    cleanFace(
      bookHomeFace({
        id: "ai-stocks",
        name: "AI Stocks",
        href: "/film/ai-stocks",
        publicMode: true,
        summary: null,
        connected: Boolean(filmLine(snap.aiStocks.weightLabel)),
        mover: null,
        weightLabel: filmLine(snap.aiStocks.weightLabel),
        growthLabel: filmLine(snap.aiStocks.growthLabel),
      }),
    ),
    nodeShelved("fitness", snap.shelved) ? null : fitnessTile(),
    fight ? cleanFace({ ...fight, href: "/film/fight-desk" }) : null,
    cleanFace(
      buildHomeFace({
        unavailable: snap.buildUnavailable,
        percentLabel: filmLine(snap.buildPercent),
        lines: snap.buildLines.flatMap((line) => {
          const next = filmLine(line);
          return next ? [next] : [];
        }),
        publicMode: true,
      }),
    ),
    cleanFace(
      controlHomeFace(
        snap.controlLines.flatMap((line) => {
          const next = filmLine(line);
          return next ? [next] : [];
        }),
        snap.controlLive,
        true,
      ),
    ),
    snap.health
      ? cleanFace(
          healthHomeFace({
            percent: snap.health.percent,
            ready: snap.health.ready,
            scores: snap.health.scores,
          }),
        )
      : null,
    cleanFace(youtubeHomeFace(youtubeHomeLines())),
    face({
      id: "system",
      href: "/film/system",
      name: "System",
      headline: `${nodes.length} nodes`,
      status: `${agents.length} agents`,
      live: true,
    }),
    cleanFace(
      lessonsHomeFace(
        {
          unavailable: snap.lessonsUnavailable,
          count: lessons.length,
          latestTitle: filmLine(lessons[0]?.title),
        },
        true,
      ),
    ),
    cleanFace(
      chainHomeFace(
        {
          unavailable: snap.chainUnavailable,
          count: incidents.length,
          lines: incidents.flatMap((row) => {
            const line = filmLine(`${row.category} · ${row.status}`);
            return line ? [line] : [];
          }),
        },
        true,
      ),
    ),
  ];
  const retargeted = faces.map((row) => {
    if (!row) return null;
    if (row.id === "build") return { ...row, href: "/film/build" };
    if (row.id === "control") return { ...row, href: "/film/control" };
    if (row.id === "health") return { ...row, href: "/film/health" };
    if (row.id === "youtube") return { ...row, href: "/film/youtube" };
    if (row.id === "lessons") return { ...row, href: "/film/lessons" };
    if (row.id === "chain-security") return { ...row, href: "/film/chain-security" };
    return row.href && !filmHref(row.href) ? { ...row, href: "" } : row;
  });
  return board("Episode 1", null, retargeted);
}

function groupLevel(parent: "crypto" | "ai-stocks", group: PublicGroup, child?: string): FilmLevel | null {
  const label = parent === "crypto" ? "Crypto" : "AI Stocks";
  const parentBack = up(`/film/${parent}`, label);
  if (!child) {
    const tiles = group.holdings.map((holding) => holdingTile(parent, holding, `/film/${parent}/${holdingNamed(parent, holding)?.slug ?? ""}`));
    if (parent === "crypto") {
      tiles.push(
        face({
          id: "treasury",
          glyph: "crypto",
          href: "/film/crypto/treasury",
          name: "Treasury",
          headline: TREASURY_LINE,
          status: "manual",
          live: true,
        }),
      );
    }
    return board(label, ROOT, tiles);
  }
  if (child === "treasury" && parent === "crypto") {
    return board(
      "Treasury",
      up("/film/crypto", "Crypto"),
      [
        face({
          id: "treasury",
          glyph: "crypto",
          name: "Treasury",
          headline: TREASURY_LINE,
          status: "manual",
          live: true,
        }),
      ],
    );
  }
  const named = HOLDINGS.find((row) => row.parent === parent && row.slug === child);
  if (!named) return null;
  const holding = group.holdings.find((row) => row.id === named.id) ?? null;
  if (!holding) {
    return board(named.name, parentBack, [
      face({
        id: named.slug,
        glyph: parent,
        name: named.name,
        headline: null,
        status: null,
        live: false,
      }),
    ]);
  }
  return board(named.name, parentBack, [holdingTile(parent, holding, "")]);
}

function buildItemFace(sectionId: string, item: FilmBuildItem): HomeFace | null {
  const title = filmLine(item.title);
  if (!title || !filmSegment(item.id) || !filmSegment(sectionId)) return null;
  const percent = item.percent === null ? null : `${item.percent}%`;
  return face({
    id: item.id,
    glyph: "build",
    href: `/film/build/${sectionId}/${item.id}`,
    name: title,
    headline: itemStatus(item.status),
    status: percent,
    live: item.percent !== null,
  });
}

function buildLevel(snap: FilmSnapshot, child?: string, leaf?: string): FilmLevel | null {
  if (!child) {
    const sections = snap.sections.flatMap((section) => {
      if (!filmSegment(section.id) || !filmLine(section.label)) return [];
      const row = face({
        id: section.id,
        glyph: "build",
        href: `/film/build/${section.id}`,
        name: section.label,
        headline: section.percent === null ? "no steps" : `${section.percent}%`,
        status: `${section.live} live · ${section.inProgress} in progress`,
        live: section.percent !== null,
      });
      return row ? [row] : [];
    });
    const ideas = face({
      id: "ideas",
      glyph: "build",
      href: "/film/build/ideas",
      name: "Future Ideas",
      headline: "Board",
      status: "What comes next",
      live: true,
    });
    return board("Build", ROOT, ideas ? [...sections, ideas] : sections);
  }
  if (child === "ideas") {
    if (!leaf) {
      return board(
        "Future Ideas",
        up("/film/build", "Build"),
        snap.ideas.map((idea) => {
          const title = filmLine(idea.title);
          if (!title || !filmSegment(idea.id)) return null;
          return face({
            id: idea.id,
            glyph: "build",
            href: `/film/build/ideas/${idea.id}`,
            name: title,
            headline: filmLine(idea.status) ?? "idea",
            status: null,
            live: true,
          });
        }),
      );
    }
    const idea = snap.ideas.find((row) => row.id === leaf) ?? null;
    if (!idea || !filmSegment(idea.id) || !filmLine(idea.title)) return null;
    return board("Idea", up("/film/build/ideas", "Future Ideas"), [
      face({
        id: idea.id,
        glyph: "build",
        name: filmLine(idea.title) ?? "Idea",
        headline: filmLine(idea.status) ?? "idea",
        status: filmLine(idea.note),
        live: true,
      }),
    ]);
  }
  const section = snap.sections.find((row) => row.id === child) ?? null;
  const sectionLabel = section ? filmLine(section.label) : null;
  if (!section || !sectionLabel || !filmSegment(section.id)) return null;
  if (!leaf) {
    return board(
      sectionLabel,
      up("/film/build", "Build"),
      section.items.map((item) => buildItemFace(section.id, item)),
    );
  }
  const item = section.items.find((row) => row.id === leaf) ?? null;
  if (!item) return null;
  const title = filmLine(item.title);
  if (!title) return null;
  const percent = item.percent === null ? null : `${item.percent}%`;
  return board(title, up(`/film/build/${section.id}`, sectionLabel), [
    face({
      id: item.id,
      glyph: "build",
      name: title,
      headline: itemStatus(item.status),
      status: filmLine(item.nextStep) ?? percent,
      live: item.percent !== null,
    }),
  ]);
}

function controlLevel(snap: FilmSnapshot, child?: string, leaf?: string): FilmLevel | null {
  if (!child) {
    return board("Control Room", ROOT, [
      face({
        id: "bots",
        glyph: "control",
        href: "/film/control/bots",
        name: "Bots",
        headline: String(snap.bots.length),
        status: snap.controlLive ? "heard" : "no signal",
        live: snap.controlLive,
      }),
      face({
        id: "feeds",
        glyph: "control",
        href: "/film/control/feeds",
        name: "Feeds",
        headline: String(snap.feeds.length),
        status: "freshness",
        live: snap.feeds.length > 0,
      }),
    ]);
  }
  if (child === "bots") {
    if (!leaf) {
      return board(
        "Bots",
        up("/film/control", "Control Room"),
        snap.bots.map((bot) =>
          face({
            id: bot.slug,
            glyph: "control",
            href: `/film/control/bots/${bot.slug}`,
            name: bot.name,
            headline: "Bot",
            status: bot.line,
            live: true,
          }),
        ),
      );
    }
    const bot = snap.bots.find((row) => row.slug === leaf) ?? null;
    const botName = bot ? filmLine(bot.name) : null;
    if (!bot || !botName) return null;
    return board(botName, up("/film/control/bots", "Bots"), [
      face({
        id: bot.slug,
        glyph: "control",
        name: botName,
        headline: "Bot",
        status: bot.line,
        live: true,
      }),
    ]);
  }
  if (child === "feeds") {
    if (!leaf) {
      return board(
        "Feeds",
        up("/film/control", "Control Room"),
        snap.feeds.map((feed) =>
          face({
            id: feed.slug,
            glyph: "control",
            href: `/film/control/feeds/${feed.slug}`,
            name: feed.name,
            headline: "Feed",
            status: feed.line,
            live: true,
          }),
        ),
      );
    }
    const feed = snap.feeds.find((row) => row.slug === leaf) ?? null;
    const feedName = feed ? filmLine(feed.name) : null;
    if (!feed || !feedName) return null;
    return board(feedName, up("/film/control/feeds", "Feeds"), [
      face({
        id: feed.slug,
        glyph: "control",
        name: feedName,
        headline: "Feed",
        status: feed.line,
        live: true,
      }),
    ]);
  }
  return null;
}

function youtubeLevel(snap: FilmSnapshot, child?: string, leaf?: string): FilmLevel | null {
  if (!child) {
    return board("YouTube", ROOT, [
      face({
        id: "channel",
        glyph: "youtube",
        href: "/film/youtube/channel",
        name: "Channel",
        headline: "not connected",
        status: "no source",
        live: false,
      }),
      face({
        id: "gear",
        glyph: "youtube",
        href: "/film/youtube/gear",
        name: "Gear",
        headline: snap.gear.length === 1 ? "1 device" : `${snap.gear.length} devices`,
        status: "on set",
        live: snap.gear.length > 0,
      }),
      face({
        id: "bricks",
        glyph: "youtube",
        href: "/film/youtube/bricks",
        name: "Brick Tracker",
        headline: String(snap.bricks.length),
        status: "episodes",
        live: snap.bricks.length > 0,
      }),
    ]);
  }
  if (child === "channel" && !leaf) {
    return board(
      "Channel",
      up("/film/youtube", "YouTube"),
      channelStatRows().map((row) =>
        face({
          id: row.id,
          glyph: "youtube",
          name: row.label,
          headline: row.value,
          status: null,
          live: false,
        }),
      ),
    );
  }
  if (child === "gear") {
    if (!leaf) {
      return board(
        "Gear",
        up("/film/youtube", "YouTube"),
        snap.gear.map((item) =>
          face({
            id: item.id,
            glyph: "youtube",
            href: `/film/youtube/gear/${item.id}`,
            name: item.name,
            headline: "Device",
            status: item.role,
            live: true,
          }),
        ),
      );
    }
    const item = snap.gear.find((row) => row.id === leaf) ?? null;
    const gearName = item ? filmLine(item.name) : null;
    if (!item || !gearName || !filmSegment(item.id)) return null;
    return board(
      gearName,
      up("/film/youtube/gear", "Gear"),
      item.fields.map((field) =>
        face({
          id: field.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field",
          glyph: "youtube",
          name: field.label,
          headline: field.value,
          status: null,
          live: true,
        }),
      ),
    );
  }
  if (child === "bricks") {
    if (!leaf) {
      return board(
        "Brick Tracker",
        up("/film/youtube", "YouTube"),
        snap.bricks.map((brick) => {
          const title = filmLine(brick.title);
          if (!title || !filmSegment(brick.id)) return null;
          return face({
            id: brick.id,
            glyph: "youtube",
            href: `/film/youtube/bricks/${brick.id}`,
            name: title,
            headline: filmLine(brick.status) ?? "idea",
            status: null,
            live: true,
          });
        }),
      );
    }
    const brick = snap.bricks.find((row) => row.id === leaf) ?? null;
    if (!brick || !filmSegment(brick.id) || !filmLine(brick.title)) return null;
    return board(filmLine(brick.title) ?? "Episode", up("/film/youtube/bricks", "Brick Tracker"), [
      face({
        id: brick.id,
        glyph: "youtube",
        name: filmLine(brick.title) ?? "Episode",
        headline: filmLine(brick.status) ?? "idea",
        status: filmLine(brick.summary) ?? filmLine(brick.note),
        live: true,
      }),
    ]);
  }
  return null;
}

function systemLevel(snap: FilmSnapshot, child?: string, leaf?: string): FilmLevel | null {
  if (!child) {
    return board("System", ROOT, [
      face({
        id: "nodes",
        glyph: "system",
        href: "/film/system/nodes",
        name: "Nodes",
        headline: String(systemNodes(snap.shelved).length),
        status: "map",
        live: true,
      }),
      face({
        id: "agents",
        glyph: "system",
        href: "/film/system/agents",
        name: "Agents",
        headline: String(systemAgents().length),
        status: "roster",
        live: true,
      }),
    ]);
  }
  if (child === "nodes" && !leaf) {
    return board(
      "Nodes",
      up("/film/system", "System"),
      systemNodes(snap.shelved).map((node) =>
        face({
          id: node.id,
          glyph: node.id === "fitness" ? "fitness" : node.id,
          href: node.href,
          name: node.label,
          headline: node.id === "fitness" ? "coming soon" : "Open",
          status: null,
          live: node.id !== "fitness",
        }),
      ),
    );
  }
  if (child === "agents") {
    const agents = systemAgents();
    if (!leaf) {
      return board(
        "Agents",
        up("/film/system", "System"),
        agents.map((agent) =>
          face({
            id: agent.id,
            glyph: "system",
            href: `/film/system/agents/${agent.id}`,
            name: agent.name,
            headline: "Agent",
            status: agent.role,
            live: true,
          }),
        ),
      );
    }
    const agent = agents.find((row) => row.id === leaf) ?? null;
    const agentName = agent ? filmLine(agent.name) : null;
    if (!agent || !agentName) return null;
    return board(agentName, up("/film/system/agents", "Agents"), [
      face({
        id: agent.id,
        glyph: "system",
        name: agentName,
        headline: "Agent",
        status: agent.role,
        live: true,
      }),
    ]);
  }
  return null;
}

function lessonsLevel(snap: FilmSnapshot, child?: string): FilmLevel | null {
  const lessons = safeLessons(snap);
  if (!child) {
    return board(
      "Lessons",
      ROOT,
      lessons.map((row) => {
        const slug = slugId(row.id);
        if (!slug) return null;
        return face({
          id: slug,
          glyph: "lessons",
          href: `/film/lessons/${slug}`,
          name: filmLine(row.title) ?? "Lesson",
          headline: "Lesson",
          status: null,
          live: true,
        });
      }),
    );
  }
  const row = lessons.find((lesson) => slugId(lesson.id) === child) ?? null;
  if (!row) return null;
  const title = filmLine(row.title) ?? "Lesson";
  return board(title, up("/film/lessons", "Lessons"), [
    face({
      id: "changed",
      glyph: "lessons",
      name: "What changed",
      headline: "Lesson",
      status: row.whatChanged,
      live: true,
    }),
    face({
      id: "why",
      glyph: "lessons",
      name: "Why",
      headline: "Lesson",
      status: row.why,
      live: true,
    }),
    face({
      id: "lesson",
      glyph: "lessons",
      name: "Lesson",
      headline: title,
      status: row.lesson,
      live: true,
    }),
  ]);
}

function chainLevel(snap: FilmSnapshot, child?: string): FilmLevel | null {
  const incidents = safeIncidents(snap);
  if (!child) {
    return board(
      "Chain Security",
      ROOT,
      incidents.map((row) =>
        face({
          id: row.id,
          glyph: "chain-security",
          href: `/film/chain-security/${row.id}`,
          name: filmLine(row.subject) ?? "Incident",
          headline: filmLine(row.category) ?? "Incident",
          status: filmLine(`${row.date} · ${row.status}`),
          live: true,
        }),
      ),
    );
  }
  const row = incidents.find((incident) => incident.id === child) ?? null;
  if (!row) return null;
  return board(filmLine(row.subject) ?? "Incident", up("/film/chain-security", "Chain Security"), [
    face({
      id: row.id,
      glyph: "chain-security",
      name: filmLine(row.subject) ?? "Incident",
      headline: filmLine(row.category) ?? "Incident",
      status: filmLine(row.cause) ?? filmLine(row.status),
      live: true,
    }),
  ]);
}

function healthLevel(snap: FilmSnapshot): FilmLevel {
  const scores = snap.health?.scores ?? [];
  return board(
    "Health",
    ROOT,
    scores.map((score) =>
      face({
        id: score.id,
        glyph: "health",
        name: score.label,
        headline: score.percent === null ? "not connected" : `${score.percent}%`,
        status: score.detail,
        live: score.percent !== null,
      }),
    ),
  );
}

function fitnessLevel(): FilmLevel {
  return board("Fitness", ROOT, [fitnessTile()]);
}

function fightLevel(snap: FilmSnapshot): FilmLevel {
  const record = filmLine(snap.fightRecord);
  return board("Fight Desk", ROOT, [
    face({
      id: "fight-desk",
      href: "",
      name: "Fight Desk",
      headline: record ?? "not recorded",
      status: record ? "record" : null,
      live: record !== null,
    }),
  ]);
}

/** One filming level. Null is not a page. Home is the empty slug. */
export function filmLevel(parts: readonly string[], snap: FilmSnapshot): FilmLevel | null {
  const [a, b, c, extra] = parts;
  if (extra) return null;
  if (!a) return home(snap);
  if (parts.some((part) => !filmSegment(part))) return null;
  if (a === "crypto") return c ? null : groupLevel("crypto", snap.crypto, b);
  if (a === "ai-stocks") return c ? null : groupLevel("ai-stocks", snap.aiStocks, b);
  if (a === "fitness") return b ? null : fitnessLevel();
  if (a === "fight-desk") return b ? null : fightLevel(snap);
  if (a === "build") return buildLevel(snap, b, c);
  if (a === "control") return controlLevel(snap, b, c);
  if (a === "health") return b ? null : healthLevel(snap);
  if (a === "youtube") return youtubeLevel(snap, b, c);
  if (a === "system") return systemLevel(snap, b, c);
  if (a === "lessons") return b && c ? null : lessonsLevel(snap, b);
  if (a === "chain-security") return b && c ? null : chainLevel(snap, b);
  return null;
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function filmPartLabel(parents: readonly string[], part: string): string | null {
  if (!filmSegment(part)) return null;
  const known = PART_LABELS[part];
  if (known && filmLine(known)) return known;
  const parent = parents[0];
  const child = parents[1];
  if (parent === "lessons") return "Lesson";
  if (parent === "chain-security") return "Incident";
  if (parent === "youtube" && child === "bricks") return "Episode";
  if (parent === "youtube" && child === "gear") return titleCase(part);
  if (parent === "build" && child === "ideas") return "Idea";
  if (parent === "build" && child) return "Item";
  if (parent === "system" && child === "agents") return "Agent";
  const titled = titleCase(part);
  return filmLine(titled);
}

/** Phone trail for /film. Back goes up one level. Labels stay off the ticker list. */
export function filmPhoneTrail(rest: readonly string[]): { back: FilmLink | null; crumbs: FilmLink[] } | null {
  if (rest.length > 3) return null;
  const crumbs: FilmLink[] = [{ href: FILM_HREF, label: "Film" }];
  for (let index = 0; index < rest.length; index += 1) {
    const part = rest[index] ?? "";
    const label = filmPartLabel(rest.slice(0, index), part);
    const href = `/film/${rest.slice(0, index + 1).join("/")}`;
    if (!label || !filmHref(href)) return null;
    crumbs.push({ href, label });
  }
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2] ?? null : null;
  return { back, crumbs };
}
