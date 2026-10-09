import "server-only";

import { randomBytes } from "node:crypto";
import {
  APPROVAL_CATEGORIES,
  APPROVAL_STATUSES,
  isApprovalId,
  type Approval,
  type ApprovalCategory,
  type ApprovalDecision,
  type ApprovalDecider,
  type ApprovalDraft,
  type ApprovalListFilter,
  type ApprovalStatus,
} from "@/lib/approvals";
import { sqlQuery } from "@/lib/pg/client";

const COLUMNS = `id, created_at, requested_by_agent, title, detail, category, node,
  status, decided_by, decided_at, decision_note, idempotency_key`;

type ApprovalRow = {
  id: string;
  created_at: string | Date;
  requested_by_agent: string;
  title: string;
  detail: string;
  category: string;
  node: string | null;
  status: string;
  decided_by: string | null;
  decided_at: string | Date | null;
  decision_note: string | null;
  idempotency_key: string;
};

function iso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function asCategory(value: string): ApprovalCategory {
  if (APPROVAL_CATEGORIES.includes(value as ApprovalCategory)) return value as ApprovalCategory;
  throw new Error("Approval category is not valid.");
}

function asStatus(value: string): ApprovalStatus {
  if (APPROVAL_STATUSES.includes(value as ApprovalStatus)) return value as ApprovalStatus;
  throw new Error("Approval status is not valid.");
}

function asDecider(value: string | null): ApprovalDecider | null {
  if (value == null) return null;
  if (value === "owner" || value === "operator") return value;
  throw new Error("Approval decider is not valid.");
}

function mapApproval(row: ApprovalRow): Approval {
  return {
    id: row.id,
    createdAt: iso(row.created_at),
    requestedByAgent: row.requested_by_agent,
    title: row.title,
    detail: row.detail,
    category: asCategory(row.category),
    node: row.node,
    status: asStatus(row.status),
    decidedBy: asDecider(row.decided_by),
    decidedAt: row.decided_at == null ? null : iso(row.decided_at),
    decisionNote: row.decision_note,
    idempotencyKey: row.idempotency_key,
  };
}

function newApprovalId(): string {
  return `appr_${randomBytes(12).toString("base64url")}`;
}

/**
 * Insert a pending request. The same idempotency key returns the original row
 * and does not change it.
 */
export async function insertApproval(
  draft: ApprovalDraft,
): Promise<{ approval: Approval; replay: boolean }> {
  const inserted = await sqlQuery<ApprovalRow>(
    `INSERT INTO approvals (
       id, requested_by_agent, title, detail, category, node, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      newApprovalId(),
      draft.requestedByAgent,
      draft.title,
      draft.detail,
      draft.category,
      draft.node,
      draft.idempotencyKey,
    ],
  );
  const created = inserted[0];
  if (created) return { approval: mapApproval(created), replay: false };
  const existing = await sqlQuery<ApprovalRow>(
    `SELECT ${COLUMNS} FROM approvals WHERE idempotency_key = $1`,
    [draft.idempotencyKey],
  );
  const found = existing[0];
  if (!found) throw new Error("Approval insert did not return a row.");
  return { approval: mapApproval(found), replay: true };
}

export async function listApprovals(filter: ApprovalListFilter): Promise<Approval[]> {
  if (filter === "pending") {
    const rows = await sqlQuery<ApprovalRow>(
      `SELECT ${COLUMNS} FROM approvals WHERE status = 'pending' ORDER BY created_at ASC`,
    );
    return rows.map(mapApproval);
  }
  if (filter === "done") {
    const rows = await sqlQuery<ApprovalRow>(
      `SELECT ${COLUMNS} FROM approvals WHERE status <> 'pending' ORDER BY decided_at DESC, created_at DESC`,
    );
    return rows.map(mapApproval);
  }
  if (filter === "all") {
    const rows = await sqlQuery<ApprovalRow>(
      `SELECT ${COLUMNS} FROM approvals ORDER BY created_at DESC`,
    );
    return rows.map(mapApproval);
  }
  const rows = await sqlQuery<ApprovalRow>(
    `SELECT ${COLUMNS} FROM approvals WHERE status = $1 ORDER BY created_at DESC`,
    [filter],
  );
  return rows.map(mapApproval);
}

export async function loadApprovalBoard(): Promise<{ pending: Approval[]; done: Approval[] }> {
  const [pending, done] = await Promise.all([listApprovals("pending"), listApprovals("done")]);
  return { pending, done };
}

export async function countPendingApprovals(): Promise<number> {
  const rows = await sqlQuery<{ n: number | string }>(
    `SELECT count(*)::int AS n FROM approvals WHERE status = 'pending'`,
  );
  const count = Number(rows[0]?.n ?? 0);
  return Number.isFinite(count) ? count : 0;
}

/**
 * Record approved or declined. The writer is the owner session.
 * `decided_by` can store operator later. This deploy only signs in the owner,
 * and a live operator session is rejected before this runs.
 * A row that is not pending is left unchanged.
 */
export async function decideApproval(
  id: string,
  decision: ApprovalDecision,
  note: string | null,
): Promise<
  { ok: true; approval: Approval } | { ok: false; status: 404 | 409; error: string }
> {
  if (!isApprovalId(id)) {
    return { ok: false, status: 404, error: "That request was not found." };
  }
  const rows = await sqlQuery<ApprovalRow>(
    `UPDATE approvals
     SET status = $2, decided_by = 'owner', decided_at = now(), decision_note = $3
     WHERE id = $1 AND status = 'pending'
     RETURNING ${COLUMNS}`,
    [id, decision, note],
  );
  const updated = rows[0];
  if (updated) return { ok: true, approval: mapApproval(updated) };
  const existing = await sqlQuery<{ id: string }>(`SELECT id FROM approvals WHERE id = $1`, [id]);
  if (!existing[0]) return { ok: false, status: 404, error: "That request was not found." };
  return { ok: false, status: 409, error: "That request is already decided." };
}
