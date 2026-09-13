import {
  emptyDecisionFields,
  mergeDecisionsById,
  normalizeDecision,
  parseAttestationStatus,
  parseDecisionStatus,
  parseFingerprint,
  previewDecisionsMerge,
  type DecisionsMergePreview,
} from "./decisions";
import type { Decision } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class DecisionWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionWriteError";
  }
}

/** Canonical fields present on the raw object (including hub aliases). */
export function pickDecisionPatch(raw: Record<string, unknown>): Partial<Decision> {
  const patch: Partial<Decision> = {};
  if ("question" in raw) patch.question = asString(raw.question, "").trim();
  if ("proposal" in raw || "proposed" in raw) {
    patch.proposal = asString(raw.proposal, asString(raw.proposed, "")).trim();
  }
  if ("options" in raw) patch.options = asString(raw.options, "").trim();
  if ("status" in raw) patch.status = parseDecisionStatus(raw.status);
  if ("decision" in raw || "founderDecision" in raw || "founder_decision" in raw) {
    patch.decision = asString(
      raw.decision,
      asString(raw.founderDecision, asString(raw.founder_decision, "")),
    ).trim();
  }
  if ("rationale" in raw || "why" in raw) {
    patch.rationale = asString(raw.rationale, asString(raw.why, "")).trim();
  }
  if ("authorizedBy" in raw || "authorized_by" in raw || "authorizer" in raw) {
    patch.authorizedBy = asString(
      raw.authorizedBy,
      asString(raw.authorized_by, asString(raw.authorizer, "")),
    ).trim();
  }
  if ("outcome" in raw) patch.outcome = asString(raw.outcome, "").trim();
  if ("evidence" in raw || "receipt" in raw) {
    patch.evidence = asString(raw.evidence, asString(raw.receipt, "")).trim();
  }
  if ("reviewTrigger" in raw || "review_trigger" in raw) {
    patch.reviewTrigger = asString(
      raw.reviewTrigger,
      asString(raw.review_trigger, ""),
    ).trim();
  }
  if ("fingerprint" in raw) patch.fingerprint = parseFingerprint(raw.fingerprint);
  if ("attestationStatus" in raw) {
    patch.attestationStatus = parseAttestationStatus(raw.attestationStatus);
  }
  if (
    "hederaMessageId" in raw ||
    "hedera_message_id" in raw ||
    "hederaTxId" in raw
  ) {
    patch.hederaMessageId = parseFingerprint(
      raw.hederaMessageId ?? raw.hedera_message_id ?? raw.hederaTxId,
    );
  }
  if ("attestedAt" in raw || "attested_at" in raw) {
    patch.attestedAt =
      asTrimmedString(raw.attestedAt) ?? asTrimmedString(raw.attested_at);
  }
  if ("xrplTxHash" in raw || "xrpl_tx_hash" in raw) {
    patch.xrplTxHash = parseFingerprint(raw.xrplTxHash ?? raw.xrpl_tx_hash);
  }
  if ("xrplMemoAt" in raw || "xrpl_memo_at" in raw) {
    patch.xrplMemoAt =
      asTrimmedString(raw.xrplMemoAt) ?? asTrimmedString(raw.xrpl_memo_at);
  }
  if ("date" in raw) patch.date = asString(raw.date, "").trim();
  if ("createdAt" in raw) patch.createdAt = asString(raw.createdAt, "");
  return patch;
}

export function readDecisionId(raw: Record<string, unknown>): string | null {
  return (
    asTrimmedString(raw.id) ??
    asTrimmedString(raw.decisionId) ??
    asTrimmedString(raw.recordId)
  );
}

export function applyDecisionPatch(
  current: Decision,
  patch: Partial<Decision>,
): Decision {
  return {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt || patch.createdAt || new Date().toISOString(),
  };
}

export interface DecisionWriteItem {
  id: string;
  raw: Record<string, unknown>;
  patch: Partial<Decision>;
}

export function collectWriteItems(body: unknown): DecisionWriteItem[] {
  const rows = extractWriteRows(body);
  return rows.map((raw, index) => {
    const id = readDecisionId(raw);
    if (!id) {
      throw new DecisionWriteError(`Item ${index} is missing id.`);
    }
    return { id, raw, patch: pickDecisionPatch(raw) };
  });
}

function extractWriteRows(body: unknown): Record<string, unknown>[] {
  if (body == null) {
    throw new DecisionWriteError("Expected a JSON object or array.");
  }
  if (Array.isArray(body)) {
    if (body.length === 0) {
      throw new DecisionWriteError("decisions array is empty.");
    }
    return body.map((item, index) => {
      if (!isRecord(item)) {
        throw new DecisionWriteError(`decisions[${index}] must be an object.`);
      }
      return item;
    });
  }
  if (!isRecord(body)) {
    throw new DecisionWriteError("Expected a JSON object or array.");
  }
  if (Array.isArray(body.decisions)) {
    if (body.decisions.length === 0) {
      throw new DecisionWriteError("decisions array is empty.");
    }
    return body.decisions.map((item, index) => {
      if (!isRecord(item)) {
        throw new DecisionWriteError(`decisions[${index}] must be an object.`);
      }
      return item;
    });
  }
  if (readDecisionId(body)) {
    return [body];
  }
  throw new DecisionWriteError(
    "JSON must include id, a decisions array, or a single decision object.",
  );
}

export function upsertDecisionsFromWrites(
  existing: Decision[],
  items: DecisionWriteItem[],
  now = new Date().toISOString(),
): { decisions: Decision[]; preview: DecisionsMergePreview } {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const materialized: Decision[] = [];

  for (const item of items) {
    const prev = byId.get(item.id);
    if (prev) {
      const next = applyDecisionPatch(prev, item.patch);
      byId.set(item.id, next);
      materialized.push(next);
      continue;
    }
    if (!asString(item.raw.question, "").trim()) {
      throw new DecisionWriteError(
        `Unknown decision ${item.id}. New rows need a question.`,
      );
    }
    const created = {
      ...emptyDecisionFields(),
      ...normalizeDecision(item.raw, 0, now),
      id: item.id,
      createdAt: asString(item.raw.createdAt, now) || now,
    };
    byId.set(item.id, created);
    materialized.push(created);
  }

  const decisions = mergeDecisionsById(existing, Array.from(byId.values()));
  return {
    decisions,
    preview: previewDecisionsMerge(existing, materialized),
  };
}

export function removeDecisionById(
  existing: Decision[],
  id: string,
): Decision[] {
  return existing.filter((row) => row.id !== id);
}
