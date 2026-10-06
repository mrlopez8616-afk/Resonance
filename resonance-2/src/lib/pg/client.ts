import { neon } from "@neondatabase/serverless";
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
