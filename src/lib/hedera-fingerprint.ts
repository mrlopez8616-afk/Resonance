import { createHash } from "node:crypto";
import { redactPublicMemoText } from "./public-view";
import type { Decision } from "./types";

export const HCS_MEMO_VERSION = 1 as const;
export const CHAIN_CLASS_LADDER = "chain_class" as const;

export type AttestationLadder = typeof CHAIN_CLASS_LADDER;

/** Public fields hashed for Hedera. Money-bearing private fields stay off-memo. */
export interface PublicAttestationRecord {
  v: typeof HCS_MEMO_VERSION;
  id: string;
  date: string;
  question: string;
  status: Decision["status"];
  decision: string;
  authorizedBy: string;
  attestationLadder: AttestationLadder;
}

export interface HcsAttestationMemo {
  v: typeof HCS_MEMO_VERSION;
  decisionId: string;
  fingerprint: string;
  attestedAt: string;
}

/** Same family as the Decision HCS memo — fingerprint only, no report body. */
export interface HcsReportAttestationMemo {
  v: typeof HCS_MEMO_VERSION;
  reportId: string;
  fingerprint: string;
  attestedAt: string;
}

const MONEY_LEAK =
  /\$\s?\d|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*XRP\b|\b\d{4,}(?:\.\d+)?\s*XRP\b/i;

export class FingerprintPurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FingerprintPurityError";
  }
}

export function assertNoMoneyLeak(text: string, label = "payload"): void {
  if (MONEY_LEAK.test(text)) {
    throw new FingerprintPurityError(
      `Public attestation ${label} must not include dollar or unit sizes.`,
    );
  }
}

export function buildPublicAttestationRecord(
  decision: Decision,
): PublicAttestationRecord {
  const record: PublicAttestationRecord = {
    v: HCS_MEMO_VERSION,
    id: decision.id,
    date: decision.date,
    question: redactPublicMemoText(decision.question),
    status: decision.status,
    decision: redactPublicMemoText(decision.decision),
    authorizedBy: redactPublicMemoText(decision.authorizedBy),
    attestationLadder: CHAIN_CLASS_LADDER,
  };
  assertNoMoneyLeak(JSON.stringify(record), "fingerprint record");
  return record;
}

export function fingerprintPublicDecision(decision: Decision): {
  fingerprint: string;
  publicRecord: PublicAttestationRecord;
} {
  const publicRecord = buildPublicAttestationRecord(decision);
  const canonical = JSON.stringify(publicRecord);
  const fingerprint = createHash("sha256").update(canonical, "utf8").digest("hex");
  return { fingerprint, publicRecord };
}

export function buildHcsAttestationMemo(input: {
  decisionId: string;
  fingerprint: string;
  attestedAt: string;
}): { memo: HcsAttestationMemo; json: string } {
  const memo: HcsAttestationMemo = {
    v: HCS_MEMO_VERSION,
    decisionId: input.decisionId,
    fingerprint: input.fingerprint,
    attestedAt: input.attestedAt,
  };
  const json = JSON.stringify(memo);
  assertNoMoneyLeak(json, "HCS memo");
  return { memo, json };
}

export function buildHcsReportAttestationMemo(input: {
  reportId: string;
  fingerprint: string;
  attestedAt: string;
}): { memo: HcsReportAttestationMemo; json: string } {
  const memo: HcsReportAttestationMemo = {
    v: HCS_MEMO_VERSION,
    reportId: input.reportId,
    fingerprint: input.fingerprint,
    attestedAt: input.attestedAt,
  };
  const json = JSON.stringify(memo);
  assertNoMoneyLeak(json, "HCS memo");
  return { memo, json };
}
