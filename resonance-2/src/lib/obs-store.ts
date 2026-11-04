import "server-only";

import { numericText, OBS_PAGE_LIMIT, type ObsRecording } from "@/lib/obs";
import { sqlQuery } from "@/lib/pg/client";

type RecordingRow = {
  recording_key: string;
  file_name: string;
  folder: string;
  size_bytes: string;
  duration_sec: string | null;
  created_at: string | Date;
  received_at: string | Date;
};

export type ObsRecordingRow = {
  key: string;
  fileName: string;
  folder: string;
  sizeBytes: number;
  durationSec: number | null;
  createdAt: string;
  receivedAt: string;
};

const UPSERT_SQL = `INSERT INTO obs_recordings (
  recording_key, file_name, folder, size_bytes, duration_sec, created_at, received_at, payload
) VALUES (
  $1, $2, $3, $4, $5::numeric, $6::timestamptz, now(), $7::jsonb
)
ON CONFLICT (recording_key) DO UPDATE SET
  file_name = EXCLUDED.file_name,
  folder = EXCLUDED.folder,
  size_bytes = EXCLUDED.size_bytes,
  duration_sec = EXCLUDED.duration_sec,
  created_at = EXCLUDED.created_at,
  received_at = now(),
  payload = EXCLUDED.payload`;

function asTime(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapRow(row: RecordingRow): ObsRecordingRow | null {
  const sizeBytes = asNumber(row.size_bytes);
  const createdAt = asTime(row.created_at);
  const receivedAt = asTime(row.received_at);
  if (sizeBytes === null || !createdAt || !receivedAt) return null;
  const duration = row.duration_sec == null ? null : asNumber(row.duration_sec);
  return {
    key: row.recording_key,
    fileName: row.file_name,
    folder: row.folder,
    sizeBytes,
    durationSec: duration,
    createdAt,
    receivedAt,
  };
}

export async function readObsTokenHash(): Promise<string | null> {
  const rows = await sqlQuery<{ token_hash: string }>(`SELECT token_hash FROM obs_tokens WHERE id = 1`);
  const hash = rows[0]?.token_hash?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

export async function obsTokenConfigured(): Promise<boolean> {
  return (await readObsTokenHash()) !== null;
}

/** Stores the digest only. The caller shows the plaintext once and does not log it. */
export async function saveObsTokenHash(tokenHash: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash)) throw new Error("token hash must be 64 hex characters");
  await sqlQuery(
    `INSERT INTO obs_tokens (id, token_hash, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET
       token_hash = EXCLUDED.token_hash,
       updated_at = now()`,
    [tokenHash],
  );
}

export async function writeObsRecording(recording: ObsRecording, payload: unknown): Promise<void> {
  await sqlQuery(UPSERT_SQL, [
    recording.key,
    recording.fileName,
    recording.folder,
    recording.sizeBytes,
    recording.durationSec === null ? null : numericText(recording.durationSec),
    recording.createdAt,
    JSON.stringify(payload),
  ]);
}

export async function readObsPage(): Promise<{ recordings: ObsRecordingRow[]; lastSeen: string | null }> {
  const [rows, seen] = await Promise.all([
    sqlQuery<RecordingRow>(
      `SELECT recording_key, file_name, folder, size_bytes::text AS size_bytes,
              duration_sec::text AS duration_sec, created_at, received_at
       FROM obs_recordings
       ORDER BY created_at DESC, recording_key DESC
       LIMIT ${OBS_PAGE_LIMIT}`,
    ),
    sqlQuery<{ received_at: string | Date }>(
      `SELECT received_at FROM obs_recordings ORDER BY received_at DESC LIMIT 1`,
    ),
  ]);
  const recordings: ObsRecordingRow[] = [];
  for (const row of rows) {
    const mapped = mapRow(row);
    if (mapped) recordings.push(mapped);
  }
  return { recordings, lastSeen: seen[0] ? asTime(seen[0].received_at) : null };
}
