export type StoreBackendName = "postgres" | "blob" | "file" | "none";
export type EnvLike = Record<string, string | undefined>;

/**
 * Postgres wins when DATABASE_URL is set, including on Vercel where the
 * Blob token is still present. Otherwise the Blob, file, and seed fallback
 * is unchanged.
 */
export function detectStoreBackend(env: EnvLike, fileEnvKey: string): StoreBackendName {
  if (env.DATABASE_URL?.trim()) return "postgres";
  if (env.BLOB_READ_WRITE_TOKEN?.trim()) return "blob";
  if (env[fileEnvKey]?.trim()) return "file";
  if (env.VERCEL) return "none";
  return "file";
}
