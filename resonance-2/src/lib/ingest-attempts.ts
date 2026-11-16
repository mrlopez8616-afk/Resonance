import "server-only";

import { postgresFailureReason, sqlQuery } from "@/lib/pg/client";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

/** Health Auto Export posts here. The log stores this path, not the token. */
export const HEALTH_AUTO_EXPORT_INGEST_ROUTE = "/api/ingest/health-auto-export" as const;

/** Shortcuts and the nightly phone post. The log stores this path, not the token. */
export const FITNESS_INGEST_ROUTE = "/api/fitness/ingest" as const;

const ROUTES = new Set<string>([HEALTH_AUTO_EXPORT_INGEST_ROUTE, FITNESS_INGEST_ROUTE]);

/** Short labels only. The token, the header value, and the body never go in this column. */
export type IngestAttemptReason =
  | "missing header"
  | "bad token"
  | "no token configured"
  | "bad body"
  | "body too large"
  | "storage unavailable"
  | "token lookup failed"
  | "write failed"
  | "ok";

const REJECT_REASONS = new Set<IngestAttemptReason>([
  "missing header",
  "bad token",
  "no token configured",
  "bad body",
  "body too large",
  "storage unavailable",
  "token lookup failed",
  "write failed",
]);

export type IngestAttemptDraft = {
  route: string;
  statusCode: number;
  authOk: boolean;
  reason: IngestAttemptReason;
  contentLength: number | null;
  rowsUpserted: number | null;
  /** JSON array of header names and flags on an auth failure. Null until then. Values are not stored. */
  authHeaders: string | null;
};

/** One rejected attempt. `auth_headers` is names only. */
export type IngestRejectRow = {
  received_at: string;
  status_code: number;
  reason: string | null;
  user_agent: string | null;
  content_length: number | null;
  auth_headers: string[] | null;
};

export type IngestRouteSummary = {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastRejectAt: string | null;
  lastRejectStatus: number | null;
  lastRejectReason: string | null;
  rejects24h: number;
  attempts24h: number;
  recentRejects: IngestRejectRow[];
};

export type IngestHealth = {
  [HEALTH_AUTO_EXPORT_INGEST_ROUTE]: IngestRouteSummary & { tokenUpdatedAt: string | null };
  [FITNESS_INGEST_ROUTE]: IngestRouteSummary;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const USER_AGENT_LIMIT = 200;
const REASON_LIMIT = 80;
const INT_MAX = 2_147_483_647;
const HEADER_NAME = /^[a-z0-9-]{1,40}$/;
const HEADER_NAME_CAP = 40;
const AUTH_HEADER_TEXT_CAP = 4096;
const CANONICAL_HOST = "resonance3.vercel.app";
const QUERY_FLAG_NAMES = ["token", "key", "api_key", "auth", "access_token"] as const;
const STORED_FLAGS = new Set<string>([
  "query:token",
  "query:key",
  "query:api_key",
  "query:auth",
  "query:access_token",
  "host:other",
]);

function failureText(error: unknown): string {
  const reason = isStorageUnavailable(error) ? error.reason : postgresFailureReason(error);
  return reason.slice(0, 200);
}

function reportReadFailure(label: string, error: unknown): void {
  const reason = failureText(error);
  if (reason === "DATABASE_URL is not set.") return;
  console.error(label, reason);
}

export function beginIngestAttempt(route: string, request: Request): IngestAttemptDraft {
  return {
    route,
    statusCode: 500,
    authOk: false,
    reason: "write failed",
    contentLength: declaredContentLength(request),
    rowsUpserted: null,
    authHeaders: null,
  };
}

/**
 * Header names on an auth failure, plus query and host flags.
 * Names are lowercased, unique, and capped at 40. A name outside letters,
 * digits, and hyphens is dropped. Header values are not copied into the list.
 * The host compare reads the host header only to choose the host:other flag.
 * A `query:<name>` flag is added for token, key, api_key, auth, or access_token.
 * `host:other` is added when the seen host is not resonance3.vercel.app.
 * The flag strings are not counted toward the 40.
 */
export function rejectedAuthHeaderNames(request: Request): string[] {
  const found = new Set<string>();
  for (const key of request.headers.keys()) {
    const name = key.trim().toLowerCase();
    if (HEADER_NAME.test(name)) found.add(name);
  }
  const names = [...found].sort().slice(0, HEADER_NAME_CAP);
  for (const flag of queryFlags(request.url)) names.push(flag);
  if (hostIsOther(request)) names.push("host:other");
  return names;
}

/** Auth failure only. Stores the name list. Values are not stored. */
export function noteRejectedAuthHeaders(draft: IngestAttemptDraft, request: Request): void {
  draft.authHeaders = JSON.stringify(rejectedAuthHeaderNames(request));
}

function queryFlags(url: string): string[] {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return [];
  }
  const present = new Set<string>();
  for (const key of params.keys()) present.add(key.trim().toLowerCase());
  const flags: string[] = [];
  for (const name of QUERY_FLAG_NAMES) {
    if (present.has(name)) flags.push(`query:${name}`);
  }
  return flags;
}

function hostIsOther(request: Request): boolean {
  return seenHostname(request) !== CANONICAL_HOST;
}

function seenHostname(request: Request): string {
  const forwarded = hostnameFromHeader(request.headers.get("x-forwarded-host"));
  if (forwarded) return forwarded;
  const host = hostnameFromHeader(request.headers.get("host"));
  if (host) return host;
  try {
    return new URL(request.url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

function hostnameFromHeader(value: string | null): string {
  const first = value?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!first) return "";
  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    return end > 1 ? first.slice(1, end) : "";
  }
  return first.replace(/:\d+$/, "").replace(/\.$/, "");
}

export function markIngestAttempt(
  draft: IngestAttemptDraft,
  statusCode: number,
  authOk: boolean,
  reason: IngestAttemptReason,
  rowsUpserted: number | null = null,
): void {
  draft.statusCode = statusCode;
  draft.authOk = authOk;
  draft.reason = reason;
  draft.rowsUpserted = rowsUpserted;
}

/** Fills content_length from the body when the request did not declare one. */
export function noteIngestBodyLength(draft: IngestAttemptDraft, raw: string): void {
  if (draft.contentLength != null) return;
  const bytes = Buffer.byteLength(raw);
  if (bytes <= INT_MAX) draft.contentLength = bytes;
}

export function declaredContentLength(request: Request): number | null {
  const header = request.headers.get("content-length");
  if (!header || !/^\d{1,10}$/.test(header.trim())) return null;
  const value = Number(header.trim());
  if (!Number.isInteger(value) || value > INT_MAX) return null;
  return value;
}

function userAgent(request: Request): string | null {
  const value = request.headers.get("user-agent")?.trim() ?? "";
  if (!value) return null;
  return value.slice(0, USER_AGENT_LIMIT);
}

function wholeOrNull(value: number | null): number | null {
  if (value == null || !Number.isInteger(value) || value < 0 || value > INT_MAX) return null;
  return value;
}

/**
 * One row per request. A failure here is logged and swallowed so the ingest
 * response stays the one the route already chose.
 * Rows older than 30 days are deleted after the insert. The delete is bounded
 * by the received_at index and does not store anything from the request.
 */
export async function recordIngestAttempt(draft: IngestAttemptDraft, request: Request): Promise<void> {
  try {
    if (!ROUTES.has(draft.route)) {
      console.error("ingest attempt log failed", "unknown route");
      return;
    }
    const reason = draft.reason.trim().slice(0, REASON_LIMIT);
    if (!reason || !Number.isInteger(draft.statusCode)) {
      console.error("ingest attempt log failed", "incomplete attempt");
      return;
    }
    await sqlQuery(
      `INSERT INTO ingest_attempts (
         route, status_code, auth_ok, reason, user_agent, content_length, rows_upserted, auth_headers
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        draft.route,
        draft.statusCode,
        draft.authOk,
        reason,
        userAgent(request),
        wholeOrNull(draft.contentLength),
        wholeOrNull(draft.rowsUpserted),
        draft.authHeaders,
      ],
    );
  } catch (error) {
    console.error("ingest attempt log failed", failureText(error));
    return;
  }
  try {
    await sqlQuery(
      `DELETE FROM ingest_attempts WHERE received_at < now() - interval '30 days'`,
    );
  } catch (error) {
    console.error("ingest attempt prune failed", failureText(error));
  }
}

function emptyRoute(): IngestRouteSummary {
  return {
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastRejectAt: null,
    lastRejectStatus: null,
    lastRejectReason: null,
    rejects24h: 0,
    attempts24h: 0,
    recentRejects: [],
  };
}

export function emptyIngestHealth(): IngestHealth {
  return {
    [HEALTH_AUTO_EXPORT_INGEST_ROUTE]: { ...emptyRoute(), tokenUpdatedAt: null },
    [FITNESS_INGEST_ROUTE]: emptyRoute(),
  };
}

function asTime(value: unknown): number | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asIso(value: unknown): string | null {
  const time = asTime(value);
  return time === null ? null : new Date(time).toISOString();
}

function asId(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asStatus(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 100 || number > 599) return null;
  return number;
}

function asRejectReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return REJECT_REASONS.has(reason as IngestAttemptReason) ? reason : null;
}

type AttemptRow = {
  route: string;
  received_at: unknown;
  status_code: unknown;
  reason: unknown;
  user_agent: unknown;
  content_length: unknown;
  auth_headers: unknown;
  id: unknown;
};

function asUserAgent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, USER_AGENT_LIMIT);
}

function asContentLength(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > INT_MAX) return null;
  return number;
}

/** Names and the known flags only. Anything else, including a raw value, is dropped. */
function asAuthHeaders(value: unknown): string[] | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > AUTH_HEADER_TEXT_CAP) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const names: string[] = [];
  const seen = new Set<string>();
  let headerCount = 0;
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const name = item.trim().toLowerCase();
    if (!name || seen.has(name)) continue;
    const flag = STORED_FLAGS.has(name);
    const header = HEADER_NAME.test(name);
    if (!flag && !header) continue;
    if (header && headerCount >= HEADER_NAME_CAP) continue;
    seen.add(name);
    if (header) headerCount += 1;
    names.push(name);
  }
  return names;
}

function later(current: { at: number; id: number } | null, at: number, id: number): boolean {
  if (!current) return true;
  if (at > current.at) return true;
  return at === current.at && id > current.id;
}

type RankedReject = IngestRejectRow & { at: number; id: number };

function fillSummaries(summary: IngestHealth, rows: readonly AttemptRow[], now: number): void {
  const health = summary[HEALTH_AUTO_EXPORT_INGEST_ROUTE];
  const fitness = summary[FITNESS_INGEST_ROUTE];
  const latest = new Map<string, { at: number; id: number }>();
  const success = new Map<string, { at: number; id: number }>();
  const reject = new Map<string, { at: number; id: number; status: number; reason: string | null }>();
  const recent = new Map<string, RankedReject[]>();
  for (const row of rows) {
    const bucket = row.route === HEALTH_AUTO_EXPORT_INGEST_ROUTE ? health : row.route === FITNESS_INGEST_ROUTE ? fitness : null;
    if (!bucket) continue;
    const at = asTime(row.received_at);
    const status = asStatus(row.status_code);
    if (at === null || status === null) continue;
    const id = asId(row.id);
    if (later(latest.get(row.route) ?? null, at, id)) {
      latest.set(row.route, { at, id });
      bucket.lastAttemptAt = new Date(at).toISOString();
    }
    if (at >= now - DAY_MS) {
      bucket.attempts24h += 1;
      if (status >= 400) bucket.rejects24h += 1;
    }
    if (status < 400) {
      if (later(success.get(row.route) ?? null, at, id)) {
        success.set(row.route, { at, id });
        bucket.lastSuccessAt = new Date(at).toISOString();
      }
    } else {
      const reason = asRejectReason(row.reason);
      if (later(reject.get(row.route) ?? null, at, id)) {
        reject.set(row.route, { at, id, status, reason });
        bucket.lastRejectAt = new Date(at).toISOString();
        bucket.lastRejectStatus = status;
        bucket.lastRejectReason = reason;
      }
      const list = recent.get(row.route) ?? [];
      list.push({
        at,
        id,
        received_at: new Date(at).toISOString(),
        status_code: status,
        reason,
        user_agent: asUserAgent(row.user_agent),
        content_length: asContentLength(row.content_length),
        auth_headers: asAuthHeaders(row.auth_headers),
      });
      recent.set(row.route, list);
    }
  }
  for (const route of [HEALTH_AUTO_EXPORT_INGEST_ROUTE, FITNESS_INGEST_ROUTE]) {
    const list = recent.get(route) ?? [];
    list.sort((a, b) => b.at - a.at || b.id - a.id);
    summary[route].recentRejects = list.slice(0, 5).map((row) => ({
      received_at: row.received_at,
      status_code: row.status_code,
      reason: row.reason,
      user_agent: row.user_agent,
      content_length: row.content_length,
      auth_headers: row.auth_headers,
    }));
  }
}

/**
 * Counts, timestamps, and the latest five reject rows for the private health probe.
 * `tokenUpdatedAt` is the digest row's `updated_at`. The digest itself is not selected.
 * `recentRejects` carries header names only. A header value and the body are not selected.
 * A missing table or a failed read leaves the counts at zero and the timestamps null.
 */
export async function loadIngestHealth(now = Date.now()): Promise<IngestHealth> {
  const summary = emptyIngestHealth();
  try {
    const rows = await sqlQuery<AttemptRow>(
      `SELECT route, received_at, status_code, reason, user_agent, content_length, auth_headers, id
       FROM ingest_attempts
       WHERE route IN ($1, $2)`,
      [HEALTH_AUTO_EXPORT_INGEST_ROUTE, FITNESS_INGEST_ROUTE],
    );
    fillSummaries(summary, rows, now);
  } catch (error) {
    reportReadFailure("ingest attempt summary failed", error);
  }
  try {
    const rows = await sqlQuery<{ updated_at: unknown }>(
      `SELECT updated_at FROM health_auto_export_tokens WHERE id = 1`,
    );
    summary[HEALTH_AUTO_EXPORT_INGEST_ROUTE].tokenUpdatedAt = asIso(rows[0]?.updated_at);
  } catch (error) {
    reportReadFailure("ingest token timestamp failed", error);
  }
  return summary;
}
