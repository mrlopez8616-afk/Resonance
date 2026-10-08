import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { StorageUnavailableError } from "@/lib/storage-unavailable";

export type SqlClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
};

let override: SqlClient | null = null;
let cachedUrl: string | null = null;
let cached: SqlClient | null = null;

export function setSqlClientForTests(client: SqlClient | null): void {
  override = client;
  cached = null;
  cachedUrl = null;
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
  };
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
  cached = isLoopbackPostgres(url) ? createPgClient(url) : createNeonClient(url);
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
