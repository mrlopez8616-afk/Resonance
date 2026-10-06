import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSqlTransaction, type SqlRunner } from "@/lib/pg/client";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../db/migrations",
);

/**
 * Transaction-scoped lock key. Session locks do not survive Neon's pooled
 * connections, so migrate holds `pg_advisory_xact_lock` until COMMIT.
 */
export const MIGRATION_ADVISORY_LOCK_KEY = 872341;

export function migrationLockStatement(): string {
  return `SELECT pg_advisory_xact_lock(${MIGRATION_ADVISORY_LOCK_KEY}::bigint)`;
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

export async function listMigrationIds(): Promise<string[]> {
  const names = await readdir(MIGRATIONS_DIR);
  return names
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => name.replace(/\.sql$/, ""));
}

async function relationExists(query: SqlRunner, name: string): Promise<boolean> {
  const rows = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
    [name],
  );
  return rows.length > 0;
}

export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  return withSqlTransaction(async (query) => {
    await query(migrationLockStatement());
    const ids = await listMigrationIds();
    const applied: string[] = [];
    const skipped: string[] = [];
    const book = await relationExists(query, "schema_migrations");

    for (const id of ids) {
      if (book) {
        const seen = await query<{ id: string }>(
          `SELECT id FROM schema_migrations WHERE id = $1`,
          [id],
        );
        if (seen.length > 0) {
          skipped.push(id);
          continue;
        }
      }

      const source = await readFile(path.join(MIGRATIONS_DIR, `${id}.sql`), "utf8");
      for (const statement of splitSqlStatements(source)) {
        const view = /^CREATE VIEW\s+([a-z_][a-z0-9_]*)/i.exec(statement);
        if (view?.[1] && (await relationExists(query, view[1]))) continue;
        await query(statement);
      }
      await query(`INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [
        id,
      ]);
      applied.push(id);
    }

    return { applied, skipped };
  });
}
