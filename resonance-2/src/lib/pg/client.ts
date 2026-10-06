import { neon, Pool, neonConfig } from "@neondatabase/serverless";
import { StorageUnavailableError } from "@/lib/storage-unavailable";

export type SqlRunner = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
) => Promise<T[]>;

export type SqlClient = {
  query: SqlRunner;
};

let override: SqlClient | null = null;
let cachedUrl: string | null = null;
let cached: SqlClient | null = null;

export function setSqlClientForTests(client: SqlClient | null): void {
  override = client;
  cached = null;
  cachedUrl = null;
}

/** Strip connection strings and Neon hostnames before anything is logged or returned. */
export function redactConnectionDetails(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted")
    .replace(/https?:\/\/\S+/gi, "https://redacted")
    .replace(/\b(?:[\w-]+\.)*neon\.tech\b/gi, "redacted-host");
}

export function postgresFailureReason(error: unknown): string {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Postgres query failed.";
  return redactConnectionDetails(message).slice(0, 400);
}

export function createNeonClient(databaseUrl: string): SqlClient {
  const sql = neon(databaseUrl);
  return {
    async query<T extends Record<string, unknown>>(
      text: string,
      params: readonly unknown[] = [],
    ): Promise<T[]> {
      const rows = await sql.query(text, [...params]);
      return rows as T[];
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
  cachedUrl = url;
  cached = createNeonClient(url);
  return cached;
}

export async function sqlQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  try {
    const client = await getSql();
    return await client.query<T>(text, params);
  } catch (error) {
    if (error instanceof StorageUnavailableError) throw error;
    throw new StorageUnavailableError("postgres", postgresFailureReason(error));
  }
}

type SqlSession = {
  query: SqlRunner;
  close: () => Promise<void>;
};

function ensureWebSocket(): void {
  if (neonConfig.webSocketConstructor) return;
  if (typeof globalThis.WebSocket === "function") {
    neonConfig.webSocketConstructor = globalThis.WebSocket;
  }
}

/**
 * One connection for the whole callback. The HTTP `neon()` client cannot hold
 * a transaction, and a session advisory lock is dropped by Neon's pooled
 * (PgBouncer transaction-mode) connections. `pg_advisory_xact_lock` is held
 * until COMMIT on this connection.
 */
export async function withSqlTransaction<T>(fn: (query: SqlRunner) => Promise<T>): Promise<T> {
  const session = await openSession();
  const query: SqlRunner = async <T extends Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ) => {
    try {
      return (await session.query(text, params)) as T[];
    } catch (error) {
      if (error instanceof StorageUnavailableError) throw error;
      throw new StorageUnavailableError("postgres", postgresFailureReason(error));
    }
  };
  try {
    await query("BEGIN");
    try {
      const result = await fn(query);
      await query("COMMIT");
      return result;
    } catch (error) {
      await session.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  } finally {
    await session.close();
  }
}

async function openSession(): Promise<SqlSession> {
  if (override) {
    const client = override;
    return {
      query: <T extends Record<string, unknown>>(text: string, params?: readonly unknown[]) =>
        client.query<T>(text, params),
      close: async () => {},
    };
  }
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) {
    throw new StorageUnavailableError("postgres", "DATABASE_URL is not set.");
  }
  ensureWebSocket();
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const client = await pool.connect();
    return {
      async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
        const result = await client.query(text, [...params]);
        return (result.rows ?? []) as T[];
      },
      async close() {
        client.release();
        await pool.end();
      },
    };
  } catch (error) {
    await pool.end().catch(() => undefined);
    if (error instanceof StorageUnavailableError) throw error;
    throw new StorageUnavailableError("postgres", postgresFailureReason(error));
  }
}
