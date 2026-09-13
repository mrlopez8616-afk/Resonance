import type { AppState, Decision, Node } from "./types";

export interface PublicNode {
  ticker: string;
  name: string;
  class: Node["class"];
  publicAllocationPct: number | null;
}

export interface PublicDecision {
  id: string;
  date: string;
  question: string;
  status: string;
  attestationStatus: string;
  fingerprint: string | null;
  hederaMessageId: string | null;
  attestedAt: string | null;
  /** Hedera message id or public fingerprint. Null until attested. */
  memoHash: string | null;
  /** Attestation timestamp. Null until attested. */
  memoAt: string | null;
  /** XRPL Testnet payment-rail pointer. Public ledger hash only. */
  xrplTxHash: string | null;
  xrplMemoAt: string | null;
}

export interface PublicSkeleton {
  omitDryPowder: true;
  nodes: PublicNode[];
  decisions: PublicDecision[];
}

/** Drop dollar sizes and exact unit prints from anything that might become a public memo. */
export function redactPublicMemoText(text: string): string {
  return text
    .replace(/\$\s?\d[\d,]*(?:\.\d+)?/g, "[size omitted]")
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*XRP\b/gi, "[units omitted]")
    .replace(/\b\d{4,}(?:\.\d+)?\s*XRP\b/gi, "[units omitted]");
}

export function toPublicNodes(nodes: Node[]): PublicNode[] {
  return nodes.map((node) => ({
    ticker: node.ticker,
    name: node.name,
    class: node.class,
    publicAllocationPct: node.publicAllocationPct,
  }));
}

export function toPublicDecisions(decisions: Decision[]): PublicDecision[] {
  return decisions.map((row) => ({
    id: row.id,
    date: row.date,
    question: redactPublicMemoText(row.question),
    status: row.status,
    attestationStatus: row.attestationStatus,
    fingerprint: row.fingerprint,
    hederaMessageId: row.hederaMessageId,
    attestedAt: row.attestedAt,
    memoHash: row.hederaMessageId ?? row.fingerprint,
    memoAt: row.attestedAt,
    xrplTxHash: row.xrplTxHash,
    xrplMemoAt: row.xrplMemoAt,
  }));
}

/** Shareable skeleton — no dollars, no exact XRP, no RH quantities. */
export function toPublicSkeleton(state: AppState): PublicSkeleton {
  return {
    omitDryPowder: true,
    nodes: toPublicNodes(state.nodes),
    decisions: toPublicDecisions(state.decisions),
  };
}

export function publishedAllocationSum(nodes: PublicNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.publicAllocationPct ?? 0), 0);
}
