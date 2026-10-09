/**
 * Approval queue. A request is plain text. A decision records approved or
 * declined. Nothing in this module sends a trade, a transfer, or any other action.
 */

export const APPROVAL_CATEGORIES = ["trade", "transfer", "build", "other"] as const;
export type ApprovalCategory = (typeof APPROVAL_CATEGORIES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "declined", "cancelled"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export type ApprovalDecider = "owner" | "operator";
export type ApprovalDecision = "approved" | "declined";

export const APPROVAL_CAPS = {
  title: 160,
  detail: 4000,
  agent: 80,
  node: 40,
  idempotencyKey: 160,
  note: 500,
} as const;

const APPROVAL_ID = /^appr_[A-Za-z0-9_-]{16}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$/;
const AGENT_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{1,79}$/;
const NODE_SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

export const SECRET_OR_ACCOUNT_ERROR =
  "Remove anything that looks like a secret or an account number.";

export type Approval = {
  id: string;
  createdAt: string;
  requestedByAgent: string;
  title: string;
  detail: string;
  category: ApprovalCategory;
  node: string | null;
  status: ApprovalStatus;
  decidedBy: ApprovalDecider | null;
  decidedAt: string | null;
  decisionNote: string | null;
  idempotencyKey: string;
};

export type ApprovalJson = {
  id: string;
  created_at: string;
  requested_by_agent: string;
  title: string;
  detail: string;
  category: ApprovalCategory;
  node: string | null;
  status: ApprovalStatus;
  decided_by: ApprovalDecider | null;
  decided_at: string | null;
  decision_note: string | null;
  idempotency_key: string;
};

export type ApprovalDraft = {
  idempotencyKey: string;
  requestedByAgent: string;
  title: string;
  detail: string;
  category: ApprovalCategory;
  node: string | null;
};

export type DecisionDraft = {
  decision: ApprovalDecision;
  note: string | null;
};

export type ApprovalParse =
  | { ok: true; draft: ApprovalDraft }
  | { ok: false; status: 400; error: string };

export type DecisionParse =
  | { ok: true; draft: DecisionDraft }
  | { ok: false; status: 400; error: string };

const SECRET_VALUE = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{8,}/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{16,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,
  /\bAIza[0-9A-Za-z\-_]{20,}/,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /(?:password|passwd|secret|api[ _-]?key|private[ _-]?key|access[ _-]?token|refresh[ _-]?token|totp|mnemonic|seed phrase)\s*[:=]\s*\S{4,}/i,
  /\bbearer\s+[A-Za-z0-9._-]{12,}/i,
  /\b[a-fA-F0-9]{32,}\b/,
];

function canonicalKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function keyLooksSecret(key: string): boolean {
  const canon = canonicalKey(key);
  if (
    /password|passwd|secret|privatekey|apikey|accesstoken|refreshtoken|accountnumber|accountno|routingnumber|mnemonic|seedphrase|credential|authorization/.test(
      canon,
    )
  ) {
    return true;
  }
  return (
    canon === "routing" ||
    canon === "seed" ||
    canon === "totp" ||
    canon === "totpsecret" ||
    canon === "ssn" ||
    canon === "cvv" ||
    canon === "pin" ||
    canon === "mnemonic"
  );
}

/** 12 or more digits, or a labeled account, routing, or card number of 8 or more. */
export function hasFullAccountNumber(value: string): boolean {
  const runs = value.match(/\d(?:[ -]?\d){11,}/g);
  if (runs?.some((run) => run.replace(/\D/g, "").length >= 12)) return true;
  return /\b(?:account|acct|iban|routing|card)\b(?:\s*(?:number|no\.?|#))?\s*[:#-]?\s*\d(?:[ -]?\d){7,}/i.test(
    value,
  );
}

export function textLooksSecret(value: string): boolean {
  if (hasFullAccountNumber(value)) return true;
  return SECRET_VALUE.some((pattern) => pattern.test(value));
}

/** Any key or string in the JSON that looks like a secret or a full account number. */
export function payloadLooksSecret(value: unknown): boolean {
  if (typeof value === "string") return textLooksSecret(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(Math.abs(value))).length >= 12;
  }
  if (Array.isArray(value)) return value.some((item) => payloadLooksSecret(item));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) => keyLooksSecret(key) || payloadLooksSecret(child),
  );
}

function fail(error: string): { ok: false; status: 400; error: string } {
  return { ok: false, status: 400, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pick(body: Record<string, unknown>, snake: string, camel: string): unknown {
  const hasSnake = Object.prototype.hasOwnProperty.call(body, snake);
  const hasCamel = Object.prototype.hasOwnProperty.call(body, camel);
  if (hasSnake && hasCamel) return { conflict: true as const };
  if (hasSnake) return body[snake];
  if (hasCamel) return body[camel];
  return undefined;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim();
}

export function isApprovalId(value: string): boolean {
  return APPROVAL_ID.test(value);
}

export function parseApprovalBody(value: unknown): ApprovalParse {
  if (payloadLooksSecret(value)) return fail(SECRET_OR_ACCOUNT_ERROR);
  if (!isRecord(value)) return fail("JSON object is required.");
  for (const key of Object.keys(value)) {
    if (
      key !== "idempotency_key" &&
      key !== "idempotencyKey" &&
      key !== "requested_by_agent" &&
      key !== "requestedByAgent" &&
      key !== "title" &&
      key !== "detail" &&
      key !== "category" &&
      key !== "node"
    ) {
      return fail("Unknown field.");
    }
  }

  const idempotency = pick(value, "idempotency_key", "idempotencyKey");
  const agent = pick(value, "requested_by_agent", "requestedByAgent");
  if (
    (idempotency && typeof idempotency === "object" && "conflict" in idempotency) ||
    (agent && typeof agent === "object" && "conflict" in agent)
  ) {
    return fail("Use one name for each field.");
  }

  const idempotencyKey = asText(idempotency);
  if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return fail("idempotency_key is required.");
  }
  const requestedByAgent = asText(agent);
  if (!requestedByAgent || !AGENT_NAME.test(requestedByAgent)) {
    return fail("requested_by_agent is required.");
  }
  const title = asText(value.title);
  if (!title || title.length > APPROVAL_CAPS.title || /[\r\n]/.test(title)) {
    return fail("title is required.");
  }
  const detailRaw = value.detail === undefined ? "" : value.detail;
  if (typeof detailRaw !== "string" || detailRaw.trim().length > APPROVAL_CAPS.detail) {
    return fail("detail must be plain text.");
  }
  const detail = detailRaw.trim();
  if (!APPROVAL_CATEGORIES.includes(value.category as ApprovalCategory)) {
    return fail("category must be trade, transfer, build, or other.");
  }
  let node: string | null = null;
  if (value.node !== undefined && value.node !== null && value.node !== "") {
    if (typeof value.node !== "string" || !NODE_SLUG.test(value.node.trim())) {
      return fail("node must be a short slug.");
    }
    node = value.node.trim();
  }

  return {
    ok: true,
    draft: {
      idempotencyKey,
      requestedByAgent,
      title,
      detail,
      category: value.category as ApprovalCategory,
      node,
    },
  };
}

export function parseDecisionBody(value: unknown): DecisionParse {
  if (payloadLooksSecret(value)) return fail(SECRET_OR_ACCOUNT_ERROR);
  if (!isRecord(value)) return fail("JSON object is required.");
  for (const key of Object.keys(value)) {
    if (key !== "decision" && key !== "note" && key !== "decision_note") {
      return fail("Unknown field.");
    }
  }
  if (value.decision !== "approved" && value.decision !== "declined") {
    return fail("decision must be approved or declined.");
  }
  const hasNote = Object.prototype.hasOwnProperty.call(value, "note");
  const hasDecisionNote = Object.prototype.hasOwnProperty.call(value, "decision_note");
  if (hasNote && hasDecisionNote && value.note !== value.decision_note) {
    return fail("Use one name for the note.");
  }
  const raw = hasNote ? value.note : hasDecisionNote ? value.decision_note : undefined;
  if (raw === undefined || raw === null) {
    return { ok: true, draft: { decision: value.decision, note: null } };
  }
  if (typeof raw !== "string") return fail("note must be plain text.");
  const note = raw.trim();
  if (note.length > APPROVAL_CAPS.note) return fail("note is too long.");
  return { ok: true, draft: { decision: value.decision, note: note || null } };
}

export function toApprovalJson(approval: Approval): ApprovalJson {
  return {
    id: approval.id,
    created_at: approval.createdAt,
    requested_by_agent: approval.requestedByAgent,
    title: approval.title,
    detail: approval.detail,
    category: approval.category,
    node: approval.node,
    status: approval.status,
    decided_by: approval.decidedBy,
    decided_at: approval.decidedAt,
    decision_note: approval.decisionNote,
    idempotency_key: approval.idempotencyKey,
  };
}

export function categoryLabel(category: ApprovalCategory): string {
  if (category === "trade") return "Trade";
  if (category === "transfer") return "Transfer";
  if (category === "build") return "Build";
  return "Other";
}

export function formatApprovalWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function approvalMeta(approval: Approval): string {
  const parts = [categoryLabel(approval.category)];
  if (approval.node) parts.push(approval.node);
  parts.push(approval.requestedByAgent);
  return parts.join(" · ");
}

export function decisionLine(approval: Approval): string | null {
  if (approval.status === "pending" || !approval.decidedBy) return null;
  const verb =
    approval.status === "approved" ? "Approved" : approval.status === "declined" ? "Declined" : "Cancelled";
  const when = approval.decidedAt ? formatApprovalWhen(approval.decidedAt) : "";
  return when ? `${verb} by ${approval.decidedBy} · ${when}` : `${verb} by ${approval.decidedBy}`;
}

/** Toolbar and phone label. The badge number is separate. */
export function approvalsLabel(count: number | null | undefined): string {
  if (count == null || count <= 0) return "Approvals";
  const shown = count > 99 ? "99+" : String(count);
  return `Approvals, ${shown} pending`;
}

export type ApprovalListFilter = "all" | "pending" | "done" | ApprovalStatus;

export function parseApprovalFilter(value: string | null): ApprovalListFilter | null {
  if (!value) return "all";
  if (value === "all" || value === "pending" || value === "done") return value;
  if (APPROVAL_STATUSES.includes(value as ApprovalStatus)) return value as ApprovalStatus;
  return null;
}
