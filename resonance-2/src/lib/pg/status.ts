import { detectBetsBackend } from "@/lib/bets-store-core";
import { redactConnectionDetails, sqlQuery } from "@/lib/pg/client";
import { listMigrationIds } from "@/lib/pg/migrate";
import { isStorageUnavailable } from "@/lib/storage-unavailable";

export type StorageStatus = {
  backend: "postgres" | "blob" | "file";
  schema: {
    migrated: boolean;
    applied: number;
    pending: string[];
  };
  reachable: boolean;
};

function emptySchema(pending: string[]): StorageStatus["schema"] {
  return { migrated: false, applied: 0, pending };
}

/**
 * Public shape for GET /api/storage/status. Never includes a connection
 * string, host, or driver error.
 */
export async function readStorageStatus(): Promise<StorageStatus> {
  const detected = detectBetsBackend();
  const pending = await listMigrationIds();
  if (detected === "blob") {
    return { backend: "blob", schema: emptySchema(pending), reachable: true };
  }
  if (detected !== "postgres") {
    return {
      backend: "file",
      schema: emptySchema(pending),
      reachable: detected === "file",
    };
  }

  try {
    await sqlQuery("SELECT 1 AS ok");
    const tables = await sqlQuery<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'schema_migrations'`,
    );
    const appliedIds =
      tables.length === 0
        ? []
        : (await sqlQuery<{ id: string }>(`SELECT id FROM schema_migrations`)).map((row) => row.id);
    const known = new Set(appliedIds);
    const appliedNames = pending.filter((id) => known.has(id));
    const stillPending = pending.filter((id) => !known.has(id));
    return {
      backend: "postgres",
      schema: {
        migrated: stillPending.length === 0,
        applied: appliedNames.length,
        pending: stillPending,
      },
      reachable: true,
    };
  } catch (error) {
    const reason = isStorageUnavailable(error)
      ? error.reason
      : error instanceof Error
        ? error.message
        : "postgres unreachable";
    console.error("storage status unreachable", redactConnectionDetails(reason));
    return {
      backend: "postgres",
      schema: emptySchema(pending),
      reachable: false,
    };
  }
}
