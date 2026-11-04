import {
  balancesFromCoinbaseAccounts,
  coinbaseReadPath,
  ordersFromCoinbaseFills,
  positionsFromPortfolioList,
  type BrokerSnapshot,
} from "@/lib/broker-sync";
import { buildCoinbaseJwt, parseCoinbaseJson, parsePortfolioList } from "@/lib/coinbase-portfolio";

const HOST = "api.coinbase.com";

async function coinbaseGet(
  path: string,
  credentials: { keyName: string; keySecret: string },
  fetchImpl: typeof fetch,
): Promise<unknown> {
  if (!coinbaseReadPath(path)) throw new Error("refused");
  const token = buildCoinbaseJwt({
    keyName: credentials.keyName,
    keySecret: credentials.keySecret,
    method: "GET",
    path,
  });
  if (!token) throw new Error("unsigned");
  const response = await fetchImpl(`https://${HOST}${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseCoinbaseJson(await response.text());
}

/**
 * Advanced Trade read: portfolios, account cash, and recent fills.
 * GET only. The JWT is built for GET.
 */
export async function readCoinbaseSnapshot(input: {
  credentials: { keyName: string; keySecret: string };
  fetchImpl: typeof fetch;
}): Promise<BrokerSnapshot> {
  const listed = await coinbaseGet("/api/v3/brokerage/portfolios", input.credentials, input.fetchImpl);
  const portfolios = parsePortfolioList(listed);
  const breakdowns = new Map<string, unknown>(
    await Promise.all(
      portfolios.map(async (portfolio) => {
        const body = await coinbaseGet(
          `/api/v3/brokerage/portfolios/${portfolio.uuid}`,
          input.credentials,
          input.fetchImpl,
        );
        return [portfolio.uuid, body] as const;
      }),
    ),
  );
  const positions = positionsFromPortfolioList(listed, breakdowns);
  if (!positions) throw new Error("unreadable holdings");
  let balancesUnread = false;
  let balances = [] as BrokerSnapshot["balances"];
  try {
    const accounts = await coinbaseGet(
      "/api/v3/brokerage/accounts?limit=250",
      input.credentials,
      input.fetchImpl,
    );
    const parsed = balancesFromCoinbaseAccounts(accounts);
    if (!parsed) balancesUnread = true;
    else balances = parsed;
  } catch {
    balancesUnread = true;
  }
  let ordersUnread = false;
  let orders = [] as BrokerSnapshot["orders"];
  try {
    const fills = await coinbaseGet(
      "/api/v3/brokerage/orders/historical/fills?limit=50",
      input.credentials,
      input.fetchImpl,
    );
    const parsed = ordersFromCoinbaseFills(fills);
    if (!parsed) ordersUnread = true;
    else orders = parsed;
  } catch {
    ordersUnread = true;
  }
  return { positions, balances, orders, ordersUnread, balancesUnread };
}
