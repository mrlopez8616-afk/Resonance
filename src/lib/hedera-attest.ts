import {
  hederaNotConfiguredMessage,
  parseHederaAccountId,
  type HederaRuntimeConfig,
} from "./hedera-config";
import {
  buildHcsAttestationMemo,
  fingerprintPublicDecision,
} from "./hedera-fingerprint";
import type { Decision } from "./types";

export class AttestationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AttestationError";
    this.status = status;
  }
}

export interface AttestRequestBody {
  id: string;
  hederaMessageId?: string | null;
  attestedAt?: string | null;
}

export interface HederaSubmitResult {
  topicId: string;
  topicCreated: boolean;
  messageId: string;
  transactionId: string;
}

export type HederaSubmitter = (input: {
  topicId: string | null;
  message: string;
}) => Promise<HederaSubmitResult>;

export interface AttestationResult {
  decision: Decision;
  mode: "live" | "manual";
  topicId: string | null;
  topicCreated: boolean;
  messageId: string;
  transactionId: string | null;
}

export function parseAttestRequestBody(body: unknown): AttestRequestBody {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AttestationError("JSON body with id is required.");
  }
  const raw = body as Record<string, unknown>;
  const id =
    (typeof raw.id === "string" && raw.id.trim()) ||
    (typeof raw.decisionId === "string" && raw.decisionId.trim()) ||
    "";
  if (!id) {
    throw new AttestationError("id is required.");
  }
  const hederaMessageId =
    typeof raw.hederaMessageId === "string"
      ? raw.hederaMessageId.trim()
      : typeof raw.hedera_message_id === "string"
        ? raw.hedera_message_id.trim()
        : typeof raw.hederaTxId === "string"
          ? raw.hederaTxId.trim()
          : "";
  const attestedAt =
    typeof raw.attestedAt === "string"
      ? raw.attestedAt.trim()
      : typeof raw.attested_at === "string"
        ? raw.attested_at.trim()
        : "";
  if (attestedAt && Number.isNaN(new Date(attestedAt).getTime())) {
    throw new AttestationError("attestedAt must be a parseable ISO date.");
  }
  return {
    id,
    hederaMessageId: hederaMessageId || null,
    attestedAt: attestedAt || null,
  };
}

export function assertAttestationEligible(decision: Decision): void {
  if (decision.attestationStatus === "pending_operator_ack") {
    throw new AttestationError(
      "Sensor / raw events stay off Hedera until an operator views and acks them.",
    );
  }
  if (decision.status !== "decided" && decision.status !== "superseded") {
    throw new AttestationError(
      "Only decided or superseded chain-class rows can be attested. Pending rows stay Web2.",
    );
  }
}

export function applyAttestationWitness(
  decision: Decision,
  input: {
    fingerprint: string;
    hederaMessageId: string;
    attestedAt: string;
  },
): Decision {
  return {
    ...decision,
    fingerprint: input.fingerprint,
    attestationStatus: "hashgraph_attested",
    hederaMessageId: input.hederaMessageId,
    attestedAt: input.attestedAt,
  };
}

export async function attestDecision(input: {
  decision: Decision;
  request: AttestRequestBody;
  config: HederaRuntimeConfig;
  now?: string;
  submit?: HederaSubmitter;
}): Promise<AttestationResult> {
  assertAttestationEligible(input.decision);
  const attestedAt = input.request.attestedAt || input.now || new Date().toISOString();
  const { fingerprint } = fingerprintPublicDecision(input.decision);
  const { json } = buildHcsAttestationMemo({
    decisionId: input.decision.id,
    fingerprint,
    attestedAt,
  });

  if (input.request.hederaMessageId) {
    const messageId = input.request.hederaMessageId;
    return {
      decision: applyAttestationWitness(input.decision, {
        fingerprint,
        hederaMessageId: messageId,
        attestedAt,
      }),
      mode: "manual",
      topicId: input.config.topicId,
      topicCreated: false,
      messageId,
      transactionId: null,
    };
  }

  if (!input.config.configured || !input.submit) {
    throw new AttestationError(hederaNotConfiguredMessage(input.config), 503);
  }

  const submitted = await input.submit({
    topicId: input.config.topicId,
    message: json,
  });
  const topicId = parseHederaAccountId(submitted.topicId) ?? submitted.topicId;
  return {
    decision: applyAttestationWitness(input.decision, {
      fingerprint,
      hederaMessageId: submitted.messageId,
      attestedAt,
    }),
    mode: "live",
    topicId,
    topicCreated: submitted.topicCreated,
    messageId: submitted.messageId,
    transactionId: submitted.transactionId,
  };
}
