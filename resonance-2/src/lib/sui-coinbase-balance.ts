import "server-only";

import type { NodeSleeve } from "@/data/sleeves";
import {
  normalizeDecimal,
  applySuiCoinbaseQuantities,
  readCoinbaseCredentials,
  resolveSuiCoinbaseBalance,
  type StoredSuiBalance,
  type SuiBalanceResolution,
  type SuiSleeveQuantities,
} from "@/lib/coinbase-portfolio";
import { sqlQuery } from "@/lib/pg/client";

const CACHE_MS = 20_000;

type CacheHit = {
  at: number;
  quantities: SuiSleeveQuantities;
  asOf: string;
};

let cache: CacheHit | null = null;

export function resetSuiCoinbaseCacheForTests(): void {
  cache = null;
}

type BalanceRow = {
  coinbase_qty: string;
  cb_agentic_qty: string;
  observed_at: unknown;
};

function instantText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? "").trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return "";
}

async function loadStored(): Promise<StoredSuiBalance | null> {
  try {
    const rows = await sqlQuery<BalanceRow>(
      `SELECT coinbase_qty, cb_agentic_qty, observed_at
         FROM sui_coinbase_balance
        WHERE ticker = 'SUI'`,
    );
    const row = rows[0];
    if (!row) return null;
    const coinbase = normalizeDecimal(String(row.coinbase_qty));
    const cbAgentic = normalizeDecimal(String(row.cb_agentic_qty));
    const asOf = instantText(row.observed_at);
    if (!coinbase || !cbAgentic || !asOf) return null;
    return { coinbase, cbAgentic, asOf };
  } catch {
    return null;
  }
}

async function saveStored(row: StoredSuiBalance): Promise<void> {
  const coinbase = normalizeDecimal(row.coinbase);
  const cbAgentic = normalizeDecimal(row.cbAgentic);
  if (!coinbase || !cbAgentic || !row.asOf.trim()) return;
  await sqlQuery(
    `INSERT INTO sui_coinbase_balance (ticker, coinbase_qty, cb_agentic_qty, observed_at)
     VALUES ('SUI', $1, $2, $3)
     ON CONFLICT (ticker) DO UPDATE
     SET coinbase_qty = EXCLUDED.coinbase_qty,
         cb_agentic_qty = EXCLUDED.cb_agentic_qty,
         observed_at = EXCLUDED.observed_at`,
    [coinbase, cbAgentic, row.asOf],
  );
}

function coinbaseFetch(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  return fetch(url, { ...init, signal: controller.signal, cache: "no-store" }).finally(() => {
    clearTimeout(timer);
  });
}

function sleeveQuantity(sleeves: readonly { id: string; quantity: string }[], id: string): string | null {
  const row = sleeves.find((sleeve) => sleeve.id === id);
  return row ? row.quantity : null;
}

export async function readSuiCoinbaseBalance(fallback: {
  coinbase: string | null;
  cbAgentic: string | null;
}): Promise<SuiBalanceResolution> {
  const credentials = readCoinbaseCredentials();
  if (credentials && cache && Date.now() - cache.at < CACHE_MS) {
    return { quantities: cache.quantities, fresh: true, asOf: cache.asOf };
  }
  const stored = await loadStored();
  const result = await resolveSuiCoinbaseBalance({
    fallback,
    credentials,
    now: new Date(),
    fetchImpl: coinbaseFetch,
    stored,
    save: saveStored,
  });
  if (result.fresh && result.quantities && result.asOf) {
    cache = { at: Date.now(), quantities: result.quantities, asOf: result.asOf };
  }
  return result;
}

export async function withSuiCoinbaseBalance(sleeves: readonly NodeSleeve[]): Promise<{
  sleeves: NodeSleeve[];
  fresh: boolean;
  asOf: string | null;
}> {
  const read = await readSuiCoinbaseBalance({
    coinbase: sleeveQuantity(sleeves, "coinbase"),
    cbAgentic: sleeveQuantity(sleeves, "cb-agentic"),
  });
  if (!read.quantities) return { sleeves: [...sleeves], fresh: false, asOf: null };
  return {
    sleeves: applySuiCoinbaseQuantities(sleeves, read.quantities),
    fresh: read.fresh,
    asOf: read.asOf,
  };
}

export async function overlayLiveSuiBook<T extends { SUI: readonly NodeSleeve[] }>(
  books: T,
): Promise<{ books: T; fresh: boolean; asOf: string | null }> {
  const read = await withSuiCoinbaseBalance(books.SUI);
  return {
    books: { ...books, SUI: read.sleeves },
    fresh: read.fresh,
    asOf: read.asOf,
  };
}
