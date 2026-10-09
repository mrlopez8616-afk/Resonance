import { sqlQuery, sqlTransaction } from "@/lib/pg/client";
import { EMBEDDED_MIGRATIONS } from "@/lib/pg/embedded-migrations";
import { patchRetaggedFillPayloads } from "@/lib/pg/fill-source-dedupe";
import { SUI_AGENTIC_BUY_ORDER, patchSuiAgenticBuyPayload } from "@/lib/pg/sui-sleeve-fix";
import { XRP_AGENTIC_SELL_ORDER, patchXrpAgenticSellPayload } from "@/lib/pg/xrp-sleeve-fix";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

/** Coinbase SUI buys inserted by 013. Logging only; the SQL is the guard. */
const SUI_COINBASE_BACKFILL_ORDERS = [
  "6bab89a3-fdbb-4768-92f4-dbb5654bf1f3",
  "4ef87d64-62b4-42f1-ac48-7db6941d5ba8",
] as const;

function errorText(error: unknown): string {
  if (isStorageUnavailable(error)) return error.reason;
  return error instanceof Error ? error.message : "";
}

function logFillKeyDedupe(statement: string, rows: Record<string, unknown>[]): void {
  if (/^DELETE\b/i.test(statement)) {
    for (const row of rows) {
      console.log(
        `019_dedupe_fill_keys: deleted id ${row.id} source ${row.source} external_id ${row.external_id}`,
      );
    }
    return;
  }
  if (statement.includes("INSERT INTO fills_dedupe_backup")) {
    for (const row of rows) {
      console.log(
        `019_dedupe_fill_keys: backed up id ${row.id} source ${row.source} external_id ${row.external_id}`,
      );
    }
    return;
  }
  if (statement.includes("manual_review_order_id")) {
    for (const row of rows) {
      console.warn(
        `019_dedupe_fill_keys: manual review order ${row.manual_review_order_id} has ${row.row_count} rows`,
      );
    }
  }
}

function logRetaggedFillStatement(statement: string, rows: Record<string, unknown>[]): void {
  if (/^DELETE\b/i.test(statement)) {
    console.log(`015_dedupe_retagged_fills: deleted ${rows.length} seed row(s)`);
    return;
  }
  if (/SET source = 'robinhood'/i.test(statement)) {
    console.log(`015_dedupe_retagged_fills: retagged ${rows.length} seed row(s)`);
    return;
  }
  if (/SET sleeve = 'rh-agentic'/i.test(statement)) {
    console.log(`015_dedupe_retagged_fills: repaired ${rows.length} robinhood row(s)`);
    return;
  }
  if (statement.includes("multi_source_external_ids")) {
    const count = rows[0]?.multi_source_external_ids ?? rows.length;
    console.log(`015_dedupe_retagged_fills: multi-source external_ids ${count}`);
  }
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

/**
 * Numeric filename order. 006 may be absent while 007 is present.
 * A gap is not an error and does not block a later file.
 */
export function migrationIdsInOrder(ids: readonly string[]): string[] {
  return [...ids].sort((left, right) => {
    const leftNumber = /^(\d+)/.exec(left)?.[1];
    const rightNumber = /^(\d+)/.exec(right)?.[1];
    if (leftNumber && rightNumber && leftNumber !== rightNumber) {
      return Number(leftNumber) - Number(rightNumber);
    }
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
}

/**
 * Applies migrations in the order given.
 * An id already stored in schema_migrations is skipped.
 * Numbers do not have to be contiguous: 005 runs when 004 is absent,
 * and a later deploy that adds 004 applies only that missing id.
 */
export async function applyMigrations(
  migrations: readonly { id: string; sql: string }[],
): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrations) {
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

    if (id === "019_dedupe_fill_keys") {
      const statements = splitSqlStatements(migration.sql);
      const batches = await sqlTransaction(statements.map((text) => ({ text })));
      statements.forEach((statement, index) => {
        logFillKeyDedupe(statement, batches[index] ?? []);
      });
      await sqlQuery(`INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [
        id,
      ]);
      applied.push(id);
      continue;
    }

    if (id === "020_sui_cb_agentic_transfer") {
      const statements = splitSqlStatements(migration.sql);
      const batches = await sqlTransaction(statements.map((text) => ({ text })));
      const row = batches[0]?.[0] ?? {};
      const transferRows = Number(row.transfer_rows ?? 0);
      const fromRows = Number(row.from_rows ?? 0);
      const toRows = Number(row.to_rows ?? 0);
      if (transferRows === 0 && fromRows === 0 && toRows === 0) {
        console.warn("020_sui_cb_agentic_transfer: guard not met: manual review");
      } else {
        console.log(
          `020_sui_cb_agentic_transfer: transfer ${transferRows} from ${fromRows} to ${toRows}`,
        );
      }
      await sqlQuery(`INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [
        id,
      ]);
      applied.push(id);
      continue;
    }

    if (id === "021_xrp_vault_reward") {
      const statements = splitSqlStatements(migration.sql);
      const batches = await sqlTransaction(statements.map((text) => ({ text })));
      const row = batches[0]?.[0] ?? {};
      const rewardRows = Number(row.reward_rows ?? 0);
      const vaultRows = Number(row.vault_rows ?? 0);
      if (rewardRows === 0 && vaultRows === 0) {
        console.warn("021_xrp_vault_reward: guard not met: manual review");
      } else {
        console.log(`021_xrp_vault_reward: reward ${rewardRows} vault ${vaultRows}`);
      }
      await sqlQuery(`INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [
        id,
      ]);
      applied.push(id);
      continue;
    }

    for (const statement of splitSqlStatements(migration.sql)) {
      const view = /^CREATE VIEW\s+([a-z_][a-z0-9_]*)/i.exec(statement);
      if (view?.[1] && (await viewExists(view[1]).catch(() => false))) continue;
      try {
        const rows = await sqlQuery(statement);
        if (id === "011_xrp_agentic_sleeve" && statement.includes(XRP_AGENTIC_SELL_ORDER)) {
          console.log(`011_xrp_agentic_sleeve: updated ${rows.length} fill row(s)`);
        }
        if (id === "012_sui_agentic_sleeve" && statement.includes(SUI_AGENTIC_BUY_ORDER)) {
          console.log(`012_sui_agentic_sleeve: updated ${rows.length} fill row(s)`);
        }
        if (
          id === "013_sui_coinbase_backfill" &&
          SUI_COINBASE_BACKFILL_ORDERS.some((orderId) => statement.includes(orderId))
        ) {
          console.log(`013_sui_coinbase_backfill: inserted ${rows.length} fill row(s)`);
        }
        if (id === "014_cb_agentic_xrp" && statement.includes("'cb-agentic'")) {
          console.log(`014_cb_agentic_xrp: inserted ${rows.length} sleeve row(s)`);
        }
        if (id === "015_dedupe_retagged_fills") {
          logRetaggedFillStatement(statement, rows);
        }
      } catch (error) {
        if (view && /already exists/i.test(errorText(error))) continue;
        throw error;
      }
    }
    if (id === "011_xrp_agentic_sleeve") {
      await patchXrpAgenticSellPayload();
    }
    if (id === "012_sui_agentic_sleeve") {
      await patchSuiAgenticBuyPayload();
    }
    if (id === "015_dedupe_retagged_fills") {
      await patchRetaggedFillPayloads();
    }
    await sqlQuery(`INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [
      id,
    ]);
    applied.push(id);
  }

  return { applied, skipped };
}

/** Sorts by numeric prefix, then applies. A missing number does not block later ids. */
export async function migrateMigrations(
  migrations: readonly { id: string; sql: string }[],
): Promise<{ applied: string[]; skipped: string[] }> {
  const byId = new Map(migrations.map((migration) => [migration.id, migration]));
  const ordered = migrationIdsInOrder([...byId.keys()]).flatMap((id) => {
    const migration = byId.get(id);
    return migration ? [migration] : [];
  });
  return applyMigrations(ordered);
}

export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  return migrateMigrations(EMBEDDED_MIGRATIONS);
}
