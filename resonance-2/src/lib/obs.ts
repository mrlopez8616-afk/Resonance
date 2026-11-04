import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** One recording notice is a few hundred bytes. Reject anything larger before parse. */
export const OBS_BODY_LIMIT = 32_000;

/** Rows the Gear page paints. Older rows stay in the table. */
export const OBS_PAGE_LIMIT = 20;

export const OBS_HEADER = "x-obs-token";
export const OBS_HEADER_NAME = "X-Obs-Token";
export const OBS_URL = "https://resonance3.vercel.app/api/ingest/obs";

const NAME_LIMIT = 240;
const FOLDER_LIMIT = 400;

export type ObsRecording = {
  key: string;
  fileName: string;
  folder: string;
  sizeBytes: number;
  durationSec: number | null;
  createdAt: string;
};

export function newObsToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashObsToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Compare a presented token with the stored sha256 hex digest. */
export function obsTokenMatches(provided: string, storedHex: string): boolean {
  const left = createHash("sha256").update(provided).digest();
  const right = /^[0-9a-f]{64}$/i.test(storedHex) ? Buffer.from(storedHex, "hex") : Buffer.alloc(0);
  if (right.length !== left.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function obsRecordingKey(folder: string, fileName: string, createdAt: string): string {
  return createHash("sha256").update(`${folder}\n${fileName}\n${createdAt}`).digest("hex");
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 10 ? 0 : 1;
  const rounded = Number(value.toFixed(digits));
  const text = new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(rounded);
  return `${text} ${units[unit]}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const clock = `${minutes}:${String(secs).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : clock;
}

export function formatObsTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
    .format(date)
    .replace(/\u202f/g, " ")
    .replace(/\u00a0/g, " ");
  return `${text} CT`;
}

/** Drop token fields before the raw body is stored. */
export function obsPayloadForStore(body: unknown): unknown {
  const record = asRecord(body);
  if (!record) return body;
  const copy: Record<string, unknown> = { ...record };
  for (const key of Object.keys(copy)) {
    if (/token/i.test(key)) delete copy[key];
  }
  return copy;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function cleanPath(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  if (/[\u0000-\u001f]/.test(text)) return null;
  return text;
}

function wholeBytes(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  if (parsed === null || !Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  if (parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) return null;
  return parsed;
}

function durationSeconds(value: unknown): number | null | "invalid" {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  if (parsed === null || !Number.isFinite(parsed) || parsed < 0 || parsed > 7 * 24 * 60 * 60) return "invalid";
  return parsed;
}

/** Null when the body is not one recording. */
export function parseObsRecording(body: unknown): ObsRecording | null {
  const record = asRecord(body);
  if (!record) return null;
  const fileName = cleanPath(record.fileName, NAME_LIMIT);
  const folder = cleanPath(record.folder, FOLDER_LIMIT);
  const sizeBytes = wholeBytes(record.sizeBytes);
  const createdRaw = typeof record.createdAt === "string" ? record.createdAt.trim() : "";
  const createdMs = Date.parse(createdRaw);
  const duration = durationSeconds(record.durationSec);
  if (!fileName || fileName.includes("/") || fileName.includes("\\")) return null;
  if (!folder || sizeBytes === null || !createdRaw || !Number.isFinite(createdMs) || duration === "invalid") return null;
  const createdAt = new Date(createdMs).toISOString();
  return {
    key: obsRecordingKey(folder, fileName, createdAt),
    fileName,
    folder,
    sizeBytes,
    durationSec: duration,
    createdAt,
  };
}

export function numericText(value: number): string {
  return value.toFixed(6).replace(/\.?0+$/, "") || "0";
}
