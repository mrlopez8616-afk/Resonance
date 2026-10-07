import { sqlQuery } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

function errorText(error: unknown): string {
  if (isStorageUnavailable(error)) return error.reason;
  return error instanceof Error ? error.message : "";
}

export function splitSqlStatements(source: string): string[] {
  const withoutLineComments = source
    .split("\n")
    .map((line) => {
      const mark = line.indexOf("--");
      return mark === -1 ? line : line.slice(0, mark);
    })
    .join("\n");
  return withoutLineComments
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

async function viewExists(name: string): Promise<boolean> {
  const rows = await sqlQuery<{ table_name: string }>(
    `SELECT table_name FROM information_schema.views WHERE table_name = $1`,
    [name],
  );
  return rows.length > 0;
}

export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of EMBEDDED_MIGRATIONS) {
    const id = migration.id;
    const seen = await sqlQuery<{ id: string }>(
      `SELECT id FROM schema_migrations WHERE id = $1`,
      [id],
    ).catch((error: unknown) => {
      const message = errorText(error);
      if (/schema_migrations/i.test(message) && /does not exist|no such/i.test(message)) {
        return [] as { id: string }[];
      }
      throw error;
    });
    if (seen.length > 0) {
      skipped.push(id);
      continue;
    }

    for (const statement of splitSqlStatements(migration.sql)) {
      const view = /^CREATE VIEW\s+([a-z_][a-z0-9_]*)/i.exec(statement);
      if (view?.[1] && (await viewExists(view[1]).catch(() => false))) continue;
      try {
        await sqlQuery(statement);
      } catch (error) {
        if (view && /already exists/i.test(errorText(error))) continue;
        throw error;
      }
    }
    await sqlQuery(`INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [
      id,
    ]);
    applied.push(id);
  }

  return { applied, skipped };
}
