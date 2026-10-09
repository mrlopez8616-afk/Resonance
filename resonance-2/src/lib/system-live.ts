import {
  DATA_SOURCES,
  SOURCE_REACH,
  SYSTEM_AGENTS,
  SYSTEM_NODES,
  SYSTEM_SLEEVES,
} from "@/data/system-map";

export const SYSTEM_EVENT_POLL_MS = 25_000;
export const SYSTEM_EVENT_REPLAY_LIMIT = 6;
export const LIVE_PULSE_MS = 1800;
export const LIVE_CAMERA_FOV = 40;
/** Pull the bounding sphere inside the frame so hub and node labels stay on screen. */
export const LIVE_FIT_PADDING = 1.18;
/** Half-width of the longest node label, in CSS pixels, reserved on each side. */
export const LIVE_LABEL_GUTTER_PX = 56;

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

/**
 * Public mode keeps a finance pulse on the Finance node and drops the path.
 * The private response still names the Plaid edge and the snapshot day.
 */
export function presentLiveEvents(events: readonly SystemPulse[], publicMode: boolean): SystemPulse[] {
  return events.map((event) => {
    if (!publicMode || event.type !== "finance") {
      return {
        id: event.id,
        type: event.type,
        nodeIds: [...event.nodeIds],
        edgeIds: [...event.edgeIds],
        at: event.at,
      };
    }
    return {
      id: `finance:${event.at}`,
      type: "finance",
      nodeIds: [livePointId("node", "finance")],
      edgeIds: [],
      at: event.at,
    };
  });
}

export function toSystemEventResponse(
  events: readonly SystemPulse[],
  publicMode = false,
): { ok: true; events: SystemPulse[] } {
  return { ok: true, events: presentLiveEvents(events, publicMode) };
}

/** Radius of the sphere centered on the hub that contains every point. */
export function liveGraphRadius(points: readonly { x: number; y: number; z: number }[]): number {
  let radius = 0;
  for (const point of points) {
    radius = Math.max(radius, Math.hypot(point.x, point.y, point.z));
  }
  return radius;
}

/**
 * Camera distance that fits the bounding sphere in the viewport, with padding
 * and a side gutter for labels. A short wide phone is limited by width.
 */
export function liveFitDistance(
  radius: number,
  viewport: { width: number; height: number },
  fovDeg = LIVE_CAMERA_FOV,
): number {
  const width = Math.max(viewport.width, 1);
  const height = Math.max(viewport.height, 1);
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * (width / height);
  const usableW = Math.max(width - LIVE_LABEL_GUTTER_PX * 2, width * 0.5);
  const usableH = Math.max(height - LIVE_LABEL_GUTTER_PX * 2, height * 0.5);
  const distH = (radius * width) / (usableW * tanH);
  const distV = (radius * height) / (usableH * tanV);
  return Math.max(distH, distV) * LIVE_FIT_PADDING;
}

/** Fitted camera, elevated so the web reads as a floor and still looks at the hub. */
export function liveCameraFit(
  radius: number,
  viewport: { width: number; height: number },
): { distance: number; position: { x: number; y: number; z: number } } {
  const distance = liveFitDistance(radius, viewport);
  const length = Math.hypot(0, 0.58, 1);
  return {
    distance,
    position: {
      x: 0,
      y: (0.58 / length) * distance,
      z: (1 / length) * distance,
    },
  };
}

/** Normalized device coordinates for the fitted camera. The hub is the look target. */
export function liveProjected(
  point: { x: number; y: number; z: number },
  camera: { x: number; y: number; z: number },
  viewport: { width: number; height: number },
  fovDeg = LIVE_CAMERA_FOV,
): { x: number; y: number } {
  const fx = -camera.x;
  const fy = -camera.y;
  const fz = -camera.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  const forward = { x: fx / fl, y: fy / fl, z: fz / fl };
  const up = { x: 0, y: 1, z: 0 };
  const rx = forward.y * up.z - forward.z * up.y;
  const ry = forward.z * up.x - forward.x * up.z;
  const rz = forward.x * up.y - forward.y * up.x;
  const rl = Math.hypot(rx, ry, rz) || 1;
  const right = { x: rx / rl, y: ry / rl, z: rz / rl };
  const ux = right.y * forward.z - right.z * forward.y;
  const uy = right.z * forward.x - right.x * forward.z;
  const uz = right.x * forward.y - right.y * forward.x;
  const vx = point.x - camera.x;
  const vy = point.y - camera.y;
  const vz = point.z - camera.z;
  const depth = vx * forward.x + vy * forward.y + vz * forward.z;
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * (viewport.width / Math.max(viewport.height, 1));
  return {
    x: (vx * right.x + vy * right.y + vz * right.z) / depth / tanH,
    y: (vx * ux + vy * uy + vz * uz) / depth / tanV,
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

