import type { Decision, DecisionStatus } from "./types";

export class DecisionsImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisionsImportError";
  }
}

export interface DecisionsImport {
  asOf: string | null;
  source: string | null;
  decisions: Decision[];
}

export type DecisionsMergeAction = "add" | "update" | "keep";

export interface DecisionsMergePreviewRow {
  id: string;
  action: DecisionsMergeAction;
  question: string;
  status: DecisionStatus;
}

export interface DecisionsMergePreview {
  added: number;
  updated: number;
  unchanged: number;
  untouchedLocal: number;
  rows: DecisionsMergePreviewRow[];
}

export const DECISIONS_IMPORT_HELP = `{
  "asOf": "2026-09-11T23:30:00Z",
  "source": "resonance-hub",
  "decisions": [
    {
      "id": "D-2026-09-11-01",
      "date": "2026-09-11",
      "question": "What has to be decided?",
      "proposal": "The specific action proposed",
      "options": "A · B · C",
      "decision": "The founder call",
      "rationale": "Why this call",
      "authorizedBy": "Andres López",
      "outcome": "What actually happened — queued ≠ filled",
      "evidence": "Receipt: order ids, quotes, links, screenshot refs",
      "reviewTrigger": "What would reopen it",
      "status": "decided",
      "fingerprint": null
    }
  ]
}`;

export const LOCKED_DECISIONS_2026_09_11: Decision[] = [
  {
    id: "D-2026-09-11-01",
    date: "2026-09-11",
    question:
      "Flatten Robinhood physical learning lots, or keep the Monday market sells?",
    proposal: "Flatten RH physical learning lots tonight.",
    options:
      "Flatten all RH physical lots tonight · KEEP Monday market sells on CEG/ETN/PWR/GEV/HUBB/VRT · Flatten some, keep others",
    status: "decided",
    decision:
      "KEEP Monday market sells on CEG/ETN/PWR/GEV/HUBB/VRT. Do not flatten the physical learning lots tonight.",
    rationale:
      "Learning lots stay on the board as funded Robinhood physicals. Monday open sells are the written exit. Flattening tonight would erase the live experiment before the planned market action.",
    authorizedBy: "Andres López",
    outcome:
      "Call locked. Monday market sells are queued — not filled. Queued ≠ filled.",
    evidence:
      "Robinhood holdings snapshot of CEG/ETN/PWR/GEV/HUBB/VRT learning lots; Monday sell instructions already locked for market open.",
    reviewTrigger:
      "After Monday session — confirm fills, leftover quantity, and whether any ticker should remain a funded node.",
    fingerprint: null,
    createdAt: "2026-09-11T22:10:00.000Z",
  },
  {
    id: "D-2026-09-11-02",
    date: "2026-09-11",
    question: "Lock the Phase Zero Agentic charter for Robinhood Ops?",
    proposal: "Lock the Phase Zero Agentic charter (constrained agent).",
    options:
      "Lock charter (constrained agent) · Delay · Unlock full autonomy now",
    status: "superseded",
    decision:
      "Lock the Phase Zero Agentic charter. Agentic may operate only inside the written charter. Later superseded by D-2026-09-11-04 for trading autonomy — keep this row as the historical lock.",
    rationale:
      "Phase Zero stays human-governed. A written charter is the record before any agentic trading. This lock is the original call; D-2026-09-11-04 is the later autonomy unlock.",
    authorizedBy: "Andres López",
    outcome:
      "Charter was locked, then superseded by D-2026-09-11-04 for trading autonomy. Kept as historical record. No trades executed from this row.",
    evidence:
      "Phase Zero human-governed scope; Resonance web app does not execute trades; hub/chat charter text.",
    reviewTrigger:
      "Superseded by D-2026-09-11-04. Re-open only if the charter itself is rewritten.",
    fingerprint: null,
    createdAt: "2026-09-11T22:40:00.000Z",
  },
  {
    id: "D-2026-09-11-03",
    date: "2026-09-11",
    question:
      "Approve Agentic buys of PWR $35 and VRT $17 at Monday open?",
    proposal: "Agentic PWR $35 + VRT $17 at Monday open.",
    options:
      "Approve both · Approve PWR only · Approve VRT only · Reject · Delay",
    status: "decided",
    decision: "Approve Agentic PWR $35 + VRT $17 Monday open.",
    rationale:
      "Sized, named, Monday-open entries. Does not tap Main or Xaman treasury principal. Sits on top of D-2026-09-11-01 (learning lots / Monday sells stay).",
    authorizedBy: "Andres López",
    outcome:
      "PWR $35 and VRT $17 are QUEUED for Monday open — not filled. Queued ≠ filled.",
    evidence:
      "Written size ($35 PWR, $17 VRT); Agentic Robinhood Ops only; Monday open timing. No fill recorded.",
    reviewTrigger:
      "After Monday open — confirm fills, residual cash, and whether either ticker needs a new decision.",
    fingerprint: null,
    createdAt: "2026-09-11T23:05:00.000Z",
  },
  {
    id: "D-2026-09-11-04",
    date: "2026-09-11",
    question: "Unlock full Agentic autonomy for Robinhood Ops?",
    proposal: "Unlock FULL Agentic autonomy for Robinhood Ops (Agentic only).",
    options:
      "Unlock full Agentic autonomy (Agentic only) · Keep D-2026-09-11-02 charter · Unlock including Main/Xaman (rejected)",
    status: "decided",
    decision:
      "Unlock FULL Agentic autonomy for Robinhood Ops. Agentic account only. Main + Xaman treasury principal remain off-limits.",
    rationale:
      "Trading autonomy is granted to Agentic only. This supersedes D-2026-09-11-02 for trading autonomy. It does not authorize spending Xaman treasury principal or the founder Main account. Agentic may trade ETN and GEV under this unlock.",
    authorizedBy: "Andres López",
    outcome:
      "Autonomy unlocked for Agentic Robinhood Ops only. Agentic autonomy trades ETN/GEV under this row. PWR/VRT (D-03) and ETN/GEV (D-04) are QUEUED for Monday open — not filled. No Main or Xaman principal movement. No on-chain write.",
    evidence:
      "Founder lock tonight; Phase Zero Web2 record only — no wallet signing, no on-chain write. ETN/GEV autonomy tickets sit on the Agentic sleeve, not Main.",
    reviewTrigger:
      "Any proposed touch of Main or Xaman treasury principal; material Agentic loss; or a new written charter.",
    fingerprint: null,
    createdAt: "2026-09-11T23:25:00.000Z",
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseDecisionStatus(value: unknown): DecisionStatus {
  if (value === "decided" || value === "superseded" || value === "pending") {
    return value;
  }
  return "pending";
}

export function normalizeDecision(
  raw: unknown,
  index: number,
  fallbackCreatedAt = "",
): Decision {
  if (!isRecord(raw)) {
    throw new DecisionsImportError(`decisions[${index}] must be an object.`);
  }
  const id =
    asTrimmedString(raw.id) ??
    asTrimmedString(raw.decisionId) ??
    asTrimmedString(raw.recordId);
  if (!id) {
    throw new DecisionsImportError(`decisions[${index}].id is required.`);
  }
  const question = asString(raw.question, "").trim();
  if (!question) {
    throw new DecisionsImportError(`decisions[${index}].question is required.`);
  }
  return {
    id,
    question,
    proposal: asString(raw.proposal, asString(raw.proposed, "")).trim(),
    options: asString(raw.options, "").trim(),
    status: parseDecisionStatus(raw.status),
    decision: asString(
      raw.decision,
      asString(raw.founderDecision, asString(raw.founder_decision, "")),
    ).trim(),
    rationale: asString(raw.rationale, asString(raw.why, "")).trim(),
    authorizedBy: asString(
      raw.authorizedBy,
      asString(raw.authorized_by, asString(raw.authorizer, "")),
    ).trim(),
    outcome: asString(raw.outcome, "").trim(),
    evidence: asString(raw.evidence, asString(raw.receipt, "")).trim(),
    reviewTrigger: asString(
      raw.reviewTrigger,
      asString(raw.review_trigger, ""),
    ).trim(),
    fingerprint: parseFingerprint(raw.fingerprint),
    date: asString(raw.date, "").trim(),
    createdAt: asString(raw.createdAt, fallbackCreatedAt),
  };
}

/** Storage migrate: missing fields become empty strings; IDs may be generated. */
export function coerceStoredDecision(
  raw: unknown,
  index: number,
): Decision | null {
  if (!isRecord(raw)) return null;
  const id = asTrimmedString(raw.id) ?? `dec-${index}`;
  return {
    id,
    question: asString(raw.question, ""),
    proposal: asString(raw.proposal, asString(raw.proposed, "")),
    options: asString(raw.options, ""),
    status: parseDecisionStatus(raw.status),
    decision: asString(raw.decision, ""),
    rationale: asString(raw.rationale, asString(raw.why, "")),
    authorizedBy: asString(
      raw.authorizedBy,
      asString(raw.authorized_by, asString(raw.authorizer, "")),
    ),
    outcome: asString(raw.outcome, ""),
    evidence: asString(raw.evidence, asString(raw.receipt, "")),
    reviewTrigger: asString(
      raw.reviewTrigger,
      asString(raw.review_trigger, ""),
    ),
    fingerprint: parseFingerprint(raw.fingerprint),
    date: asString(raw.date, ""),
    createdAt: asString(raw.createdAt, ""),
  };
}

export function parseDecisionsImport(text: string): DecisionsImport {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new DecisionsImportError("Paste a decisions JSON first.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new DecisionsImportError("JSON is not valid. Check quotes and commas.");
  }
  return normalizeDecisionsImport(parsed);
}

export function normalizeDecisionsImport(raw: unknown): DecisionsImport {
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new DecisionsImportError("decisions array is empty.");
    }
    return {
      asOf: null,
      source: null,
      decisions: raw.map((item, index) => normalizeDecision(item, index)),
    };
  }
  if (!isRecord(raw)) {
    throw new DecisionsImportError(
      "Expected a decisions array or an object with a decisions array.",
    );
  }
  if (Array.isArray(raw.holdings) && !Array.isArray(raw.decisions)) {
    throw new DecisionsImportError(
      "This looks like a holdings snapshot. Use Settings → Import holdings snapshot.",
    );
  }
  if (!Array.isArray(raw.decisions)) {
    throw new DecisionsImportError("JSON must include a decisions array.");
  }
  if (raw.decisions.length === 0) {
    throw new DecisionsImportError("decisions array is empty.");
  }
  const asOf = asTrimmedString(raw.asOf);
  if (asOf && Number.isNaN(new Date(asOf).getTime())) {
    throw new DecisionsImportError("asOf must be a parseable ISO date.");
  }
  return {
    asOf,
    source: asTrimmedString(raw.source),
    decisions: raw.decisions.map((item, index) =>
      normalizeDecision(item, index, asOf ?? ""),
    ),
  };
}

export function parseFingerprint(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function emptyDecisionFields(): Pick<
  Decision,
  | "proposal"
  | "rationale"
  | "authorizedBy"
  | "outcome"
  | "evidence"
  | "reviewTrigger"
  | "fingerprint"
> {
  return {
    proposal: "",
    rationale: "",
    authorizedBy: "",
    outcome: "",
    evidence: "",
    reviewTrigger: "",
    fingerprint: null,
  };
}

export function decisionContentEqual(a: Decision, b: Decision): boolean {
  return (
    a.question === b.question &&
    a.proposal === b.proposal &&
    a.options === b.options &&
    a.status === b.status &&
    a.decision === b.decision &&
    a.rationale === b.rationale &&
    a.authorizedBy === b.authorizedBy &&
    a.outcome === b.outcome &&
    a.evidence === b.evidence &&
    a.reviewTrigger === b.reviewTrigger &&
    a.fingerprint === b.fingerprint &&
    a.date === b.date
  );
}

export function mergeDecisionsById(
  existing: Decision[],
  incoming: Decision[],
): Decision[] {
  const byId = new Map<string, Decision>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) {
    const prev = byId.get(item.id);
    if (!prev) {
      byId.set(item.id, {
        ...item,
        createdAt: item.createdAt || new Date().toISOString(),
      });
      continue;
    }
    byId.set(item.id, {
      ...prev,
      ...item,
      createdAt: prev.createdAt || item.createdAt || new Date().toISOString(),
    });
  }
  return Array.from(byId.values());
}

export function previewDecisionsMerge(
  existing: Decision[],
  incoming: Decision[],
): DecisionsMergePreview {
  const byId = new Map(existing.map((item) => [item.id, item]));
  const incomingIds = new Set(incoming.map((item) => item.id));
  const rows: DecisionsMergePreviewRow[] = incoming.map((item) => {
    const prev = byId.get(item.id);
    if (!prev) {
      return {
        id: item.id,
        action: "add",
        question: item.question,
        status: item.status,
      };
    }
    return {
      id: item.id,
      action: decisionContentEqual(prev, item) ? "keep" : "update",
      question: item.question,
      status: item.status,
    };
  });
  return {
    added: rows.filter((row) => row.action === "add").length,
    updated: rows.filter((row) => row.action === "update").length,
    unchanged: rows.filter((row) => row.action === "keep").length,
    untouchedLocal: existing.filter((item) => !incomingIds.has(item.id)).length,
    rows,
  };
}

export function exportDecisionsJson(decisions: Decision[]): string {
  return JSON.stringify(
    {
      asOf: new Date().toISOString(),
      source: "resonance-decisions",
      decisions,
    },
    null,
    2,
  );
}

export function sortDecisions(decisions: Decision[]): Decision[] {
  return [...decisions].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.localeCompare(a.createdAt) ||
      b.id.localeCompare(a.id),
  );
}

export function nextDecisionId(existing: Decision[], date: string): string {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "undated";
  const prefix = `D-${safeDate}-`;
  let max = 0;
  for (const item of existing) {
    if (!item.id.startsWith(prefix)) continue;
    const suffix = item.id.slice(prefix.length);
    const parsed = Number(suffix);
    if (Number.isInteger(parsed) && parsed > max) max = parsed;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

export function isLockedDecisionId(id: string): boolean {
  return /^D-\d{4}-\d{2}-\d{2}-\d{2}$/.test(id);
}
