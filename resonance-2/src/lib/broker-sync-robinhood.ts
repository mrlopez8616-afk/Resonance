import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import {
  balancesFromRobinhoodAccounts,
  ordersFromRobinhood,
  parseBrokerJson,
  positionsFromRobinhoodHoldings,
  robinhoodReadPath,
  type BrokerSnapshot,
} from "@/lib/broker-sync";

const HOST = "https://trading.robinhood.com";

function ed25519Key(secret: string): KeyObject | null {
  const compact = secret.trim().replace(/\s+/g, "");
  let decoded: Buffer;
  try {
    decoded = Buffer.from(compact, "base64");
  } catch {
    return null;
  }
  const seed = decoded.length === 64 ? decoded.subarray(0, 32) : decoded;
  if (seed.length !== 32) return null;
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  try {
    return createPrivateKey({ key: Buffer.concat([prefix, seed]), format: "der", type: "pkcs8" });
  } catch {
    return null;
  }
}

/** Ed25519 signature, standard base64. Null when the seed cannot sign. */
export function signRobinhoodMessage(privateKey: string, message: string): string | null {
  const key = ed25519Key(privateKey);
  if (!key) return null;
  try {
    return sign(null, Buffer.from(message), key).toString("base64");
  } catch {
    return null;
  }
}

export function robinhoodReadHeaders(input: {
  apiKey: string;
  privateKey: string;
  path: string;
  timestamp: string;
}): { "x-api-key": string; "x-signature": string; "x-timestamp": string } | null {
  if (!robinhoodReadPath(input.path)) return null;
  const signature = signRobinhoodMessage(
    input.privateKey,
    `${input.apiKey}${input.timestamp}${input.path}GET`,
  );
  if (!signature) return null;
  return {
    "x-api-key": input.apiKey,
    "x-signature": signature,
    "x-timestamp": input.timestamp,
  };
}

async function robinhoodGet(
  path: string,
  credentials: { apiKey: string; privateKey: string },
  fetchImpl: typeof fetch,
  nowSeconds: number,
): Promise<unknown> {
  const headers = robinhoodReadHeaders({
    apiKey: credentials.apiKey,
    privateKey: credentials.privateKey,
    path,
    timestamp: String(nowSeconds),
  });
  if (!headers) throw new Error("refused");
  const response = await fetchImpl(`${HOST}${path}`, {
    method: "GET",
    headers: { ...headers, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseBrokerJson(await response.text());
}

function nextPath(body: unknown): string | null {
  const root = body && typeof body === "object" ? (body as { next?: unknown }) : null;
  const next = typeof root?.next === "string" ? root.next.trim() : "";
  if (!next) return null;
  try {
    const url = new URL(next, HOST);
    const path = `${url.pathname}${url.search}`;
    return robinhoodReadPath(path) ? path : null;
  } catch {
    return null;
  }
}

async function readPages(
  path: string,
  credentials: { apiKey: string; privateKey: string },
  fetchImpl: typeof fetch,
  nowSeconds: number,
): Promise<unknown> {
  const first = await robinhoodGet(path, credentials, fetchImpl, nowSeconds);
  const results: unknown[] = [];
  const take = (body: unknown) => {
    const rows = body && typeof body === "object" ? (body as { results?: unknown }).results : null;
    if (Array.isArray(rows)) results.push(...rows);
  };
  take(first);
  let cursor = nextPath(first);
  for (let page = 0; page < 2 && cursor; page += 1) {
    const body = await robinhoodGet(cursor, credentials, fetchImpl, nowSeconds);
    take(body);
    cursor = nextPath(body);
  }
  return { results };
}

/**
 * Official crypto read API: accounts, holdings, and orders.
 * Share positions are not part of this API. GET only.
 */
export async function readRobinhoodSnapshot(input: {
  credentials: { apiKey: string; privateKey: string };
  fetchImpl: typeof fetch;
  nowSeconds?: number;
}): Promise<BrokerSnapshot> {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const holdings = await readPages(
    "/api/v1/crypto/trading/holdings/",
    input.credentials,
    input.fetchImpl,
    nowSeconds,
  );
  const positions = positionsFromRobinhoodHoldings(holdings);
  if (!positions) throw new Error("unreadable holdings");
  let balancesUnread = false;
  let balances = [] as BrokerSnapshot["balances"];
  try {
    const accounts = await robinhoodGet(
      "/api/v1/crypto/trading/accounts/",
      input.credentials,
      input.fetchImpl,
      nowSeconds,
    );
    const parsed = balancesFromRobinhoodAccounts(accounts);
    if (!parsed) balancesUnread = true;
    else balances = parsed;
  } catch {
    balancesUnread = true;
  }
  let ordersUnread = false;
  let orders = [] as BrokerSnapshot["orders"];
  try {
    const listed = await readPages(
      "/api/v1/crypto/trading/orders/?limit=50",
      input.credentials,
      input.fetchImpl,
      nowSeconds,
    );
    const parsed = ordersFromRobinhood(listed);
    if (!parsed) ordersUnread = true;
    else orders = parsed;
  } catch {
    ordersUnread = true;
  }
  return { positions, balances, orders, ordersUnread, balancesUnread };
}
