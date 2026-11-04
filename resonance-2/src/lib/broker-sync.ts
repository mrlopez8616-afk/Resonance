import { addDecimal } from "@/lib/decimal";
import {
  assetQuantityFromBreakdown,
  decimalFromApiValue,
  isDefaultPortfolio,
  normalizeDecimal,
  parsePortfolioList,
  sleeveForCoinbasePortfolio,
  type CoinbasePortfolioRef,
} from "@/lib/coinbase-portfolio";
import { hasMoneyText } from "@/lib/public-mode";
import { formatBalanceAsOf } from "@/lib/sui-balance-line";

/**
 * Read-only broker sync.
 * Three Hobby-safe daily crons. Hobby may invoke a daily cron any time
 * inside the UTC hour. Those hours are about 8 AM, 1 PM, and 7 PM CT:
 * 8:00–8:59 AM CST / 9:00–9:59 AM CDT, 1:00–1:59 PM CST / 2:00–2:59 PM CDT,
 * and 7:00–7:59 PM CST / 8:00–8:59 PM CDT.
 * The job reads holdings, cash, and recent orders. It does not place orders.
 */

export const BROKER_SYNC_STALE_MS = 24 * 60 * 60 * 1000;

export const BROKER_CRON_JOBS = [
  { path: "/api/cron/brokers", schedule: "0 14 * * *" },
  { path: "/api/cron/brokers", schedule: "0 19 * * *" },
  { path: "/api/cron/brokers", schedule: "0 1 * * *" },
] as const;

export const BROKER_CRON_SLOTS = [
  "14:00 UTC hour (8:00–8:59 AM CST / 9:00–9:59 AM CDT), about 8 AM CT",
  "19:00 UTC hour (1:00–1:59 PM CST / 2:00–2:59 PM CDT), about 1 PM CT",
  "01:00 UTC hour (7:00–7:59 PM CST / 8:00–8:59 PM CDT), about 7 PM CT",
] as const;

/** Crypto names the Robinhood crypto read can refresh. Share books are not in that API. */
export const ROBINHOOD_CRYPTO_TICKERS = ["XRP", "SUI", "HBAR"] as const;

const AI_TICKERS = ["PWR", "VRT", "GEV", "CEG", "NVDA", "TSM", "TSLA", "SPCX", "ETN", "HUBB"] as const;

const COINBASE_TARGETS = [
  { sleeveId: "coinbase", ticker: "SUI" },
  { sleeveId: "cb-agentic", ticker: "SUI" },
  { sleeveId: "cb-agentic", ticker: "XRP" },
] as const;

export type BrokerVenue = "coinbase" | "robinhood";

export type BrokerSyncStatus = "ok" | "error" | "not_configured" | "never";

export type BrokerPosition = {
  sleeveId: string;
  ticker: string;
  quantity: string;
};

export type BrokerBalance = {
  currency: string;
  amount: string;
};

export type BrokerOrder = {
  orderId: string;
  ticker: string;
  side: string;
  quantity: string;
  price: string;
  status: string;
  filledAt: string | null;
};

export type BrokerSnapshot = {
  positions: BrokerPosition[];
  balances: BrokerBalance[];
  orders: BrokerOrder[];
  /** True when the orders endpoint could not be read. Positions still stand. */
  ordersUnread: boolean;
  balancesUnread: boolean;
};

export type BrokerSyncMark = {
  status: BrokerSyncStatus;
  syncedAt: string | null;
  stale: boolean;
  /** Money-free. Safe on a node card. */
  line: string;
  /** Private cash phrase. Null when no balance was stored. */
  cashLine: string | null;
  orders: number;
};

export type BrokerSyncView = {
  coinbase: BrokerSyncMark;
  robinhood: BrokerSyncMark;
  equity: BrokerSyncMark;
};

type SleeveRow = { id: string; quantity: string; manual?: boolean };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function tickerOfProduct(value: string): string {
  const symbol = value.trim().toUpperCase();
  if (!symbol) return "";
  const dash = symbol.indexOf("-");
  return dash === -1 ? symbol : symbol.slice(0, dash);
}

export function isHobbyBrokerSchedule(schedule: string): boolean {
  return BROKER_CRON_JOBS.some((job) => job.schedule === schedule);
}

/** Quote decimal fields before JSON.parse so a balance stays a string. */
export function preserveQuantityLiterals(raw: string): string {
  return raw.replace(
    /("(?:total_quantity|quantity_available_for_trading|buying_power|filled_asset_quantity|average_price|effective_price|quantity|asset_quantity|limit_price|quote_amount|size|price|value)"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)(?=\s*[,}\]])/g,
    '$1"$2"',
  );
}

export function parseBrokerJson(raw: string): unknown {
  return JSON.parse(preserveQuantityLiterals(raw)) as unknown;
}

function sumByCurrency(
  rows: readonly { currency: string; amount: string }[],
): BrokerBalance[] {
  const sums = new Map<string, string>();
  for (const row of rows) {
    const currency = row.currency.trim().toUpperCase();
    if (currency !== "USD" && currency !== "USDC") continue;
    const amount = normalizeDecimal(row.amount);
    if (!amount) continue;
    sums.set(currency, addDecimal(sums.get(currency) ?? "0", amount));
  }
  return [...sums].map(([currency, amount]) => ({ currency, amount }));
}

/**
 * Default portfolio SUI lands on `coinbase`. Agentic XRP and SUI land on
 * `cb-agentic`. The closed XRP Default lot is not a sleeve. A missing
 * breakdown fails the read instead of writing a zero.
 */
export function positionsFromCoinbase(
  portfolios: readonly CoinbasePortfolioRef[],
  breakdownByUuid: ReadonlyMap<string, unknown>,
): BrokerPosition[] | null {
  if (!portfolios.some((portfolio) => isDefaultPortfolio(portfolio))) return null;
  const out: BrokerPosition[] = [];
  for (const target of COINBASE_TARGETS) {
    let sum = "0";
    let saw = false;
    for (const portfolio of portfolios) {
      if (sleeveForCoinbasePortfolio(portfolio) !== target.sleeveId) continue;
      if (!breakdownByUuid.has(portfolio.uuid)) return null;
      const qty = assetQuantityFromBreakdown(breakdownByUuid.get(portfolio.uuid), target.ticker);
      if (qty === null) return null;
      saw = true;
      sum = addDecimal(sum, qty);
    }
    out.push({ sleeveId: target.sleeveId, ticker: target.ticker, quantity: saw ? sum : "0" });
  }
  return out;
}

export function positionsFromPortfolioList(listed: unknown, breakdownByUuid: ReadonlyMap<string, unknown>): BrokerPosition[] | null {
  return positionsFromCoinbase(parsePortfolioList(listed), breakdownByUuid);
}

export function balancesFromCoinbaseAccounts(body: unknown): BrokerBalance[] | null {
  const root = asRecord(body);
  const accounts = root && Array.isArray(root.accounts) ? root.accounts : null;
  if (!accounts) return null;
  const rows: { currency: string; amount: string }[] = [];
  for (const row of accounts) {
    const item = asRecord(row);
    if (!item) continue;
    const available = asRecord(item.available_balance);
    const currency = textField(available?.currency) || textField(item.currency);
    const amount = decimalFromApiValue(available?.value);
    if (!currency || amount === null) continue;
    rows.push({ currency, amount });
  }
  return sumByCurrency(rows);
}

export function ordersFromCoinbaseFills(body: unknown): BrokerOrder[] | null {
  const root = asRecord(body);
  const fills = root && Array.isArray(root.fills) ? root.fills : null;
  if (!fills) return null;
  const out: BrokerOrder[] = [];
  for (const row of fills) {
    const item = asRecord(row);
    if (!item) continue;
    const orderId = textField(item.trade_id) || textField(item.entry_id) || textField(item.order_id);
    const ticker = tickerOfProduct(textField(item.product_id));
    if (!orderId || !ticker) continue;
    out.push({
      orderId,
      ticker,
      side: textField(item.side).toLowerCase(),
      quantity: decimalFromApiValue(item.size) ?? "",
      price: decimalFromApiValue(item.price) ?? "",
      status: "filled",
      filledAt: textField(item.trade_time) || null,
    });
    if (out.length >= 50) break;
  }
  return out;
}

/** Holdings for the crypto read. A missing tracked asset is a real zero. Unreadable quantity fails the read. */
export function positionsFromRobinhoodHoldings(body: unknown): BrokerPosition[] | null {
  const root = asRecord(body);
  const results = root && Array.isArray(root.results) ? root.results : null;
  if (!results) return null;
  const totals = new Map<string, string>();
  for (const row of results) {
    const item = asRecord(row);
    if (!item) return null;
    const asset = textField(item.asset_code).toUpperCase();
    if (!ROBINHOOD_CRYPTO_TICKERS.includes(asset as (typeof ROBINHOOD_CRYPTO_TICKERS)[number])) continue;
    const qty = decimalFromApiValue(item.total_quantity);
    if (qty === null) return null;
    totals.set(asset, addDecimal(totals.get(asset) ?? "0", qty));
  }
  return ROBINHOOD_CRYPTO_TICKERS.map((ticker) => ({
    sleeveId: "rh-agentic",
    ticker,
    quantity: totals.get(ticker) ?? "0",
  }));
}

export function balancesFromRobinhoodAccounts(body: unknown): BrokerBalance[] | null {
  const root = asRecord(body);
  const results = root && Array.isArray(root.results) ? root.results : null;
  if (!results) return null;
  const rows: { currency: string; amount: string }[] = [];
  for (const row of results) {
    const item = asRecord(row);
    if (!item) continue;
    const amount = decimalFromApiValue(item.buying_power);
    const currency = textField(item.buying_power_currency) || "USD";
    if (amount === null) continue;
    rows.push({ currency, amount });
  }
  return sumByCurrency(rows);
}

export function ordersFromRobinhood(body: unknown): BrokerOrder[] | null {
  const root = asRecord(body);
  const results = root && Array.isArray(root.results) ? root.results : null;
  if (!results) return null;
  const out: BrokerOrder[] = [];
  for (const row of results) {
    const item = asRecord(row);
    if (!item) continue;
    const orderId = textField(item.id) || textField(item.client_order_id);
    const ticker = tickerOfProduct(textField(item.symbol));
    if (!orderId || !ticker) continue;
    out.push({
      orderId,
      ticker,
      side: textField(item.side).toLowerCase(),
      quantity: decimalFromApiValue(item.filled_asset_quantity) ?? "",
      price: decimalFromApiValue(item.average_price) ?? "",
      status: textField(item.state).toLowerCase(),
      filledAt: textField(item.updated_at) || textField(item.created_at) || null,
    });
    if (out.length >= 50) break;
  }
  return out;
}

export function coinbaseReadPath(path: string): boolean {
  return (
    path === "/api/v3/brokerage/portfolios" ||
    /^\/api\/v3\/brokerage\/portfolios\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      path,
    ) ||
    path === "/api/v3/brokerage/accounts?limit=250" ||
    path === "/api/v3/brokerage/orders/historical/fills?limit=50"
  );
}

const ROBINHOOD_QUERY_KEYS = new Set(["asset_code", "cursor", "limit"]);

/** GET paths on the official crypto read API. Cancel and order placement are refused. */
export function robinhoodReadPath(path: string): boolean {
  let url: URL;
  try {
    url = new URL(path, "https://trading.robinhood.com");
  } catch {
    return false;
  }
  if (url.origin !== "https://trading.robinhood.com") return false;
  if (
    url.pathname !== "/api/v1/crypto/trading/accounts/" &&
    url.pathname !== "/api/v1/crypto/trading/holdings/" &&
    url.pathname !== "/api/v1/crypto/trading/orders/"
  ) {
    return false;
  }
  for (const key of url.searchParams.keys()) {
    if (!ROBINHOOD_QUERY_KEYS.has(key)) return false;
  }
  return true;
}

export function readRobinhoodCredentials(
  env: Record<string, string | undefined> = process.env,
): { apiKey: string; privateKey: string } | null {
  const apiKey = env.ROBINHOOD_API_KEY?.trim() ?? "";
  const privateKey = env.ROBINHOOD_API_PRIVATE_KEY?.trim() ?? "";
  if (!apiKey || !privateKey) return null;
  return { apiKey, privateKey };
}

export function syncIsStale(status: BrokerSyncStatus, syncedAt: string | null, now: Date): boolean {
  if (status === "not_configured") return false;
  if (status === "error" || status === "never") return true;
  if (!syncedAt) return true;
  const at = Date.parse(syncedAt);
  if (!Number.isFinite(at)) return true;
  return now.getTime() - at > BROKER_SYNC_STALE_MS;
}

function whenLabel(syncedAt: string | null): string {
  if (!syncedAt) return "";
  return formatBalanceAsOf(syncedAt);
}

export function describeBrokerSync(input: {
  label: string;
  status: BrokerSyncStatus;
  syncedAt: string | null;
  now: Date;
  orders?: number;
  balances?: readonly BrokerBalance[];
}): BrokerSyncMark {
  const stale = syncIsStale(input.status, input.syncedAt, input.now);
  const when = whenLabel(input.syncedAt);
  const orders = input.orders && input.orders > 0 ? input.orders : 0;
  let detail: string;
  if (input.status === "not_configured") detail = "not configured";
  else if (!when) detail = stale ? "stale" : "not synced yet";
  else if (stale || input.status === "error") detail = `stale · last synced ${when} CT`;
  else detail = `synced ${when} CT`;
  const orderBit = orders > 0 && input.status !== "not_configured" ? ` · ${orders} recent orders` : "";
  const line = `${input.label} · ${detail}${orderBit}`;
  const cash = (input.balances ?? [])
    .map((row) => {
      const amount = normalizeDecimal(row.amount);
      const currency = row.currency.trim().toUpperCase();
      if (!amount || (currency !== "USD" && currency !== "USDC")) return "";
      return `${currency} ${amount}`;
    })
    .filter(Boolean);
  return {
    status: input.status,
    syncedAt: input.syncedAt,
    stale,
    line,
    cashLine: cash.length > 0 ? `Cash ${cash.join(" · ")}` : null,
    orders,
  };
}

/** Stock positions have no official read-only key on this server. */
export function robinhoodEquityMark(now: Date): BrokerSyncMark {
  const mark = describeBrokerSync({
    label: "Agentic trader",
    status: "not_configured",
    syncedAt: null,
    now,
  });
  return { ...mark, line: "Agentic trader · Robinhood stocks not configured" };
}

export function brokerSyncNoteLines(parent: "crypto" | "ai-stocks", view: BrokerSyncView): string[] {
  if (parent === "ai-stocks") {
    return [view.equity.line].filter((line) => line.trim() && !hasMoneyText(line));
  }
  const coinbaseState = view.coinbase.line.split(" · ").slice(1).join(" · ");
  const robinhoodState = view.robinhood.line.split(" · ").slice(1).join(" · ");
  const agentic = `Agentic trader · Coinbase ${coinbaseState} · Robinhood ${robinhoodState}`;
  return [view.coinbase.line, view.coinbase.cashLine, view.robinhood.line, view.robinhood.cashLine, agentic].filter(
    (line): line is string => Boolean(line && line.trim()),
  );
}

/** Card line. No cash amounts. */
export function tickerSyncLine(ticker: string, view: BrokerSyncView): string | null {
  const name = ticker.trim().toUpperCase();
  if (name === "XRP" || name === "SUI") {
    return `${view.coinbase.line} · ${view.robinhood.line}`;
  }
  if (AI_TICKERS.includes(name as (typeof AI_TICKERS)[number])) return view.equity.line;
  return null;
}

export function tickerSyncStale(ticker: string, view: BrokerSyncView): boolean {
  const name = ticker.trim().toUpperCase();
  if (name === "XRP" || name === "SUI") return view.coinbase.stale || view.robinhood.stale;
  if (AI_TICKERS.includes(name as (typeof AI_TICKERS)[number])) return view.equity.stale;
  return false;
}

export function brokerSyncResponse(view: BrokerSyncView) {
  const face = (mark: BrokerSyncMark) => ({
    status: mark.status,
    stale: mark.stale,
    syncedAt: mark.syncedAt,
  });
  return {
    ok: true as const,
    coinbase: face(view.coinbase),
    robinhood: face(view.robinhood),
    equity: face(view.equity),
  };
}

/**
 * Replace a sleeve quantity from a stored read.
 * Manual rows, the Flare vault, and RH Main stay as they are.
 * A ticker or sleeve that is not already on the book is ignored.
 */
export function applyBrokerPositions<T extends Record<string, readonly SleeveRow[]>>(
  books: T,
  positions: readonly { ticker: string; sleeveId: string; quantity: string }[],
): T {
  const next: Record<string, readonly SleeveRow[]> = { ...books };
  for (const position of positions) {
    const book = next[position.ticker];
    if (!book) continue;
    const quantity = normalizeDecimal(position.quantity);
    if (!quantity) continue;
    next[position.ticker] = book.map((sleeve) => {
      if (sleeve.id !== position.sleeveId) return sleeve;
      if (sleeve.manual || sleeve.id === "flare-vault" || sleeve.id === "rh-main") return sleeve;
      return { ...sleeve, quantity };
    });
  }
  return next as T;
}

export function safeSyncMessage(value: string): string {
  return value
    .replace(/organizations\/\S+/gi, "key")
    .replace(/rh-api-\S+/gi, "key")
    .replace(/-----BEGIN[\s\S]*?-----END [^-]+-----/g, "key")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
