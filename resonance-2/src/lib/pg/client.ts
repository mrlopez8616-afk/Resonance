import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { StorageUnavailableError } from "@/lib/storage-unavailable";

export type SqlStatement = {
  text: string;
  params?: readonly unknown[];
};

export type SqlClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  /**
   * Runs every statement on one connection and commits once.
   * In-memory suite clients omit this; the caller runs the statements in order.
   */
  transaction?(statements: readonly SqlStatement[]): Promise<Record<string, unknown>[][]>;
};

let override: SqlClient | null = null;
let cachedUrl: string | null = null;
let cached: SqlClient | null = null;
let warnedDirectNeon = false;
const DEFAULT_RETRY_DELAYS = [80, 200];
let retryDelays = [...DEFAULT_RETRY_DELAYS];

export function setSqlClientForTests(client: SqlClient | null): void {
  override = client;
  cached = null;
  cachedUrl = null;
}

/** Test hook. Null restores the default 80ms then 200ms gaps. */
export function setPostgresRetryDelaysForTests(delays: readonly number[] | null): void {
  retryDelays = delays ? [...delays] : [...DEFAULT_RETRY_DELAYS];
}

/**
 * pooled: host contains -pooler (the Neon pooler).
 * direct: a neon.tech host with no pooler.
 * The URL itself is not returned.
 */
export function databaseHostKind(databaseUrl: string): "loopback" | "pooled" | "direct" | "other" {
  if (isLoopbackPostgres(databaseUrl)) return "loopback";
  let host = "";
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return "other";
  }
  if (host.includes("-pooler")) return "pooled";
  if (host === "neon.tech" || host.endsWith(".neon.tech")) return "direct";
  return "other";
}

export function postgresFailureReason(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Postgres query failed.";
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted").slice(0, 400);
}

/** Loopback URLs use node-postgres. Neon hosts keep the serverless driver. */
export function isLoopbackPostgres(databaseUrl: string): boolean {
  try {
    const host = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function createPgClient(databaseUrl: string): SqlClient {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    allowExitOnIdle: true,
  });
  return {
    async query<T extends Record<string, unknown>>(
      text: string,
      params: readonly unknown[] = [],
    ): Promise<T[]> {
      const result = await pool.query(text, [...params]);
      return result.rows as T[];
    },
    async transaction(statements) {
      const client = await pool.connect();
      const results: Record<string, unknown>[][] = [];
      try {
        await client.query("BEGIN");
        for (const statement of statements) {
          const result = await client.query(statement.text, [...(statement.params ?? [])]);
          results.push(result.rows as Record<string, unknown>[]);
        }
        await client.query("COMMIT");
        return results;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

const NEON_QUERY_TIMEOUT_MS = 2500;

export function createNeonClient(databaseUrl: string): SqlClient {
  const sql = neon(databaseUrl);
  return {
    async query<T extends Record<string, unknown>>(
      text: string,
      params: readonly unknown[] = [],
    ): Promise<T[]> {
      const rows = await sql.query(text, [...params], {
        fetchOptions: { signal: AbortSignal.timeout(NEON_QUERY_TIMEOUT_MS) },
      });
      return rows as T[];
    },
    async transaction(statements) {
      const results = await sql.transaction((txn) =>
        statements.map((statement) => txn.query(statement.text, [...(statement.params ?? [])])),
      );
      return results as Record<string, unknown>[][];
    },
  };
}

export async function getSql(): Promise<SqlClient> {
  if (override) return override;
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) {
    throw new StorageUnavailableError("postgres", "DATABASE_URL is not set.");
  }
  if (cached && cachedUrl === url) return cached;
  if (!warnedDirectNeon && databaseHostKind(url) === "direct") {
    warnedDirectNeon = true;
    console.warn("postgres reads expect the pooled DATABASE_URL");
  }
  cachedUrl = url;
  cached = isLoopbackPostgres(url) ? createPgClient(url) : createNeonClient(url);
  return cached;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** SELECT only. An insert, update, or delete is not retried. */
export function isReadQuery(text: string): boolean {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " ").trim();
  if (!/^(select|with)\b/i.test(body)) return false;
  return !/\b(insert|update|delete|alter|create|drop|truncate)\b/i.test(body);
}

/**
 * A cold Neon compute fails the first fetch and answers the next one.
 * "connect failed" and missing relations are not that case.
 */
export function isTransientPostgresMessage(message: string): boolean {
  const text = message.toLowerCase();
  if (text.includes("database_url is not set")) return false;
  if (text.includes("does not exist")) return false;
  if (/\bconnect failed\b/.test(text)) return false;
  return (
    text.includes("fetch failed") ||
    text.includes("econnreset") ||
    text.includes("etimedout") ||
    text.includes("eai_again") ||
    text.includes("enetunreach") ||
    text.includes("socket hang up") ||
    text.includes("connection terminated") ||
    text.includes("connection closed") ||
    text.includes("other side closed") ||
    text.includes("und_err") ||
    text.includes("remaining connection slots") ||
    text.includes("too many clients") ||
    text.includes("too many connections") ||
    text.includes("control plane") ||
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("aborterror") ||
    text.includes("aborted") ||
    text.includes("network error") ||
    text.includes("bad gateway") ||
    text.includes("service unavailable") ||
    text.includes("rate limit") ||
    /\b502\b/.test(text) ||
    /\b503\b/.test(text) ||
    /\b429\b/.test(text)
  );
}

export async function sqlQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  const reads = isReadQuery(text);
  const gaps = reads ? retryDelays : [];
  let attempt = 0;
  for (;;) {
    try {
      const client = await getSql();
      return await client.query<T>(text, params);
    } catch (error) {
      if (error instanceof StorageUnavailableError && error.reason === "DATABASE_URL is not set.") {
        throw error;
      }
      const reason = error instanceof StorageUnavailableError ? error.reason : postgresFailureReason(error);
      if (attempt < gaps.length && isTransientPostgresMessage(reason)) {
        console.error("postgres query retry", reason);
        await delay(gaps[attempt] ?? 0);
        attempt += 1;
        continue;
      }
      console.error("postgres query failed", reason);
      throw error instanceof StorageUnavailableError ? error : new StorageUnavailableError("postgres", reason);
    }
  }
}

/** One commit for every statement. Clients without transaction() run them in order. */
export async function sqlTransaction(
  statements: readonly SqlStatement[],
): Promise<Record<string, unknown>[][]> {
  const client = await getSql();
  if (!client.transaction) {
    const results: Record<string, unknown>[][] = [];
    for (const statement of statements) {
      results.push(await sqlQuery(statement.text, statement.params ?? []));
    }
    return results;
  }
  try {
    return await client.transaction(statements);
  } catch (error) {
    if (error instanceof StorageUnavailableError) throw error;
    throw new StorageUnavailableError("postgres", postgresFailureReason(error));
  }
}
