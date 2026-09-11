import { EQUITY_TICKERS, fetchWithTimeout } from "./price-ids";
import type { Quote } from "./types";

type EquityResult = {
  source: string;
  quotes: Record<string, Quote>;
};

export async function fetchEquityQuotes(): Promise<EquityResult> {
  const errors: string[] = [];
  try {
    return await fetchYahoo();
  } catch (error) {
    errors.push(
      `Yahoo quote: ${error instanceof Error ? error.message : "failed"}`,
    );
  }
  try {
    return await fetchYahooChart();
  } catch (error) {
    errors.push(
      `Yahoo chart: ${error instanceof Error ? error.message : "failed"}`,
    );
  }
  try {
    return await fetchStooq();
  } catch (error) {
    errors.push(`Stooq: ${error instanceof Error ? error.message : "failed"}`);
  }
  throw new Error(
    `No live equity feed without an API key. ${errors.join(" · ")}. Enter prices manually.`,
  );
}

async function fetchYahoo(): Promise<EquityResult> {
  const symbols = EQUITY_TICKERS.join(",");
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      accept: "application/json",
      "user-agent":
        "Mozilla/5.0 (compatible; ResonanceDashboard/0.1; +https://github.com/mrlopez8616-afk/Resonance)",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    quoteResponse?: {
      result?: Array<{
        symbol?: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
      }>;
    };
  };
  const quotes: Record<string, Quote> = {};
  for (const row of data.quoteResponse?.result ?? []) {
    const ticker = (row.symbol ?? "").toUpperCase();
    if (!EQUITY_TICKERS.includes(ticker as (typeof EQUITY_TICKERS)[number])) {
      continue;
    }
    if (typeof row.regularMarketPrice !== "number") continue;
    quotes[ticker] = {
      ticker,
      usd: row.regularMarketPrice,
      change24hPct:
        typeof row.regularMarketChangePercent === "number"
          ? row.regularMarketChangePercent
          : null,
    };
  }
  if (Object.keys(quotes).length === 0) {
    throw new Error("Yahoo returned no quotes");
  }
  return { source: "Yahoo Finance (unofficial public quote)", quotes };
}

async function fetchYahooChart(): Promise<EquityResult> {
  const quotes: Record<string, Quote> = {};
  await Promise.all(
    EQUITY_TICKERS.map(async (ticker) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
      const response = await fetchWithTimeout(url, {
        headers: {
          accept: "application/json",
          "user-agent":
            "Mozilla/5.0 (compatible; ResonanceDashboard/0.1; +https://github.com/mrlopez8616-afk/Resonance)",
        },
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        chart?: {
          result?: Array<{
            meta?: { regularMarketPrice?: number };
            indicators?: { quote?: Array<{ close?: Array<number | null> }> };
          }>;
        };
      };
      const result = data.chart?.result?.[0];
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const numeric = closes.filter(
        (value): value is number => typeof value === "number",
      );
      const last = numeric.at(-1);
      const prev = numeric.at(-2);
      const usd =
        typeof last === "number" ? last : result?.meta?.regularMarketPrice;
      if (typeof usd !== "number" || !Number.isFinite(usd)) return;
      const change =
        typeof prev === "number" && prev > 0
          ? ((usd - prev) / prev) * 100
          : null;
      quotes[ticker] = { ticker, usd, change24hPct: change };
    }),
  );
  if (Object.keys(quotes).length === 0) {
    throw new Error("Yahoo chart returned no quotes");
  }
  return { source: "Yahoo Finance (unofficial chart)", quotes };
}

async function fetchStooq(): Promise<EquityResult> {
  const quotes: Record<string, Quote> = {};
  const errors: string[] = [];
  await Promise.all(
    EQUITY_TICKERS.map(async (ticker) => {
      try {
        const url = `https://stooq.com/q/l/?s=${ticker.toLowerCase()}.us&f=sd2t2ohlcv&h&e=csv`;
        const response = await fetchWithTimeout(url, {
          headers: { accept: "text/csv,text/plain" },
        });
        if (!response.ok) {
          errors.push(`${ticker} HTTP ${response.status}`);
          return;
        }
        const text = await response.text();
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) {
          errors.push(`${ticker} empty`);
          return;
        }
        const cols = lines[1].split(",");
        const close = Number(cols[6]);
        const open = Number(cols[3]);
        if (!Number.isFinite(close) || close <= 0) {
          errors.push(`${ticker} no close`);
          return;
        }
        const change =
          Number.isFinite(open) && open > 0 ? ((close - open) / open) * 100 : null;
        quotes[ticker] = {
          ticker,
          usd: close,
          change24hPct: change,
        };
      } catch (error) {
        errors.push(
          `${ticker} ${error instanceof Error ? error.message : "failed"}`,
        );
      }
    }),
  );
  if (Object.keys(quotes).length === 0) {
    throw new Error(errors.join("; ") || "Stooq returned no quotes");
  }
  return { source: "Stooq", quotes };
}
