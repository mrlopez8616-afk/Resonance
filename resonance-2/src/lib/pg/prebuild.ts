import { redactConnectionDetails } from "@/lib/pg/client";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export type MigrateResult = { applied: string[]; skipped: string[] };

type EnvLike = Record<string, string | undefined>;

/**
 * Production builds apply migrations. Preview and local builds do not:
 * preview deployments share the production database.
 */
export function shouldMigrateOnBuild(env: EnvLike): boolean {
  return env.VERCEL_ENV === "production" && Boolean(env.DATABASE_URL?.trim());
}

export function formatMigrationLog(result: MigrateResult): string[] {
  const names = (ids: string[]) =>
    ids.map((id) => (id.endsWith(".sql") ? id : `${id}.sql`)).join(", ");
  return [
    `db:migrate applied: ${names(result.applied) || "(none)"}`,
    `db:migrate skipped: ${names(result.skipped) || "(none)"}`,
  ];
}

export async function runProductionMigrate(options: {
  env: EnvLike;
  migrate: () => Promise<MigrateResult>;
  log?: (line: string) => void;
  error?: (line: string) => void;
}): Promise<number> {
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  if (!shouldMigrateOnBuild(options.env)) {
    log(
      options.env.VERCEL_ENV === "production"
        ? "db:migrate skipped: DATABASE_URL is unset"
        : "db:migrate skipped: not a production build",
    );
    return 0;
  }
  try {
    const result = await options.migrate();
    for (const line of formatMigrationLog(result)) log(line);
    return 0;
  } catch (err) {
    const message = isStorageUnavailable(err)
      ? err.reason
      : err instanceof Error
        ? err.message
        : "migrate failed";
    error(redactConnectionDetails(message));
    return 1;
  }
}
