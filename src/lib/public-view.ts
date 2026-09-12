import type { AppState, Node } from "./types";

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
}

export interface PublicSkeleton {
  omitDryPowder: true;
  nodes: PublicNode[];
  decisions: PublicDecision[];
}

/** Shareable skeleton — no dollars, no exact XRP, no RH quantities. */
export function toPublicSkeleton(state: AppState): PublicSkeleton {
  return {
    omitDryPowder: true,
    nodes: state.nodes.map((node) => ({
      ticker: node.ticker,
      name: node.name,
      class: node.class,
      publicAllocationPct: node.publicAllocationPct,
    })),
    decisions: state.decisions.map((row) => ({
      id: row.id,
      date: row.date,
      question: row.question,
      status: row.status,
      attestationStatus: row.attestationStatus,
      fingerprint: row.fingerprint,
      hederaMessageId: row.hederaMessageId,
      attestedAt: row.attestedAt,
    })),
  };
}

export function publishedAllocationSum(nodes: PublicNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.publicAllocationPct ?? 0), 0);
}
