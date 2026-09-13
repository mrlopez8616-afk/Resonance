import {
  isXrplConnectFailure,
  xrplNotConfiguredMessage,
  type XrplRuntimeConfig,
} from "./xrpl-config";
import { buildR1Memo, XrplMemoError } from "./xrpl-memo";
import type { Decision } from "./types";

export class XrplMirrorError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "XrplMirrorError";
    this.status = status;
  }
}

export interface XrplMirrorRequestBody {
  id: string;
  xrplTxHash?: string | null;
  xrplMemoAt?: string | null;
}

export interface XrplSubmitResult {
  txHash: string;
}

export type XrplSubmitter = (input: {
  memo: string;
  account: string;
}) => Promise<XrplSubmitResult>;

export interface XrplMirrorResult {
  decision: Decision;
  mode: "live" | "manual";
  memo: string;
  txHash: string;
}

export function parseXrplMirrorRequestBody(body: unknown): XrplMirrorRequestBody {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new XrplMirrorError("JSON body with id is required.");
  }
  const raw = body as Record<string, unknown>;
  const id =
    (typeof raw.id === "string" && raw.id.trim()) ||
    (typeof raw.decisionId === "string" && raw.decisionId.trim()) ||
    "";
  if (!id) {
    throw new XrplMirrorError("id is required.");
  }
  const xrplTxHash =
    typeof raw.xrplTxHash === "string"
      ? raw.xrplTxHash.trim()
      : typeof raw.xrpl_tx_hash === "string"
        ? raw.xrpl_tx_hash.trim()
        : "";
  const xrplMemoAt =
    typeof raw.xrplMemoAt === "string"
      ? raw.xrplMemoAt.trim()
      : typeof raw.xrpl_memo_at === "string"
        ? raw.xrpl_memo_at.trim()
        : "";
  if (xrplMemoAt && Number.isNaN(new Date(xrplMemoAt).getTime())) {
    throw new XrplMirrorError("xrplMemoAt must be a parseable ISO date.");
  }
  return {
    id,
    xrplTxHash: xrplTxHash || null,
    xrplMemoAt: xrplMemoAt || null,
  };
}

export function assertXrplMirrorEligible(decision: Decision): void {
  if (decision.attestationStatus === "pending_operator_ack") {
    throw new XrplMirrorError(
      "Sensor / raw events stay off XRPL until an operator acks and Hedera attests them.",
    );
  }
  if (decision.attestationStatus !== "hashgraph_attested") {
    throw new XrplMirrorError(
      "Mirror on XRPL Testnet only after Hedera attest (hashgraph_attested).",
    );
  }
  if (!decision.hederaMessageId?.trim() || !decision.fingerprint?.trim()) {
    throw new XrplMirrorError(
      "Need hederaMessageId and fingerprint before the XRPL pointer can be written.",
    );
  }
}

export function applyXrplMirrorWitness(
  decision: Decision,
  input: { xrplTxHash: string; xrplMemoAt: string },
): Decision {
  return {
    ...decision,
    xrplTxHash: input.xrplTxHash,
    xrplMemoAt: input.xrplMemoAt,
  };
}

export async function mirrorDecisionOnXrpl(input: {
  decision: Decision;
  request: XrplMirrorRequestBody;
  config: XrplRuntimeConfig;
  now?: string;
  submit?: XrplSubmitter;
}): Promise<XrplMirrorResult> {
  assertXrplMirrorEligible(input.decision);
  const xrplMemoAt = input.request.xrplMemoAt || input.now || new Date().toISOString();

  let memo: string;
  try {
    memo = buildR1Memo({
      decisionId: input.decision.id,
      hederaMessageId: input.decision.hederaMessageId ?? "",
      fingerprint: input.decision.fingerprint ?? "",
      network: input.config.network,
    });
  } catch (error) {
    const message =
      error instanceof XrplMemoError
        ? error.message
        : "Could not build the R1 memo.";
    throw new XrplMirrorError(message);
  }

  if (input.request.xrplTxHash) {
    return {
      decision: applyXrplMirrorWitness(input.decision, {
        xrplTxHash: input.request.xrplTxHash,
        xrplMemoAt,
      }),
      mode: "manual",
      memo,
      txHash: input.request.xrplTxHash,
    };
  }

  if (input.config.rejectedNetwork) {
    throw new XrplMirrorError(xrplNotConfiguredMessage(input.config), 503);
  }

  if (!input.config.configured || !input.submit) {
    throw new XrplMirrorError(xrplNotConfiguredMessage(input.config), 503);
  }

  let submitted: XrplSubmitResult;
  try {
    submitted = await input.submit({
      memo,
      account: input.config.account,
    });
  } catch (error) {
    if (error instanceof XrplMirrorError) throw error;
    const message =
      error instanceof Error ? error.message : "XRPL Testnet submit failed.";
    throw new XrplMirrorError(message, isXrplConnectFailure(error) ? 502 : 500);
  }
  return {
    decision: applyXrplMirrorWitness(input.decision, {
      xrplTxHash: submitted.txHash,
      xrplMemoAt,
    }),
    mode: "live",
    memo,
    txHash: submitted.txHash,
  };
}
