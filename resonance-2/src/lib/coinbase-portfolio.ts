import { createPrivateKey, randomBytes, sign, type KeyObject } from "node:crypto";
import { addDecimal, isDecimalString } from "@/lib/decimal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST = "api.coinbase.com";

export type CoinbasePortfolioRef = {
  uuid: string;
  name: string;
  type: string;
};

export type SuiSleeveQuantities = {
  coinbase: string;
  cbAgentic: string;
};

export type StoredSuiBalance = SuiSleeveQuantities & {
  asOf: string;
};

export type SuiBalanceResolution = {
  /** Null when neither a live read, a stored read, nor a real sleeve print exists. */
  quantities: SuiSleeveQuantities | null;
  fresh: boolean;
  asOf: string | null;
};

type JwtInput = {
  keyName: string;
  keySecret: string;
  method: string;
  path: string;
  nowSeconds?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Keep the digits Coinbase sent. JSON.parse would turn them into binary floats. */
export function preserveBalanceLiterals(raw: string): string {
  return raw.replace(
    /("total_balance_crypto"\s*:\s*)(-?\d+(?:\.\d+)?)(?=\s*[,}\]])/g,
    '$1"$2"',
  );
}

export function parseCoinbaseJson(raw: string): unknown {
  return JSON.parse(preserveBalanceLiterals(raw)) as unknown;
}

export function normalizeDecimal(value: string): string | null {
  const trimmed = value.trim();
  if (!isDecimalString(trimmed) || trimmed.startsWith("-")) return null;
  return addDecimal(trimmed, "0");
}

export function decimalFromApiValue(value: unknown): string | null {
  if (typeof value === "string") return normalizeDecimal(value);
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const text = value.toString();
  if (!isDecimalString(text) || Number(text) !== value) return null;
  return normalizeDecimal(text);
}

export function isDefaultPortfolio(portfolio: { name: string; type: string }): boolean {
  return (
    portfolio.type.trim().toUpperCase() === "DEFAULT" ||
    portfolio.name.trim().toLowerCase() === "default"
  );
}

/** Default holdings, including stake, land on `coinbase`. The Agentic portfolio lands on `cb-agentic`. */
export function sleeveForCoinbasePortfolio(portfolio: { name: string; type: string }): "coinbase" | "cb-agentic" {
  if (isDefaultPortfolio(portfolio)) return "coinbase";
  const name = portfolio.name.trim().toLowerCase();
  const type = portfolio.type.trim().toUpperCase();
  if (name === "agentic" || type === "CONSUMER") return "cb-agentic";
  return "coinbase";
}

export function parsePortfolioList(body: unknown): CoinbasePortfolioRef[] {
  const root = asRecord(body);
  const rows = Array.isArray(root?.portfolios) ? root.portfolios : Array.isArray(body) ? body : [];
  const out: CoinbasePortfolioRef[] = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item || item.deleted === true) continue;
    const uuid = textField(item.uuid);
    if (!UUID.test(uuid)) continue;
    out.push({
      uuid,
      name: textField(item.name),
      type: textField(item.type),
    });
  }
  return out;
}

/**
 * Sum SUI `total_balance_crypto` on one breakdown.
 * Staked and liquid rows both count. Other assets are ignored.
 * A readable breakdown with no SUI row is a real zero.
 * An unreadable SUI row is null, so the caller does not invent a quantity.
 */
export function suiQuantityFromBreakdown(body: unknown): string | null {
  const root = asRecord(body);
  const breakdown = asRecord(root?.breakdown) ?? root;
  const positions = breakdown?.spot_positions;
  if (!Array.isArray(positions)) return null;
  let sum = "0";
  for (const row of positions) {
    const item = asRecord(row);
    if (!item) continue;
    if (textField(item.asset).toUpperCase() !== "SUI") continue;
    const qty = decimalFromApiValue(item.total_balance_crypto);
    if (qty === null) return null;
    sum = addDecimal(sum, qty);
  }
  return sum;
}

export function suiSleeveQuantities(
  portfolios: readonly CoinbasePortfolioRef[],
  breakdownByUuid: ReadonlyMap<string, unknown>,
): SuiSleeveQuantities | null {
  if (!portfolios.some((portfolio) => isDefaultPortfolio(portfolio))) return null;
  let coinbase = "0";
  let cbAgentic = "0";
  for (const portfolio of portfolios) {
    if (!breakdownByUuid.has(portfolio.uuid)) return null;
    const qty = suiQuantityFromBreakdown(breakdownByUuid.get(portfolio.uuid));
    if (qty === null) return null;
    if (sleeveForCoinbasePortfolio(portfolio) === "cb-agentic") {
      cbAgentic = addDecimal(cbAgentic, qty);
    } else {
      coinbase = addDecimal(coinbase, qty);
    }
  }
  return { coinbase, cbAgentic };
}

function b64url(value: Buffer): string {
  return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemSecret(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.includes("\\n") && !trimmed.includes("\n")) return trimmed.replace(/\\n/g, "\n");
  return trimmed;
}

function ed25519Key(secret: string): KeyObject | null {
  let decoded: Buffer;
  try {
    decoded = Buffer.from(secret.trim(), "base64");
  } catch {
    return null;
  }
  if (decoded.length !== 64) return null;
  const seed = decoded.subarray(0, 32);
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  try {
    return createPrivateKey({ key: Buffer.concat([prefix, seed]), format: "der", type: "pkcs8" });
  } catch {
    return null;
  }
}

function signingKey(secret: string): { key: KeyObject; alg: "ES256" | "EdDSA" } | null {
  const pem = pemSecret(secret);
  if (pem.includes("BEGIN")) {
    try {
      return { key: createPrivateKey(pem), alg: "ES256" };
    } catch {
      return null;
    }
  }
  const ed = ed25519Key(pem);
  return ed ? { key: ed, alg: "EdDSA" } : null;
}

/** CDP JWT for one request. Null when the secret cannot sign. The secret is not returned. */
export function buildCoinbaseJwt(input: JwtInput): string | null {
  const keyName = input.keyName.trim();
  const path = input.path.startsWith("/") ? input.path : `/${input.path}`;
  if (!keyName || !path.startsWith("/api/")) return null;
  const material = signingKey(input.keySecret);
  if (!material) return null;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header: Record<string, string> = {
    alg: material.alg,
    typ: "JWT",
    kid: keyName,
    nonce: randomBytes(16).toString("hex"),
  };
  const payload: Record<string, unknown> = {
    sub: keyName,
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    uri: `${input.method.toUpperCase()} ${HOST}${path}`,
  };
  if (material.alg === "EdDSA") payload.aud = ["cdp_service"];
  const signingInput = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  try {
    const signature = sign(
      material.alg === "ES256" ? "sha256" : null,
      Buffer.from(signingInput),
      material.alg === "ES256" ? { key: material.key, dsaEncoding: "ieee-p1363" } : material.key,
    );
    return `${signingInput}.${b64url(signature)}`;
  } catch {
    return null;
  }
}

export function readCoinbaseCredentials(
  env: Record<string, string | undefined> = process.env,
): { keyName: string; keySecret: string } | null {
  const keyName = env.COINBASE_API_KEY_NAME?.trim() ?? "";
  const keySecret = env.COINBASE_API_KEY_SECRET ?? "";
  if (!keyName || !keySecret.trim()) return null;
  return { keyName, keySecret };
}

export function applySuiCoinbaseQuantities<T extends { id: string; quantity: string }>(
  sleeves: readonly T[],
  quantities: SuiSleeveQuantities,
): T[] {
  return sleeves.map((sleeve) => {
    if (sleeve.id === "coinbase") return { ...sleeve, quantity: quantities.coinbase };
    if (sleeve.id === "cb-agentic") return { ...sleeve, quantity: quantities.cbAgentic };
    return sleeve;
  });
}

export function overlaySuiBook<T extends { SUI: readonly { id: string; quantity: string }[] }>(
  books: T,
  quantities: SuiSleeveQuantities,
): T {
  return { ...books, SUI: applySuiCoinbaseQuantities(books.SUI, quantities) };
}

function staleResolution(
  stored: StoredSuiBalance | null,
  fallback: { coinbase: string | null; cbAgentic: string | null },
): SuiBalanceResolution {
  const storedCoinbase = stored ? normalizeDecimal(stored.coinbase) : null;
  const storedAgentic = stored ? normalizeDecimal(stored.cbAgentic) : null;
  if (stored && storedCoinbase && storedAgentic && stored.asOf.trim()) {
    return {
      quantities: { coinbase: storedCoinbase, cbAgentic: storedAgentic },
      fresh: false,
      asOf: stored.asOf,
    };
  }
  const coinbase = fallback.coinbase ? normalizeDecimal(fallback.coinbase) : null;
  const cbAgentic = fallback.cbAgentic ? normalizeDecimal(fallback.cbAgentic) : null;
  if (coinbase && cbAgentic) {
    return { quantities: { coinbase, cbAgentic }, fresh: false, asOf: null };
  }
  return { quantities: null, fresh: false, asOf: null };
}

async function coinbaseGet(
  path: string,
  credentials: { keyName: string; keySecret: string },
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const token = buildCoinbaseJwt({
    keyName: credentials.keyName,
    keySecret: credentials.keySecret,
    method: "GET",
    path,
  });
  if (!token) throw new Error("unsigned");
  const response = await fetchImpl(`https://${HOST}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await response.text();
  return parseCoinbaseJson(raw);
}

/**
 * Live SUI from every portfolio breakdown. On any miss, the stored read,
 * then the sleeve print. Never substitutes a made-up quantity.
 */
export async function resolveSuiCoinbaseBalance(input: {
  fallback: { coinbase: string | null; cbAgentic: string | null };
  credentials: { keyName: string; keySecret: string } | null;
  now: Date;
  fetchImpl: typeof fetch;
  stored: StoredSuiBalance | null;
  save: (row: StoredSuiBalance) => Promise<void>;
}): Promise<SuiBalanceResolution> {
  const credentials = input.credentials;
  const stale = staleResolution(input.stored, input.fallback);
  if (!credentials) return stale;
  try {
    const listed = parsePortfolioList(
      await coinbaseGet("/api/v3/brokerage/portfolios", credentials, input.fetchImpl),
    );
    if (!listed.some((portfolio) => isDefaultPortfolio(portfolio))) throw new Error("no default");
    const breakdowns = new Map<string, unknown>(
      await Promise.all(
        listed.map(async (portfolio) => {
          const body = await coinbaseGet(
            `/api/v3/brokerage/portfolios/${portfolio.uuid}`,
            credentials,
            input.fetchImpl,
          );
          return [portfolio.uuid, body] as const;
        }),
      ),
    );
    const quantities = suiSleeveQuantities(listed, breakdowns);
    if (!quantities) throw new Error("unreadable");
    const row: StoredSuiBalance = { ...quantities, asOf: input.now.toISOString() };
    try {
      await input.save(row);
    } catch {
      // The live quantity still stands for this read.
    }
    return { quantities, fresh: true, asOf: row.asOf };
  } catch {
    return stale;
  }
}
