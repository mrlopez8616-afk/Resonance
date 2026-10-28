import { tileFace, type HomeFace } from "@/lib/home-faces";
import { SHELVED_NODES } from "@/lib/node-visibility";
import { sqlQuery } from "@/lib/pg/client";
import { hasMoneyText, stripMoneyText } from "@/lib/public-mode";
import type { EnvLike } from "@/lib/sync-auth-core";

/**
 * Nightly backup. Postgres and non-secret settings go to a private GitHub
 * branch as one JSON file per day. Blob is read when the store answers.
 * This module does not write Blob objects and does not read env values.
 */

export const BACKUP_CRON_SCHEDULE = "0 8 * * *";
export const BACKUP_RETENTION_DAYS = 30;
export const BACKUP_BRANCH = "backups";
export const REDACTED = "[redacted]";

const IDENT = /^[a-z_][a-z0-9_]*$/;
const SNAPSHOT_PATH = /^snapshots\/(\d{4}-\d{2}-\d{2})\.json$/;
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,80}$/;
const SECRET_PART =
  /password|passwd|secret|token|totp|apikey|privatekey|passphrase|authorization|credential|bearer|cookie|webhook|pinhash|idhash|iphash|sessionsecret|accesstoken|refreshtoken/;

const SECRET_ENV_KEYS = [
  "RESONANCE_BACKUP_GITHUB_TOKEN",
  "CRON_SECRET",
  "RESONANCE_SYNC_SECRET",
  "AUTH_PASSWORD_HASH",
  "AUTH_TOTP_SECRET",
  "AUTH_SESSION_SECRET",
  "DATABASE_URL",
  "BLOB_READ_WRITE_TOKEN",
  "FINANCE_ENC_KEY",
  "GITHUB_TOKEN",
  "FITNESS_INGEST_TOKEN",
] as const;

export type BackupSql = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
};

export type BlobFile = { pathname: string; text: string };

export type BlobBackupRead = {
  status: "copied" | "unavailable" | "empty";
  files: BlobFile[];
  note: string | null;
};

export type BlobIo = {
  list: (prefix: string) => Promise<{ pathname: string }[]>;
  read: (
    pathname: string,
  ) => Promise<{ status: "ok" | "missing" | "unavailable"; text?: string; reason?: string }>;
};

export type GithubBackupFile = { path: string; content: string };

export type GithubBackupStore = {
  listSnapshotPaths(): Promise<string[]>;
  commit(input: {
    message: string;
    writes: readonly GithubBackupFile[];
    deletes: readonly string[];
  }): Promise<{ commitSha: string }>;
};

export type BackupGithubTarget = {
  token: string;
  repo: string;
  owner: string;
  name: string;
  branch: string;
};

export type BackupRunResult = {
  ok: boolean;
  status: "ok" | "error";
  startedAt: string;
  prefix: string;
  tableCounts: Record<string, number>;
  byteSize: number | null;
  objectCount: number | null;
  blobStatus: BlobBackupRead["status"] | null;
  blobNote: string | null;
  error: string | null;
  pruned: number;
};

export type BackupRunView = {
  startedAt: string | null;
  status: "ok" | "error" | null;
  blobStatus: BlobBackupRead["status"] | null;
  tableCount: number | null;
  byteSize: number | null;
  error: string | null;
};

export type BackupDeps = {
  now: Date;
  sql: BackupSql;
  blobs: () => Promise<BlobBackupRead>;
  github: GithubBackupStore;
  target: { repo: string; branch: string };
  secrets: readonly string[];
};

export function backupGithubTarget(env: EnvLike): BackupGithubTarget | null {
  const token = env.RESONANCE_BACKUP_GITHUB_TOKEN?.trim() ?? "";
  const repo = env.RESONANCE_BACKUP_GITHUB_REPO?.trim() ?? "";
  const branch = env.RESONANCE_BACKUP_GITHUB_BRANCH?.trim() || BACKUP_BRANCH;
  if (!token || !REPO_NAME.test(repo) || !BRANCH_NAME.test(branch) || branch.includes("..")) return null;
  const [owner, name] = repo.split("/") as [string, string];
  if (!owner || !name) return null;
  return { token, repo, owner, name, branch };
}

export function secretValues(env: EnvLike): string[] {
  const values: string[] = [];
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key]?.trim() ?? "";
    if (value.length >= 6) values.push(value);
  }
  return values;
}

export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error("refusing unsafe table name");
  return `"${name}"`;
}

export function snapshotPath(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("bad backup day");
  return `snapshots/${day}.json`;
}

export function isSnapshotPath(path: string): boolean {
  return SNAPSHOT_PATH.test(path) && !path.includes("..");
}

/** Keep the newest date files. Anything that is not a snapshot path stays. */
export function backupPathsToPrune(paths: readonly string[], keep = BACKUP_RETENTION_DAYS): string[] {
  const byDay = new Map<string, string>();
  for (const path of paths) {
    const day = SNAPSHOT_PATH.exec(path)?.[1];
    if (!day || path.includes("..")) continue;
    byDay.set(day, path);
  }
  const days = [...byDay.keys()].sort();
  if (days.length <= keep) return [];
  return days.slice(0, days.length - keep).map((day) => byDay.get(day) ?? "");
}

export function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return false;
  if (SECRET_PART.test(normalized)) return true;
  return normalized === "pin";
}

export function scrubSecretText(value: string, secrets: readonly string[] = []): string {
  let text = value
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\$argon2\S+/gi, "[redacted]")
    .replace(/\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]+\b/g, "[redacted]");
  for (const secret of secrets) {
    if (secret.length >= 6) text = text.split(secret).join(REDACTED);
  }
  return text;
}

function looksLikeSecret(value: string): boolean {
  const text = value.trim();
  if (text.startsWith("$argon2")) return true;
  if (text.includes("-----BEGIN ") && /PRIVATE/.test(text)) return true;
  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(text)) return true;
  if (/^(?:sk|pk)_(?:live|test)_/.test(text)) return true;
  if (/^Bearer\s+\S+/i.test(text)) return true;
  if (/postgres(?:ql)?:\/\/[^\s]*:[^\s]*@/i.test(text)) return true;
  if (/^(?:ghp|gho|github_pat)_[A-Za-z0-9_]+$/.test(text)) return true;
  if (/^[A-Z2-7]{16,128}$/.test(text)) return true;
  return false;
}

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return redactString(value.toString("base64"));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSecretKey(key) ? REDACTED : redactValue(child);
    }
    return out;
  }
  if (typeof value === "string") return redactString(value);
  return value;
}

function redactString(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") return JSON.stringify(redactValue(parsed));
    } catch {
      /* keep the original text and scrub it below */
    }
  }
  if (looksLikeSecret(trimmed)) return REDACTED;
  return scrubSecretText(value);
}

export function blobUnavailableNote(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/timed out/i.test(message)) return "Blob read timed out.";
  if (/suspend|limit|403|401|not configured|token|credential/i.test(message)) {
    return "Blob store is unavailable.";
  }
  return "Blob read failed.";
}

export async function readLiveBlobs(io: BlobIo): Promise<BlobBackupRead> {
  let listed: { pathname: string }[];
  try {
    listed = await io.list("resonance-2/");
  } catch (error) {
    return { status: "unavailable", files: [], note: blobUnavailableNote(error) };
  }
  const paths = listed
    .map((item) => item.pathname)
    .filter((pathname) => pathname.startsWith("resonance-2/") && !pathname.includes(".."));
  if (paths.length === 0) return { status: "empty", files: [], note: null };
  const files: BlobFile[] = [];
  let failed = 0;
  for (const pathname of paths) {
    try {
      const body = await io.read(pathname);
      if (body.status === "ok" && body.text) {
        files.push({ pathname, text: redactString(body.text) });
      } else if (body.status === "unavailable") {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      void blobUnavailableNote(error);
    }
  }
  if (files.length === 0 && failed > 0) {
    return { status: "unavailable", files: [], note: "Blob store is unavailable." };
  }
  if (files.length === 0) return { status: "empty", files: [], note: null };
  return {
    status: "copied",
    files,
    note: failed > 0 ? "Some blob reads failed." : null,
  };
}

export function siteConfigSnapshot(
  now: Date,
  target: { repo: string; branch: string },
): Record<string, unknown> {
  return redactValue({
    kind: "resonance-site-config",
    version: 1,
    capturedAt: now.toISOString(),
    retentionDays: BACKUP_RETENTION_DAYS,
    scheduleUtc: BACKUP_CRON_SCHEDULE,
    scheduleNote: "Once a day at 08:00 UTC, about 2 AM or 3 AM in Chicago.",
    shelvedNodes: [...SHELVED_NODES],
    destination: "github",
    repo: target.repo,
    branch: target.branch,
    blobStore: "read only",
  }) as Record<string, unknown>;
}

export async function exportTables(sql: BackupSql): Promise<{
  tables: Record<string, unknown[]>;
  counts: Record<string, number>;
  skipped: number;
}> {
  const found = await sql.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  let skipped = 0;
  for (const row of found) {
    const name = typeof row.table_name === "string" ? row.table_name : "";
    if (!IDENT.test(name)) {
      skipped += 1;
      continue;
    }
    const data = await sql.query(`SELECT * FROM ${quoteIdent(name)}`);
    const redacted = data.map((entry) => redactValue(entry)) as unknown[];
    tables[name] = redacted;
    counts[name] = redacted.length;
  }
  return { tables, counts, skipped };
}

export function formatBackupTime(value: string | Date | null | undefined): string {
  if (!value) return "not recorded";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "not recorded";
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "not recorded";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function backupStatusLine(run: {
  status: "ok" | "error" | null;
  blobStatus: BlobBackupRead["status"] | null;
}): string {
  if (!run.status) return "not recorded";
  if (run.blobStatus === "unavailable") {
    return run.status === "ok" ? "ok · blob unavailable" : "error · blob unavailable";
  }
  if (run.blobStatus === "empty") return run.status === "ok" ? "ok · blob empty" : "error";
  return run.status;
}

function showLine(value: string, publicMode: boolean): string {
  if (!publicMode || !hasMoneyText(value)) return value;
  const stripped = stripMoneyText(value);
  return stripped || "not recorded";
}

export function backupDetailLines(run: BackupRunView | null, publicMode: boolean): { label: string; value: string }[] {
  const lines = [
    { label: "Last run", value: formatBackupTime(run?.startedAt) },
    { label: "Status", value: backupStatusLine({ status: run?.status ?? null, blobStatus: run?.blobStatus ?? null }) },
    { label: "Tables", value: run?.tableCount === null || run?.tableCount === undefined ? "not recorded" : String(run.tableCount) },
    { label: "Size", value: formatBytes(run?.byteSize ?? null) },
    { label: "Kept", value: `${BACKUP_RETENTION_DAYS} nightly snapshots` },
  ];
  if (run?.error) lines.push({ label: "Error", value: run.error });
  return lines.map((line) => ({ label: line.label, value: showLine(line.value, publicMode) }));
}

export function backupFace(run: BackupRunView | null, publicMode: boolean, unavailable = false): HomeFace {
  if (unavailable) {
    return tileFace({
      id: "backup",
      glyph: "backup",
      href: "/n/backup",
      name: "Backup",
      headline: "unavailable",
      status: "not recorded",
      live: false,
      publicMode,
    });
  }
  return tileFace({
    id: "backup",
    glyph: "backup",
    href: "/n/backup",
    name: "Backup",
    headline: run?.startedAt ? formatBackupTime(run.startedAt) : "not recorded",
    status: backupStatusLine({ status: run?.status ?? null, blobStatus: run?.blobStatus ?? null }),
    live: run?.status === "ok",
    publicMode,
  });
}

function asCounts(value: unknown): Record<string, number> {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source) as unknown;
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const counts: Record<string, number> = {};
  for (const [key, count] of Object.entries(source as Record<string, unknown>)) {
    if (typeof count === "number" && Number.isFinite(count)) counts[key] = count;
    else if (typeof count === "string" && /^\d+$/.test(count)) counts[key] = Number(count);
  }
  return counts;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function asStatus(value: unknown): "ok" | "error" | null {
  return value === "ok" || value === "error" ? value : null;
}

function asBlobStatus(value: unknown): BlobBackupRead["status"] | null {
  return value === "copied" || value === "unavailable" || value === "empty" ? value : null;
}

export async function loadLatestBackupRun(): Promise<BackupRunView | null> {
  const rows = await sqlQuery(
    `SELECT started_at, status, table_counts, byte_size, blob_status, error
     FROM backup_runs
     ORDER BY started_at DESC
     LIMIT 1`,
  );
  return backupViewFromRow(rows[0] ?? null);
}

export function backupViewFromRow(row: Record<string, unknown> | null): BackupRunView | null {
  if (!row) return null;
  const counts = asCounts(row.table_counts);
  const started = row.started_at;
  return {
    startedAt: started instanceof Date ? started.toISOString() : typeof started === "string" ? started : null,
    status: asStatus(row.status),
    blobStatus: asBlobStatus(row.blob_status),
    tableCount: Object.keys(counts).length,
    byteSize: asInt(row.byte_size),
    error: typeof row.error === "string" && row.error.trim() ? row.error : null,
  };
}

async function recordRun(sql: BackupSql, result: BackupRunResult): Promise<void> {
  await sql.query(
    `INSERT INTO backup_runs (
      started_at, finished_at, status, table_counts, byte_size, object_count, prefix, blob_status, blob_note, error
    ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)`,
    [
      result.startedAt,
      new Date().toISOString(),
      result.status,
      JSON.stringify(result.tableCounts),
      result.byteSize,
      result.objectCount,
      result.prefix,
      result.blobStatus,
      result.blobNote,
      result.error,
    ],
  );
}

function failureMessage(error: unknown, secrets: readonly string[]): string {
  const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Backup failed.";
  return scrubSecretText(message, secrets).slice(0, 400);
}

export async function runBackup(deps: BackupDeps): Promise<BackupRunResult> {
  const startedAt = deps.now.toISOString();
  const day = startedAt.slice(0, 10);
  const prefix = snapshotPath(day);
  let tableCounts: Record<string, number> = {};
  let blobStatus: BlobBackupRead["status"] | null = null;
  let blobNote: string | null = null;
  let byteSize: number | null = null;
  let objectCount: number | null = null;
  let pruned = 0;
  let committed = false;
  try {
    const exported = await exportTables(deps.sql);
    tableCounts = exported.counts;
    const blobs = await deps.blobs();
    blobStatus = blobs.status;
    blobNote = blobs.note;
    const snapshot = {
      kind: "resonance-backup",
      version: 1,
      day,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "ok",
      blobStatus,
      blobNote,
      tableCounts,
      skippedTables: exported.skipped,
      tables: exported.tables,
      blobs: Object.fromEntries(blobs.files.map((file) => [file.pathname, file.text])),
      config: siteConfigSnapshot(deps.now, deps.target),
    };
    const json = scrubSecretText(JSON.stringify(redactValue(snapshot)), deps.secrets);
    byteSize = Buffer.byteLength(json);
    objectCount = Object.keys(exported.tables).length + blobs.files.length;
    const existing = await deps.github.listSnapshotPaths();
    const deletes = backupPathsToPrune([...existing, prefix], BACKUP_RETENTION_DAYS).filter((path) => path !== prefix);
    await deps.github.commit({
      message: `backup ${day}`,
      writes: [{ path: prefix, content: json }],
      deletes,
    });
    committed = true;
    pruned = deletes.length;
    const result: BackupRunResult = {
      ok: true,
      status: "ok",
      startedAt,
      prefix,
      tableCounts,
      byteSize,
      objectCount,
      blobStatus,
      blobNote,
      error: null,
      pruned,
    };
    try {
      await recordRun(deps.sql, result);
    } catch {
      return {
        ...result,
        ok: false,
        error: "Snapshot committed. The run log did not save.",
      };
    }
    return result;
  } catch (error) {
    const result: BackupRunResult = {
      ok: false,
      status: "error",
      startedAt,
      prefix,
      tableCounts,
      byteSize,
      objectCount,
      blobStatus,
      blobNote,
      error: committed ? "Snapshot committed. The run log did not save." : failureMessage(error, deps.secrets),
      pruned: committed ? pruned : 0,
    };
    if (!committed) {
      try {
        await recordRun(deps.sql, result);
      } catch {
        /* the caller still receives the backup error */
      }
    }
    return result;
  }
}
