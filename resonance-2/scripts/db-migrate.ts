/**
 * Apply db/migrations. Idempotent. Requires DATABASE_URL (pooled Neon URL).
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 */
import { redactConnectionDetails } from "../src/lib/pg/client";
import { migrate } from "../src/lib/pg/migrate";
import { isStorageUnavailable } from "../src/lib/storage-unavailable";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set. Connect Neon, then run db:migrate.");
    process.exit(1);
  }
  try {
    const result = await migrate();
    console.log(JSON.stringify(result));
  } catch (error) {
    const reason = redactConnectionDetails(
      isStorageUnavailable(error)
        ? error.reason
        : error instanceof Error
          ? error.message
          : "migrate failed",
    );
    console.error(reason);
    process.exit(1);
  }
}

void main();
