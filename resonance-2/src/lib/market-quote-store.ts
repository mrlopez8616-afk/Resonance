import "server-only";

import type { SpotQuote } from "@/lib/live-face";
import { sqlQuery } from "@/lib/pg/client";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export type StoredCloses = {
  source: string;
  fetchedAt: string;
  closes: { day: string; close: number }[];
};

function asIso(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}

function asPayload(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value;
}

function spotFromPayload(source: string, fetchedAt: string, payload: unknown): SpotQuote | null {
  if (typeof payload !== "object" || payload === null) return null;
  const usd = (payload as { usd?: unknown }).usd;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) return null;
  const change = (payload as { change24hPct?: unknown }).change24hPct;
  return {
    usd,
    source,
    fetchedAt,
    change24hPct: typeof change === "number" && Number.isFinite(change) ? change : null,
    price24hAgoUsd: null,
  };
}

function closesFromPayload(payload: unknown): { day: string; close: number }[] {
  if (typeof payload !== "object" || payload === null) return [];
  const rows = (payload as { closes?: unknown }).closes;
  if (!Array.isArray(rows)) return [];
  const closes: { day: string; close: number }[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const day = (row as { day?: unknown }).day;
    const close = (row as { close?: unknown }).close;
    if (typeof day !== "string" || !DAY.test(day)) continue;
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) continue;
    closes.push({ day, close });
  }
  return closes;
}

async function readRow(
  cacheKey: string,
): Promise<{ source: string; fetchedAt: string; payload: unknown } | null> {
  try {
    const rows = await sqlQuery<{ source: string; fetched_at: unknown; payload: unknown }>(
      `SELECT source, fetched_at, payload FROM market_quotes WHERE cache_key = $1`,
      [cacheKey],
    );
    const row = rows[0];
    if (!row || typeof row.source !== "string" || row.source.trim() === "") return null;
    const fetchedAt = asIso(row.fetched_at);
    if (!fetchedAt) return null;
    return { source: row.source, fetchedAt, payload: asPayload(row.payload) };
  } catch {
    return null;
  }
}

async function writeRow(cacheKey: string, source: string, fetchedAt: string, payload: unknown): Promise<void> {
  if (!cacheKey || !source || !Number.isFinite(Date.parse(fetchedAt))) return;
  try {
    await sqlQuery(
      `INSERT INTO market_quotes (cache_key, source, fetched_at, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (cache_key) DO UPDATE
         SET source = EXCLUDED.source,
             fetched_at = EXCLUDED.fetched_at,
             payload = EXCLUDED.payload
       WHERE market_quotes.fetched_at <= EXCLUDED.fetched_at`,
      [cacheKey, source, fetchedAt, JSON.stringify(payload)],
    );
  } catch {
    // The in-memory copy still serves this process.
  }
}

export async function readStoredSpot(ticker: string): Promise<SpotQuote | null> {
  const row = await readRow(`spot:${ticker}`);
  if (!row) return null;
  return spotFromPayload(row.source, row.fetchedAt, row.payload);
}

export async function writeStoredSpot(ticker: string, quote: SpotQuote): Promise<void> {
  if (!Number.isFinite(quote.usd) || quote.usd <= 0) return;
  await writeRow(`spot:${ticker}`, quote.source, quote.fetchedAt, {
    usd: quote.usd,
    change24hPct:
      typeof quote.change24hPct === "number" && Number.isFinite(quote.change24hPct)
        ? quote.change24hPct
        : null,
  });
}

export async function readStoredCloses(cacheKey: string): Promise<StoredCloses | null> {
  const row = await readRow(cacheKey);
  if (!row) return null;
  const closes = closesFromPayload(row.payload);
  if (closes.length === 0) return null;
  return { source: row.source, fetchedAt: row.fetchedAt, closes };
}

export async function writeStoredCloses(cacheKey: string, row: StoredCloses): Promise<void> {
  const closes = row.closes.filter(
    (close) => DAY.test(close.day) && Number.isFinite(close.close) && close.close > 0,
  );
  if (closes.length === 0) return;
  const kept = closes.length > 800 ? closes.slice(closes.length - 800) : closes;
  await writeRow(cacheKey, row.source, row.fetchedAt, { closes: kept });
}
