import { redactPublicMemoText } from "./public-view";
import { DIGITAL_TICKERS, PHYSICAL_AI_TICKERS } from "./robinhood";
import type {
  AgenticIntent,
  AttestationStatus,
  Decision,
  Node,
  NodeLinkKind,
} from "./types";

/** Wheel / click altitude. World = 12 boxes; node = selected card; guts = architecture stubs. */
export type WorldAltitude = "world" | "node" | "guts";

export const WORLD_ALTITUDES: WorldAltitude[] = ["world", "node", "guts"];

export const WORLD_LAYER_IDS = [
  "capital-flow",
  "stamps",
  "sensors",
  "sleeves",
  "red-locks",
  "carla",
] as const;

export type WorldLayerId = (typeof WORLD_LAYER_IDS)[number];

export interface WorldLayerSpec {
  id: WorldLayerId;
  label: string;
  hint: string;
  /** Phase-0 working toggles. Others stay in the rack but cannot be armed. */
  enabled: boolean;
}

export const WORLD_LAYERS: WorldLayerSpec[] = [
  {
    id: "capital-flow",
    label: "Capital flow",
    hint: "Pipes from existing node links plus the Xaman treasury well into XRP. No dollar sizes.",
    enabled: true,
  },
  {
    id: "stamps",
    label: "Stamps",
    hint: "Hedera witness + XRPL R1 pointer on decisions that mention this ticker.",
    enabled: true,
  },
  {
    id: "sensors",
    label: "Sensors",
    hint: "Live sensor feeds are later. Stub only.",
    enabled: false,
  },
  {
    id: "sleeves",
    label: "Sleeves",
    hint: "Agentic vs founder/Main thesis overlay on the same twelve nodes. Visibility only — no spend.",
    enabled: true,
  },
  {
    id: "red-locks",
    label: "Red locks",
    hint: "Xaman principal well + RH Main marked OFF LIMITS. Visible only; never spendable.",
    enabled: true,
  },
  {
    id: "carla",
    label: "Carla / bridge",
    hint: "Human-bridge overlay is later. Stub only.",
    enabled: false,
  },
];

/** 7-column map: digital 0–2, treasury well 3, physical 4–6. */
export interface NodeMapSlot {
  ticker: string;
  col: number;
  row: number;
  cluster: "digital" | "physical";
}

export const NODE_MAP_SLOTS: readonly NodeMapSlot[] = [
  { ticker: "BTC", col: 0, row: 0, cluster: "digital" },
  { ticker: "ETH", col: 1, row: 0, cluster: "digital" },
  { ticker: "SOL", col: 2, row: 0, cluster: "digital" },
  { ticker: "XRP", col: 0, row: 1, cluster: "digital" },
  { ticker: "SUI", col: 1, row: 1, cluster: "digital" },
  { ticker: "FLR", col: 2, row: 1, cluster: "digital" },
  { ticker: "PWR", col: 4, row: 0, cluster: "physical" },
  { ticker: "ETN", col: 5, row: 0, cluster: "physical" },
  { ticker: "VRT", col: 6, row: 0, cluster: "physical" },
  { ticker: "GEV", col: 4, row: 1, cluster: "physical" },
  { ticker: "CEG", col: 5, row: 1, cluster: "physical" },
  { ticker: "HUBB", col: 6, row: 1, cluster: "physical" },
] as const;

export const TREASURY_MAP_SLOT = { id: "TREASURY", col: 3, row: 0.5 } as const;

/** Empty cell under the Xaman well — Agentic dock for queued-intent pipes. */
export const AGENTIC_MAP_SLOT = { id: "AGENTIC", col: 3, row: 1 } as const;

const ATTESTATION_RANK: Record<AttestationStatus, number> = {
  web2_only: 0,
  pending_operator_ack: 1,
  hashgraph_queued: 2,
  hashgraph_attested: 3,
};

export type CapitalFlowKind = NodeLinkKind | "treasury-principal" | "agentic-queued";

export interface CapitalFlow {
  id: string;
  from: string;
  to: string;
  kind: CapitalFlowKind;
  note: string;
}

export interface NodeStampPointer {
  id: string;
  attestationStatus: AttestationStatus;
  hederaMessageId: string | null;
  xrplTxHash: string | null;
}

export interface NodeStampSummary {
  ticker: string;
  decisionCount: number;
  hederaStatus: AttestationStatus | null;
  hederaMessageId: string | null;
  xrplTxHash: string | null;
  pointers: NodeStampPointer[];
}

export type SleeveOverlayLane = "agentic" | "founder-main" | "founder-thesis";

export type SleeveOverlaySource = "model" | "stub";

export interface NodeSleeveOverlay {
  ticker: string;
  lanes: SleeveOverlayLane[];
  sources: SleeveOverlaySource[];
  note: string;
}

export type RedLockKind = "xaman-principal" | "rh-main";

export interface RedLockMark {
  id: string;
  target: string;
  kind: RedLockKind;
  label: "OFF LIMITS";
  note: string;
}

export interface DrawableCapitalFlow extends CapitalFlow {
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  path: string;
}

/**
 * Founder-editable sleeve overlay stub.
 * Same locked 12-node universe only — do not add or remove tickers.
 * Live model wins: `node.sleeve` and queued `agenticIntents`.
 * These notes apply only when a ticker has no Main/Agentic model assignment.
 */
export const FOUNDER_THESIS_SLEEVE_STUB: Readonly<Record<string, string>> = {
  BTC: "Founder thesis watch. Not on RH Main or Agentic until assigned.",
  ETH: "Founder thesis watch. Not on RH Main or Agentic until assigned.",
  SOL: "Founder thesis watch. Not on RH Main or Agentic until assigned.",
  XRP: "Falls back to founder thesis only if the RH Main sleeve is cleared. Xaman principal is the well, not this stub.",
  SUI: "Founder thesis watch. Not on RH Main or Agentic until assigned.",
  FLR: "Founder thesis / Flare yield venue for XRP. Not a Robinhood sleeve until assigned.",
  PWR: "Falls back only if the Main lot and queued Agentic intent are both gone.",
  ETN: "Falls back only if the Main lot and queued Agentic intent are both gone.",
  VRT: "Falls back only if the Main lot and queued Agentic intent are both gone.",
  GEV: "Falls back only if the Main lot and queued Agentic intent are both gone.",
  CEG: "Falls back only if the RH Main learning-lot sleeve is cleared.",
  HUBB: "Falls back only if the RH Main learning-lot sleeve is cleared.",
};

export const SLEEVE_LANE_LABEL: Record<SleeveOverlayLane, string> = {
  agentic: "Agentic",
  "founder-main": "Founder Main",
  "founder-thesis": "Founder thesis",
};

export const FLOW_KIND_LABEL: Record<CapitalFlowKind, string> = {
  funds: "Funds",
  "depends-on": "Depends on",
  related: "Related",
  "treasury-principal": "Xaman well",
  "agentic-queued": "Agentic queued",
};

export interface NodeWorldCard {
  ticker: string;
  name: string;
  class: Node["class"];
  status: Node["status"];
  sleeve: Node["sleeve"];
  cluster: "digital" | "physical";
  thesis: string;
  failureCondition: string;
  publicAllocationPct: number | null;
  venue: string;
  web2Record: boolean;
  slot: NodeMapSlot;
}

/** Locked 12-node order. Never invents tickers; drops unknown extras. */
export function worldNodeOrder(nodes: Node[]): Node[] {
  const byTicker = new Map(nodes.map((node) => [node.ticker.toUpperCase(), node]));
  const ordered: Node[] = [];
  for (const ticker of [...DIGITAL_TICKERS, ...PHYSICAL_AI_TICKERS]) {
    const node = byTicker.get(ticker);
    if (node) ordered.push(node);
  }
  return ordered;
}

export function slotForTicker(ticker: string): NodeMapSlot | null {
  return (
    NODE_MAP_SLOTS.find((slot) => slot.ticker === ticker.toUpperCase()) ?? null
  );
}

export function mapPoint(col: number, row: number): { x: number; y: number } {
  return {
    x: ((col + 0.5) / 7) * 100,
    y: ((row + 0.5) / 2) * 100,
  };
}

/** Map-space anchor for a node ticker or the TREASURY / AGENTIC docks. */
export function flowAnchor(id: string): { x: number; y: number } | null {
  const key = id.toUpperCase();
  if (key === "TREASURY") {
    return mapPoint(TREASURY_MAP_SLOT.col, TREASURY_MAP_SLOT.row);
  }
  if (key === "AGENTIC") {
    return mapPoint(AGENTIC_MAP_SLOT.col, AGENTIC_MAP_SLOT.row);
  }
  const slot = slotForTicker(key);
  return slot ? mapPoint(slot.col, slot.row) : null;
}

/** Walk toward `to` so belts stop at the box edge instead of vanishing under the card. */
export function moveToward(
  from: { x: number; y: number },
  to: { x: number; y: number },
  distance: number,
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const travel = Math.min(distance, len * 0.42);
  return {
    x: from.x + (dx / len) * travel,
    y: from.y + (dy / len) * travel,
  };
}

/** Quadratic belt path. Opposite directions and sibling pipes bow apart so XRP↔FLR and Agentic stacks stay readable. */
export function pipePath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  sway = 0,
): string {
  const start = moveToward(from, to, 6.4);
  const end = moveToward(to, from, 6.4);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const bias = start.x + start.y <= end.x + end.y ? 2.2 : -2.2;
  const midX = (start.x + end.x) / 2 + dy * 0.2 + bias + sway;
  const midY = (start.y + end.y) / 2 - dx * 0.18 - 1.5 + sway * 0.4;
  return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
}

export function drawableCapitalFlows(flows: CapitalFlow[]): DrawableCapitalFlow[] {
  const sibling = new Map<string, number>();
  const drawn: DrawableCapitalFlow[] = [];
  for (const flow of flows) {
    const fromPoint = flowAnchor(flow.from);
    const toPoint = flowAnchor(flow.to);
    if (!fromPoint || !toPoint) continue;
    const nth = sibling.get(flow.from) ?? 0;
    sibling.set(flow.from, nth + 1);
    const sway = (nth - 1.5) * 3.6;
    const start = moveToward(fromPoint, toPoint, 6.4);
    const end = moveToward(toPoint, fromPoint, 6.4);
    drawn.push({
      ...flow,
      fromPoint: start,
      toPoint: end,
      path: pipePath(fromPoint, toPoint, sway),
    });
  }
  return drawn;
}

export function nextAltitude(
  current: WorldAltitude,
  direction: "in" | "out",
): WorldAltitude {
  const index = WORLD_ALTITUDES.indexOf(current);
  if (direction === "in") {
    return WORLD_ALTITUDES[Math.min(index + 1, WORLD_ALTITUDES.length - 1)] ?? current;
  }
  return WORLD_ALTITUDES[Math.max(index - 1, 0)] ?? current;
}

export function altitudeScale(altitude: WorldAltitude): number {
  if (altitude === "guts") return 1.12;
  if (altitude === "node") return 1.06;
  return 1;
}

const TICKER_RE_CACHE = new Map<string, RegExp>();

function tickerBoundary(ticker: string): RegExp {
  const key = ticker.toUpperCase();
  const cached = TICKER_RE_CACHE.get(key);
  if (cached) return cached;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  TICKER_RE_CACHE.set(key, re);
  return re;
}

export function textMentionsTicker(text: string, ticker: string): boolean {
  if (!text.trim()) return false;
  return tickerBoundary(ticker).test(text);
}

/** Word-boundary ticker match across the written record. Does not invent links. */
export function decisionTouchesTicker(decision: Decision, ticker: string): boolean {
  return (
    textMentionsTicker(decision.question, ticker) ||
    textMentionsTicker(decision.proposal, ticker) ||
    textMentionsTicker(decision.options, ticker) ||
    textMentionsTicker(decision.decision, ticker) ||
    textMentionsTicker(decision.rationale, ticker) ||
    textMentionsTicker(decision.outcome, ticker) ||
    textMentionsTicker(decision.evidence, ticker) ||
    textMentionsTicker(decision.reviewTrigger, ticker)
  );
}

export function decisionsForTicker(
  decisions: Decision[],
  ticker: string,
  intents: AgenticIntent[] = [],
): Decision[] {
  const viaText = decisions.filter((row) => decisionTouchesTicker(row, ticker));
  const intentIds = new Set(
    intents
      .filter((intent) => intent.ticker.toUpperCase() === ticker.toUpperCase())
      .map((intent) => intent.authorizedByDecisionId),
  );
  if (intentIds.size === 0) return viaText;
  const extra = decisions.filter((row) => intentIds.has(row.id));
  const byId = new Map<string, Decision>();
  for (const row of viaText) byId.set(row.id, row);
  for (const row of extra) byId.set(row.id, row);
  return Array.from(byId.values());
}

export function toNodeWorldCard(node: Node): NodeWorldCard | null {
  const slot = slotForTicker(node.ticker);
  if (!slot) return null;
  return {
    ticker: node.ticker,
    name: node.name,
    class: node.class,
    status: node.status,
    sleeve: node.sleeve,
    cluster: slot.cluster,
    thesis: node.thesis,
    failureCondition: node.failureCondition,
    publicAllocationPct: node.publicAllocationPct,
    venue: node.venue,
    web2Record: true,
    slot,
  };
}

export function worldCards(nodes: Node[]): NodeWorldCard[] {
  return worldNodeOrder(nodes)
    .map(toNodeWorldCard)
    .filter((card): card is NodeWorldCard => card !== null);
}

export function capitalFlowsFor(
  nodes: Node[],
  intents: AgenticIntent[] = [],
): CapitalFlow[] {
  const known = new Set(nodes.map((node) => node.ticker.toUpperCase()));
  const flows: CapitalFlow[] = [];

  if (known.has("XRP")) {
    flows.push({
      id: "flow-treasury-xrp",
      from: "TREASURY",
      to: "XRP",
      kind: "treasury-principal",
      note: "Xaman / Flare-vault principal well. Visible. Never spendable from this board.",
    });
  }

  for (const node of worldNodeOrder(nodes)) {
    for (const link of node.links) {
      const target = link.targetTicker.toUpperCase();
      if (!known.has(target)) continue;
      flows.push({
        id: `flow-${node.ticker}-${target}-${link.kind}`,
        from: node.ticker,
        to: target,
        kind: link.kind,
        note: link.note,
      });
    }
  }

  for (const intent of intents) {
    if (intent.status !== "queued") continue;
    const to = intent.ticker.toUpperCase();
    if (!known.has(to)) continue;
    flows.push({
      id: `flow-agentic-${intent.id}`,
      from: "AGENTIC",
      to: to,
      kind: "agentic-queued",
      note: "Queued Agentic intent — not a fill. No ticket size on this overlay.",
    });
  }

  return flows;
}

export function stampSummaryForTicker(
  ticker: string,
  decisions: Decision[],
  intents: AgenticIntent[] = [],
): NodeStampSummary {
  const rows = decisionsForTicker(decisions, ticker, intents);
  let hederaStatus: AttestationStatus | null = null;
  let hederaMessageId: string | null = null;
  let xrplTxHash: string | null = null;

  for (const row of rows) {
    if (
      hederaStatus === null ||
      ATTESTATION_RANK[row.attestationStatus] > ATTESTATION_RANK[hederaStatus]
    ) {
      hederaStatus = row.attestationStatus;
    }
    if (!hederaMessageId && row.hederaMessageId) {
      hederaMessageId = row.hederaMessageId;
    }
    if (!xrplTxHash && row.xrplTxHash) {
      xrplTxHash = row.xrplTxHash;
    }
  }

  return {
    ticker: ticker.toUpperCase(),
    decisionCount: rows.length,
    hederaStatus,
    hederaMessageId,
    xrplTxHash,
    pointers: rows.map((row) => ({
      id: row.id,
      attestationStatus: row.attestationStatus,
      hederaMessageId: row.hederaMessageId,
      xrplTxHash: row.xrplTxHash,
    })),
  };
}

export function stampSummaries(
  nodes: Node[],
  decisions: Decision[],
  intents: AgenticIntent[] = [],
): Map<string, NodeStampSummary> {
  const map = new Map<string, NodeStampSummary>();
  for (const node of worldNodeOrder(nodes)) {
    map.set(
      node.ticker,
      stampSummaryForTicker(node.ticker, decisions, intents),
    );
  }
  return map;
}

/** Public-safe stamp payload: ids + rail status only. No dollars, outcomes, or quantities. */
export function publicSafeStampBlob(summary: NodeStampSummary): string {
  return JSON.stringify({
    ticker: summary.ticker,
    decisionCount: summary.decisionCount,
    hederaStatus: summary.hederaStatus,
    hederaMessageId: summary.hederaMessageId,
    xrplTxHash: summary.xrplTxHash,
    pointers: summary.pointers,
  });
}

export function allocationLabel(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "Unpublished";
  return `${pct}%`;
}

export function redactedDecisionQuestion(question: string): string {
  return redactPublicMemoText(question);
}

export function isWorkingLayer(id: WorldLayerId): boolean {
  return WORLD_LAYERS.find((layer) => layer.id === id)?.enabled ?? false;
}

export function sleeveOverlayFor(
  nodes: Node[],
  intents: AgenticIntent[] = [],
): NodeSleeveOverlay[] {
  const queued = new Set(
    intents
      .filter((intent) => intent.status === "queued")
      .map((intent) => intent.ticker.toUpperCase()),
  );

  return worldNodeOrder(nodes).map((node) => {
    const ticker = node.ticker.toUpperCase();
    const lanes: SleeveOverlayLane[] = [];
    const sources: SleeveOverlaySource[] = [];
    const notes: string[] = [];

    if (node.sleeve === "main") {
      lanes.push("founder-main");
      sources.push("model");
      notes.push("RH Main / founder learning lot from node.sleeve.");
    }
    if (node.sleeve === "agentic") {
      lanes.push("agentic");
      sources.push("model");
      notes.push("Agentic sleeve from node.sleeve.");
    }
    if (queued.has(ticker) && !lanes.includes("agentic")) {
      lanes.push("agentic");
      sources.push("model");
      notes.push("Queued Agentic intent on this ticker. Not a fill. No ticket size.");
    }
    if (lanes.length === 0) {
      lanes.push("founder-thesis");
      sources.push("stub");
      notes.push(
        FOUNDER_THESIS_SLEEVE_STUB[ticker] ??
          "Founder thesis sleeve stub. Edit FOUNDER_THESIS_SLEEVE_STUB — do not invent nodes.",
      );
    }

    return {
      ticker,
      lanes,
      sources,
      note: notes.join(" "),
    };
  });
}

export function sleeveOverlayByTicker(
  nodes: Node[],
  intents: AgenticIntent[] = [],
): Map<string, NodeSleeveOverlay> {
  return new Map(
    sleeveOverlayFor(nodes, intents).map((row) => [row.ticker, row]),
  );
}

export function sleeveLaneKey(
  overlay: NodeSleeveOverlay | null | undefined,
): "agentic" | "founder-main" | "founder-thesis" | "both" | "none" {
  if (!overlay || overlay.lanes.length === 0) return "none";
  const hasMain = overlay.lanes.includes("founder-main");
  const hasAgentic = overlay.lanes.includes("agentic");
  if (hasMain && hasAgentic) return "both";
  if (hasAgentic) return "agentic";
  if (hasMain) return "founder-main";
  return "founder-thesis";
}

/** Visibility marks only. Never a spend control. */
export function redLocksFor(nodes: Node[]): RedLockMark[] {
  const marks: RedLockMark[] = [
    {
      id: "lock-xaman-well",
      target: "TREASURY",
      kind: "xaman-principal",
      label: "OFF LIMITS",
      note: "Xaman / Flare-vault principal well. Visible only. Never spendable from this board.",
    },
  ];

  for (const node of worldNodeOrder(nodes)) {
    if (node.sleeve !== "main") continue;
    marks.push({
      id: `lock-rh-main-${node.ticker.toUpperCase()}`,
      target: node.ticker.toUpperCase(),
      kind: "rh-main",
      label: "OFF LIMITS",
      note: "Robinhood Main learning lot. Visible only. Resonance never spends Main.",
    });
  }

  return marks;
}

export function redLocksByTarget(nodes: Node[]): Map<string, RedLockMark> {
  return new Map(redLocksFor(nodes).map((mark) => [mark.target, mark]));
}
