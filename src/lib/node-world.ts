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
    hint: "Agentic vs founder Main overlay is later. Stub only.",
    enabled: false,
  },
  {
    id: "red-locks",
    label: "Red locks",
    hint: "Xaman principal / RH Main stay visible and never spendable. Overlay later.",
    enabled: false,
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
