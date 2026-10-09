import {
  DATA_SOURCES,
  SOURCE_REACH,
  SYSTEM_AGENTS,
  SYSTEM_NODES,
  SYSTEM_SLEEVES,
} from "@/data/system-map";

/** Same cookie public mode writes. `1` is public. Anything else is private. */
export const PUBLIC_MODE_COOKIE = "__Host-resonance_public";

export const SYSTEM_EVENT_POLL_MS = 25_000;
export const SYSTEM_EVENT_REPLAY_LIMIT = 6;
export const LIVE_PULSE_MS = 1800;

export const SYSTEM_PULSE_TYPES = ["fill", "build", "brief", "fight", "finance"] as const;
export type SystemPulseType = (typeof SYSTEM_PULSE_TYPES)[number];

/** Keys a live event is allowed to carry. Nothing else leaves the server. */
export const SYSTEM_EVENT_KEYS = ["id", "type", "nodeIds", "edgeIds", "at"] as const;

export type SystemPulse = {
  id: string;
  type: SystemPulseType;
  nodeIds: string[];
  edgeIds: string[];
  at: string;
};

export type LiveKind = "hub" | "node" | "agent" | "source" | "sleeve";

export type LivePoint = {
  id: string;
  kind: LiveKind;
  label: string;
  href: string | null;
  detail: string | null;
  x: number;
  y: number;
  z: number;
};

export type LiveEdge = {
  id: string;
  from: string;
  to: string;
};

export type LiveGraph = {
  points: readonly LivePoint[];
  edges: readonly LiveEdge[];
};

export const LIVE_KIND_COLOR: Record<LiveKind, string> = {
  hub: "#f3e2b0",
  node: "#8ecbff",
  agent: "#d2b0ff",
  source: "#f0b45a",
  sleeve: "#7ef0d6",
};

const LOW_DEVICE_MEMORY_GB = 2;
const LOW_HARDWARE_CONCURRENCY = 2;

export type LiveCapability = {
  webgl: boolean;
  reducedMotion: boolean;
  deviceMemory: number | null;
  hardwareConcurrency: number | null;
  saveData: boolean;
};

export type LiveViewChoice = "auto" | "static" | "3d";

const FINANCE_POINT_IDS = new Set(["node:finance", "agent:finance-desk", "source:plaid"]);

export function livePointId(kind: LiveKind, id: string): string {
  return `${kind}:${id}`;
}

export function liveEdgeId(from: string, to: string): string {
  return `${from}--${to}`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function onRing(angle: number, radius: number, y: number): { x: number; y: number; z: number } {
  return {
    x: round3(Math.cos(angle) * radius),
    y,
    z: round3(Math.sin(angle) * radius),
  };
}

function averageAngle(angles: readonly number[]): number {
  let x = 0;
  let z = 0;
  for (const angle of angles) {
    x += Math.cos(angle);
    z += Math.sin(angle);
  }
  if (x === 0 && z === 0) return -Math.PI / 2;
  return Math.atan2(z, x);
}

function spreadPositions(
  items: readonly { id: string; angle: number }[],
  radius: number,
  y: number,
): Map<string, { x: number; y: number; z: number }> {
  const groups = new Map<string, { id: string; angle: number }[]>();
  for (const item of items) {
    const key = item.angle.toFixed(3);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const placed = new Map<string, { x: number; y: number; z: number }>();
  for (const group of groups.values()) {
    group.forEach((item, index) => {
      const offset = (index - (group.length - 1) / 2) * 0.36;
      placed.set(item.id, onRing(item.angle + offset, radius, y));
    });
  }
  return placed;
}

function firstSentence(value: string): string {
  const trimmed = value.trim();
  const cut = trimmed.split(". ")[0] ?? trimmed;
  if (!cut) return trimmed;
  return cut.endsWith(".") ? cut : `${cut}.`;
}

/** Drop a detail that carries a dollar amount. The label stays. */
export function safeLiveDetail(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  if (/\$\s?\d/.test(text)) return null;
  return firstSentence(text);
}

function nodeIdsForLabels(labels: readonly string[]): string[] {
  if (labels.includes("All nodes")) return SYSTEM_NODES.map((node) => node.id);
  const ids: string[] = [];
  for (const label of labels) {
    const node = SYSTEM_NODES.find((item) => item.label === label);
    if (node) ids.push(node.id);
  }
  return ids;
}

/**
 * Points and edges drawn from the system map.
 * The hub is Sophia Luna. Floor nodes, the other agents, data sources, and sleeves sit around her.
 */
export function buildLiveGraph(): LiveGraph {
  const nodeAngles = new Map<string, number>();
  SYSTEM_NODES.forEach((node, index) => {
    nodeAngles.set(node.id, -Math.PI / 2 + (index * 2 * Math.PI) / SYSTEM_NODES.length);
  });
  const angleOf = (ids: readonly string[]): number =>
    averageAngle(ids.map((id) => nodeAngles.get(id) ?? -Math.PI / 2));

  const points: LivePoint[] = [
    {
      id: livePointId("hub", "sophia"),
      kind: "hub",
      label: "Sophia Luna",
      href: null,
      detail: safeLiveDetail(SYSTEM_AGENTS.find((agent) => agent.id === "sophia")?.role),
      x: 0,
      y: 0,
      z: 0,
    },
  ];

  SYSTEM_NODES.forEach((node, index) => {
    const spot = onRing(nodeAngles.get(node.id) ?? index, 2.55, 0);
    points.push({
      id: livePointId("node", node.id),
      kind: "node",
      label: node.label,
      href: node.href,
      detail: safeLiveDetail(node.connection),
      ...spot,
    });
  });

  const sleeveSpots = spreadPositions(
    SYSTEM_SLEEVES.map((sleeve) => ({ id: sleeve.id, angle: angleOf(sleeve.nodes) })),
    1.42,
    0.16,
  );
  for (const sleeve of SYSTEM_SLEEVES) {
    const spot = sleeveSpots.get(sleeve.id) ?? { x: 0, y: 0.16, z: 0 };
    points.push({
      id: livePointId("sleeve", sleeve.id),
      kind: "sleeve",
      label: sleeve.label,
      href: null,
      detail: null,
      ...spot,
    });
  }

  const otherAgents = SYSTEM_AGENTS.filter((agent) => agent.id !== "sophia");
  const agentSpots = spreadPositions(
    otherAgents.map((agent) => ({
      id: agent.id,
      angle: angleOf(nodeIdsForLabels(agent.nodes)),
    })),
    3.7,
    0.38,
  );
  for (const agent of otherAgents) {
    const spot = agentSpots.get(agent.id) ?? { x: 0, y: 0.38, z: 0 };
    points.push({
      id: livePointId("agent", agent.id),
      kind: "agent",
      label: agent.name,
      href: null,
      detail: safeLiveDetail(agent.role),
      ...spot,
    });
  }

  const sourceSpots = spreadPositions(
    DATA_SOURCES.map((source) => ({
      id: source.id,
      angle: angleOf(SOURCE_REACH[source.id]),
    })),
    4.95,
    -0.22,
  );
  for (const source of DATA_SOURCES) {
    const spot = sourceSpots.get(source.id) ?? { x: 0, y: -0.22, z: 0 };
    points.push({
      id: livePointId("source", source.id),
      kind: "source",
      label: source.name,
      href: null,
      detail: safeLiveDetail(source.feeds),
      ...spot,
    });
  }

  const edges: LiveEdge[] = [];
  const seen = new Set<string>();
  const link = (from: string, to: string) => {
    if (from === to || seen.has(`${from}--${to}`)) return;
    const id = liveEdgeId(from, to);
    seen.add(id);
    edges.push({ id, from, to });
  };

  const hub = livePointId("hub", "sophia");
  for (const node of SYSTEM_NODES) link(hub, livePointId("node", node.id));
  for (const agent of otherAgents) {
    for (const nodeId of nodeIdsForLabels(agent.nodes)) {
      link(livePointId("agent", agent.id), livePointId("node", nodeId));
    }
  }
  for (const source of DATA_SOURCES) {
    for (const nodeId of SOURCE_REACH[source.id]) link(livePointId("source", source.id), livePointId("node", nodeId));
  }
  link(livePointId("source", "calendar"), hub);
  for (const sleeve of SYSTEM_SLEEVES) {
    link(livePointId("source", sleeve.sourceId), livePointId("sleeve", sleeve.id));
    for (const nodeId of sleeve.nodes) link(livePointId("sleeve", sleeve.id), livePointId("node", nodeId));
  }

  return { points, edges };
}

export function liveEdgeSet(graph: LiveGraph): Set<string> {
  return new Set(graph.edges.map((edge) => edge.id));
}

/** Public mode keeps the Finance point and drops its label detail and route. */
export function presentLiveGraph(graph: LiveGraph, publicMode: boolean): LiveGraph {
  if (!publicMode) return graph;
  return {
    points: graph.points.map((point) =>
      FINANCE_POINT_IDS.has(point.id) ? { ...point, href: null, detail: null } : point,
    ),
    edges: graph.edges,
  };
}

export function floorNodeIdForSymbol(symbol: string): string | null {
  const id = symbol.trim().toLowerCase();
  if (!id) return null;
  const parent = SYSTEM_NODES.find((node) => node.children.some((child) => child.id === id));
  return parent?.id ?? null;
}

function sourceKind(source: string, venue: string | null | undefined): "robinhood" | "coinbase" | null {
  const blob = `${source} ${venue ?? ""}`.toLowerCase();
  if (blob.includes("robinhood")) return "robinhood";
  if (blob.includes("coinbase")) return "coinbase";
  return null;
}

function sleeveKind(sourceId: "robinhood" | "coinbase", sleeve: string | null | undefined): string | null {
  const raw = (sleeve ?? "").trim().toLowerCase();
  const known = SYSTEM_SLEEVES.find((item) => item.id === raw);
  if (known) return known.sourceId === sourceId ? known.id : null;
  if (sourceId === "robinhood" && (raw === "" || raw === "default")) return "rh-agentic";
  if (sourceId === "coinbase" && (raw === "" || raw === "default")) return "coinbase";
  return null;
}

export type FillPulseInput = {
  source: string;
  venue?: string | null;
  sleeve?: string | null;
  symbol: string;
  at: string;
  externalId: string;
};

/** A posted fill travels source → sleeve → floor node. An unmapped symbol stays quiet. */
export function mapFillPulse(input: FillPulseInput, edges: ReadonlySet<string>): SystemPulse | null {
  const sourceId = sourceKind(input.source, input.venue);
  if (!sourceId || !input.at || !input.externalId) return null;
  const sleeveId = sleeveKind(sourceId, input.sleeve);
  const nodeId = floorNodeIdForSymbol(input.symbol);
  if (!sleeveId || !nodeId) return null;
  const edgeIds = [
    liveEdgeId(livePointId("source", sourceId), livePointId("sleeve", sleeveId)),
    liveEdgeId(livePointId("sleeve", sleeveId), livePointId("node", nodeId)),
  ];
  if (edgeIds.some((id) => !edges.has(id))) return null;
  return {
    id: `fill:${sourceId}:${input.externalId}`,
    type: "fill",
    nodeIds: [livePointId("node", nodeId)],
    edgeIds,
    at: input.at,
  };
}

export type BuildPulseInput = {
  id: string;
  status: string;
  prNumber: number | null;
  at: string;
};

/** A merged pull uses the GitHub Actions edge. Any other status change uses the Build API edge. */
export function mapBuildPulse(input: BuildPulseInput, edges: ReadonlySet<string>): SystemPulse | null {
  if (!input.id || !input.at || !input.status) return null;
  const merged = input.status === "live" && input.prNumber !== null && input.prNumber > 0;
  const sourceId = merged ? "github-actions" : "build-api";
  const edgeIds = [liveEdgeId(livePointId("source", sourceId), livePointId("node", "build"))];
  if (edgeIds.some((id) => !edges.has(id))) return null;
  return {
    id: `build:${input.id}:${input.status}:${input.at}`,
    type: "build",
    nodeIds: [livePointId("node", "build")],
    edgeIds,
    at: input.at,
  };
}

export type CalendarPulseInput = {
  id: string;
  kind: string | null;
  lane: string | null;
  title: string;
  status: string;
  at: string;
};

function isRanBrief(input: CalendarPulseInput): boolean {
  const brief =
    input.lane === "cadence" || input.id.startsWith("cadence-daily-brief")
      ? /\bdaily brief\b/i.test(input.title)
      : false;
  return brief && (input.status === "sent" || input.status === "history");
}

function isSettledFight(input: CalendarPulseInput): boolean {
  const fight = input.kind === "fight" || input.lane === "fights";
  return fight && input.status === "history";
}

/** A sent brief lights the hub. A fight in history lights Fight Desk. Scheduled rows stay quiet. */
export function mapCalendarPulse(input: CalendarPulseInput, edges: ReadonlySet<string>): SystemPulse | null {
  if (!input.id || !input.at) return null;
  if (isRanBrief(input)) {
    const edgeIds = [liveEdgeId(livePointId("source", "calendar"), livePointId("hub", "sophia"))];
    if (!edges.has(edgeIds[0] ?? "")) return null;
    return {
      id: `brief:${input.id}:${input.at}`,
      type: "brief",
      nodeIds: [livePointId("hub", "sophia")],
      edgeIds,
      at: input.at,
    };
  }
  if (isSettledFight(input)) {
    const edgeIds = [liveEdgeId(livePointId("source", "calendar"), livePointId("node", "fight-desk"))];
    if (!edges.has(edgeIds[0] ?? "")) return null;
    return {
      id: `fight:${input.id}:${input.at}`,
      type: "fight",
      nodeIds: [livePointId("node", "fight-desk")],
      edgeIds,
      at: input.at,
    };
  }
  return null;
}

export function mapFinancePulse(input: { asOf: string; at: string }, edges: ReadonlySet<string>): SystemPulse | null {
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(input.asOf)?.[1];
  if (!day || !input.at) return null;
  const edgeIds = [liveEdgeId(livePointId("source", "plaid"), livePointId("node", "finance"))];
  if (!edges.has(edgeIds[0] ?? "")) return null;
  return {
    id: `finance:${day}:${input.at}`,
    type: "finance",
    nodeIds: [livePointId("node", "finance")],
    edgeIds,
    at: input.at,
  };
}

export function toSystemEventResponse(events: readonly SystemPulse[]): { ok: true; events: SystemPulse[] } {
  return {
    ok: true,
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      nodeIds: [...event.nodeIds],
      edgeIds: [...event.edgeIds],
      at: event.at,
    })),
  };
}

export function selectLiveEvents(
  events: readonly SystemPulse[],
  since: string | null,
  limit = SYSTEM_EVENT_REPLAY_LIMIT,
): SystemPulse[] {
  const seen = new Set<string>();
  const filtered: SystemPulse[] = [];
  for (const event of events) {
    if (since && event.at <= since) continue;
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    filtered.push(event);
  }
  filtered.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? -1 : 1));
  return filtered.slice(0, limit);
}

export function parseSince(value: string | null): { ok: true; since: string | null } | { ok: false } {
  if (!value) return { ok: true, since: null };
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return { ok: false };
  return { ok: true, since: new Date(ms).toISOString() };
}

export function readPulseList(value: unknown): SystemPulse[] {
  if (!value || typeof value !== "object") return [];
  const events = (value as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];
  const pulses: SystemPulse[] = [];
  for (const item of events) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = row.type;
    if (
      typeof row.id !== "string" ||
      typeof row.at !== "string" ||
      (type !== "fill" && type !== "build" && type !== "brief" && type !== "fight" && type !== "finance") ||
      !Array.isArray(row.nodeIds) ||
      !row.nodeIds.every((id) => typeof id === "string") ||
      !Array.isArray(row.edgeIds) ||
      !row.edgeIds.every((id) => typeof id === "string")
    ) {
      continue;
    }
    pulses.push({
      id: row.id,
      type,
      nodeIds: [...row.nodeIds],
      edgeIds: [...row.edgeIds],
      at: row.at,
    });
  }
  return pulses;
}

/**
 * Static when WebGL is missing, motion is reduced, data saver is on,
 * memory or CPU is low, or the Static view control is on.
 * An explicit 3D choice still needs WebGL.
 */
export function preferStaticLiveView(input: LiveCapability & { choice: LiveViewChoice }): boolean {
  if (!input.webgl) return true;
  if (input.choice === "static") return true;
  if (input.choice === "3d") return false;
  if (input.reducedMotion || input.saveData) return true;
  if (input.deviceMemory !== null && input.deviceMemory <= LOW_DEVICE_MEMORY_GB) return true;
  if (
    input.hardwareConcurrency !== null &&
    input.hardwareConcurrency > 0 &&
    input.hardwareConcurrency <= LOW_HARDWARE_CONCURRENCY
  ) {
    return true;
  }
  return false;
}

/** The helper wins when this deploy has one. Otherwise the public cookie is the same contract. */
export async function resolveLivePublicMode(
  helper: (() => boolean | Promise<boolean>) | null,
  cookieValue: string | null | undefined,
): Promise<boolean> {
  if (helper) return Boolean(await helper());
  return cookieValue === "1";
}
